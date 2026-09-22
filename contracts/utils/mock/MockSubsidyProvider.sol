pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../interfaces/ISubsidyProvider.sol";

/**
 * @title MockSubsidyProvider
 * @dev Reference SAFE subsidy provider used by the escrow tests. It models everything a correct
 *      provider must do (per ISubsidyProvider NatSpec):
 *        (a) require(msg.sender == escrow),
 *        (b) gate node / payer / jobType,
 *        (c) decrement a PERSISTED budget per call (the escrow calls once per list entry),
 *      and it approves the escrow just-in-time for subsidy+bonus.
 *      It also carries attack toggles so the tests can exercise the escrow's robustness:
 *      revert-in-callback, skip-approval, subsidy-over-remaining (via a large subsidyPerCall),
 *      bonus = type(uint256).max, and reenter-escrow-in-callback.
 */
contract MockSubsidyProvider is ISubsidyProvider {
    address public escrow;
    address public token;

    // amounts offered per call
    uint256 public subsidyPerCall;
    uint256 public bonusPerCall;
    // PERSISTED budget: each successful (non-attack) call draws (subsidyPerCall + bonusPerCall)
    uint256 public budget;

    // gating (address(0) == any)
    address public allowedNode;
    address public allowedPayer;
    bool public gateJobType;
    uint256 public allowedJobType;

    // attack toggles
    bool public revertInCallback;
    bool public skipApproval;
    bool public bonusMax;
    bool public reenter;

    // reentrancy probe
    bytes public reenterCalldata;
    bool public reenterAttempted;
    bool public reenterReverted;
    bytes public reenterRevertData;

    // observability
    uint256 public callCount;
    uint256 public lastSubsidyNeeded;
    uint256 public lastAmount;
    address public lastNode;
    address public lastPayer;
    uint256 public lastJobType;

    constructor(address _escrow, address _token) {
        escrow = _escrow;
        token = _token;
    }

    function configure(uint256 _subsidyPerCall, uint256 _bonusPerCall, uint256 _budget) external {
        subsidyPerCall = _subsidyPerCall;
        bonusPerCall = _bonusPerCall;
        budget = _budget;
    }
    function setGating(address _node, address _payer, bool _gateJobType, uint256 _jobType) external {
        allowedNode = _node;
        allowedPayer = _payer;
        gateJobType = _gateJobType;
        allowedJobType = _jobType;
    }
    function setRevert(bool v) external { revertInCallback = v; }
    function setSkipApproval(bool v) external { skipApproval = v; }
    function setBonusMax(bool v) external { bonusMax = v; }
    function setReenter(bool v, bytes calldata data) external { reenter = v; reenterCalldata = data; }

    function onSubsidyClaim(
        address node,
        address payer,
        uint256 jobType,
        address _token,
        uint256 amount,
        uint256 subsidyNeeded
    ) external override returns (uint256 subsidyAmount, uint256 bonusAmount) {
        // (a) only the escrow may call
        require(msg.sender == escrow, "MockSubsidyProvider: caller not escrow");

        callCount += 1;
        lastSubsidyNeeded = subsidyNeeded;
        lastAmount = amount;
        lastNode = node;
        lastPayer = payer;
        lastJobType = jobType;

        if (revertInCallback) revert("MockSubsidyProvider: forced revert");

        // (b) gate node / payer / jobType
        if (allowedNode != address(0) && node != allowedNode) return (0, 0);
        if (allowedPayer != address(0) && payer != allowedPayer) return (0, 0);
        if (gateJobType && jobType != allowedJobType) return (0, 0);

        // reentrancy attack: try to call back into the escrow; record whether it was blocked
        if (reenter) {
            (bool ok, bytes memory ret) = escrow.call(reenterCalldata);
            reenterAttempted = true;
            reenterReverted = !ok;
            reenterRevertData = ret;
            return (0, 0); // contribute nothing; the point is that re-entry was blocked
        }

        // bogus quote: return an uncapped huge bonus to test the escrow's overflow-safe combine
        if (bonusMax) {
            if (!skipApproval) IERC20(_token).approve(escrow, subsidyPerCall);
            return (subsidyPerCall, type(uint256).max);
        }

        uint256 draw = subsidyPerCall + bonusPerCall;
        // (c) persisted budget: skip entirely once exhausted
        if (draw > budget) return (0, 0);
        budget -= draw;

        // just-in-time approval for the combined amount
        if (!skipApproval) {
            IERC20(_token).approve(escrow, draw);
        }
        return (subsidyPerCall, bonusPerCall);
    }
}
