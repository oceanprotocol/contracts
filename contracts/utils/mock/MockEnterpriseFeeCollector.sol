pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "../../interfaces/IEnterpriseFeeCollector.sol";

/**
 * @title MockEnterpriseFeeCollector
 * @dev A non-proportional fee collector: calculateFee returns a fixed configurable amount regardless
 *      of the passed amount. Used to prove the EnterpriseEscrow payout clamp: when fee >= amount+bonus
 *      the claim must not underflow-revert (payout clamps to 0). Also lets the lock be created with a
 *      small fee and then reconfigured to a punitive fee before the claim.
 */
contract MockEnterpriseFeeCollector is IEnterpriseFeeCollector {
    uint256 public constant RATE_UNIT = 1e18;
    uint256 public fixedFee;    // used when useRate == false
    uint256 public feeRate;     // per-1e18 proportional rate, used when useRate == true
    bool public useRate;        // false => fixed fee (clamp test); true => proportional (math tests)
    bool public allowed = true;

    function setFee(uint256 _fee) external {
        fixedFee = _fee;
        useRate = false;
    }
    function setRate(uint256 _rate) external {
        feeRate = _rate;
        useRate = true;
    }
    function setAllowed(bool _allowed) external {
        allowed = _allowed;
    }

    function calculateFee(address, uint256 amount) external view override returns (uint256) {
        return useRate ? (amount * feeRate) / RATE_UNIT : fixedFee;
    }
    function isTokenAllowed(address) external view override returns (bool) {
        return allowed;
    }
}
