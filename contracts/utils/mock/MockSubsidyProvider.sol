pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../../interfaces/ISubsidyProvider.sol";
import "../../interfaces/ISubsidyLockProvider.sol";
import "../../interfaces/ISubsidyViewV2.sol";
import "../../interfaces/ISubsidyModeConfig.sol";

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
 *
 *      LOCK-TIME (ISubsidyLockProvider): a simple per-lockId reservation. onSubsidyLock reserves a
 *      grant out of the SAME `budget` (keyed by lockId so a reLock-grow accumulates); onSubsidyRefund
 *      credits the budget back (bounded by the reservation). Attack toggles for the lock leg:
 *      revertOnLock, shortReturnOnLock (<32-byte returndata), skipApprovalOnLock (reject-partial pull),
 *      revertOnRefund (escrow must swallow it). Pair skipApprovalOnLock / a blacklisting token with the
 *      refund path to drive the escrow's reclaimable fallback.
 *      DUAL-MODE (ISubsidyViewV2): quoteSubsidyModes / quoteSubsidyByMode report exactly what
 *      onSubsidyClaim / onSubsidyLock would grant for cross-checking via callStatic.
 */
contract MockSubsidyProvider is ISubsidyProvider, ISubsidyLockProvider, ISubsidyViewV2, ISubsidyModeConfig, IERC165 {
    address public escrow;
    address public token;

    // ISubsidyModeConfig: default BOTH (enum index 0)
    SubsidyModeConfig public override subsidyModeConfig;
    function setSubsidyMode(SubsidyModeConfig mode) external override { subsidyModeConfig = mode; emit SubsidyModeConfigSet(mode); }

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

    // attack toggles (claim leg)
    bool public revertInCallback;
    bool public skipApproval;
    bool public bonusMax;
    bool public reenter;

    // attack toggles (lock leg)
    bool public revertOnLock;
    bool public shortReturnOnLock;
    bool public skipApprovalOnLock;
    bool public revertOnRefund;

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

    // lock-leg observability + per-lockId reservation
    mapping(bytes32 => uint256) public lockReserved; // lockId -> currently reserved (not yet refunded)
    uint256 public lockCallCount;
    uint256 public refundCallCount;
    uint256 public lastRefundAmount;
    bytes32 public lastLockId;

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
    // lock-leg toggles
    function setRevertOnLock(bool v) external { revertOnLock = v; }
    function setShortReturnOnLock(bool v) external { shortReturnOnLock = v; }
    function setSkipApprovalOnLock(bool v) external { skipApprovalOnLock = v; }
    function setRevertOnRefund(bool v) external { revertOnRefund = v; }

    function _gated(address node, address payer, uint256 jobType) internal view returns (bool) {
        if (allowedNode != address(0) && node != allowedNode) return false;
        if (allowedPayer != address(0) && payer != allowedPayer) return false;
        if (gateJobType && jobType != allowedJobType) return false;
        return true;
    }
    function _min(uint256 a, uint256 b) internal pure returns (uint256) { return a < b ? a : b; }

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
        if (subsidyModeConfig == SubsidyModeConfig.PREPAID_ONLY) return (0, 0); // refund leg disabled

        callCount += 1;
        lastSubsidyNeeded = subsidyNeeded;
        lastAmount = amount;
        lastNode = node;
        lastPayer = payer;
        lastJobType = jobType;

        if (revertInCallback) revert("MockSubsidyProvider: forced revert");

        // (b) gate node / payer / jobType
        if (!_gated(node, payer, jobType)) return (0, 0);

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

    // ----------------------------------------------------------------------------------------------
    // Lock-time (ISubsidyLockProvider)
    // ----------------------------------------------------------------------------------------------

    function onSubsidyLock(
        bytes32 lockId,
        address node,
        address payer,
        uint256 jobType,
        address _token,
        uint256 lockAmount,
        uint256 sponsorNeeded
    ) external override returns (uint256 sponsorAmount) {
        require(msg.sender == escrow, "MockSubsidyProvider: caller not escrow");
        if (subsidyModeConfig == SubsidyModeConfig.REFUND_ONLY) return 0; // prepaid leg disabled
        lockCallCount += 1;
        lastLockId = lockId;
        lastSubsidyNeeded = sponsorNeeded;
        lastAmount = lockAmount;
        lastNode = node;
        lastPayer = payer;
        lastJobType = jobType;

        if (revertOnLock) revert("MockSubsidyProvider: forced lock revert");
        if (shortReturnOnLock) {
            // return 0 bytes of returndata: the escrow's _consult treats data.length<32 as 0
            assembly { return(0, 0) }
        }
        if (!_gated(node, payer, jobType)) return 0;

        uint256 grant = _min(subsidyPerCall, sponsorNeeded);
        if (grant == 0 || grant > budget) return 0;

        // (c) persist the reservation BEFORE the approve (CEI), keyed by lockId (accumulates on grow)
        budget -= grant;
        lockReserved[lockId] += grant;

        if (!skipApprovalOnLock) {
            IERC20(_token).approve(escrow, 0);
            IERC20(_token).approve(escrow, grant);
        }
        return grant;
    }

    function onSubsidyRefund(
        bytes32 lockId,
        address node,
        address payer,
        uint256 jobType,
        address _token,
        uint256 refundAmount
    ) external override {
        require(msg.sender == escrow, "MockSubsidyProvider: caller not escrow");
        node; payer; jobType; _token;
        refundCallCount += 1;
        lastRefundAmount = refundAmount;
        lastLockId = lockId;
        if (revertOnRefund) revert("MockSubsidyProvider: forced refund revert");
        // credit back only what is still reserved under this lockId
        uint256 take = _min(refundAmount, lockReserved[lockId]);
        lockReserved[lockId] -= take;
        budget += take;
    }

    // ----------------------------------------------------------------------------------------------
    // Dual-mode quoting (ISubsidyViewV2)
    // ----------------------------------------------------------------------------------------------

    function quoteSubsidyModes(
        address node,
        address payer,
        uint256 jobType,
        address,
        uint256,
        uint256 subsidyNeeded
    ) external view override returns (ModeQuote[] memory) {
        ModeQuote[] memory q = new ModeQuote[](2);
        (uint256 rSub, uint256 rBon) = _quoteClaim(node, payer, jobType);
        q[0] = ModeQuote(SubsidyMode.REIMBURSEMENT, rSub, rBon);
        q[1] = ModeQuote(SubsidyMode.PREFUNDED, _quoteLock(node, payer, jobType, subsidyNeeded), 0);
        return q;
    }

    function quoteSubsidyByMode(
        address node,
        address payer,
        uint256 jobType,
        address,
        uint256,
        uint256 subsidyNeeded,
        SubsidyMode mode
    ) external view override returns (uint256 subsidy, uint256 bonus) {
        if (mode == SubsidyMode.REIMBURSEMENT) return _quoteClaim(node, payer, jobType);
        return (_quoteLock(node, payer, jobType, subsidyNeeded), 0);
    }

    // mirror onSubsidyClaim's actual return for the current config/budget/gates
    function _quoteClaim(address node, address payer, uint256 jobType) internal view returns (uint256, uint256) {
        if (!_gated(node, payer, jobType)) return (0, 0);
        uint256 draw = subsidyPerCall + bonusPerCall;
        if (draw > budget) return (0, 0);
        return (subsidyPerCall, bonusPerCall);
    }

    // mirror onSubsidyLock's actual return for the current config/budget/gates
    function _quoteLock(address node, address payer, uint256 jobType, uint256 sponsorNeeded) internal view returns (uint256) {
        if (!_gated(node, payer, jobType)) return 0;
        uint256 grant = _min(subsidyPerCall, sponsorNeeded);
        if (grant == 0 || grant > budget) return 0;
        return grant;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(ISubsidyProvider).interfaceId
            || interfaceId == type(ISubsidyLockProvider).interfaceId
            || interfaceId == type(ISubsidyViewV2).interfaceId
            || interfaceId == type(ISubsidyModeConfig).interfaceId;
    }
}
