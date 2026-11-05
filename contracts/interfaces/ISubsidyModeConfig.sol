pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
 * @title ISubsidyModeConfig
 * @dev Standard owner-settable control for WHICH subsidy mode(s) a provider honours. Every subsidy
 *      provider should implement this so operators get a uniform switch and dashboards can discover and
 *      display it via ERC-165 `supportsInterface(type(ISubsidyModeConfig).interfaceId)`.
 *
 *        - REFUND_ONLY  : only the claim-time `ISubsidyProvider.onSubsidyClaim` leg is active (the
 *                         subsidy is reimbursed to the payer after the claim).
 *        - PREPAID_ONLY : only the lock-time `ISubsidyLockProvider.onSubsidyLock` leg is active (the
 *                         provider pre-funds the lock; zero-deposit onboarding).
 *        - BOTH         : both legs active (the default; enum index 0 so an uninitialised provider is BOTH).
 *
 *      When a mode is disabled the matching callback returns 0 (no subsidy / no approve) and the matching
 *      `ISubsidyViewV2` quote leg reports 0. To disable ALL subsidy use the provider's pause switch; this
 *      interface only selects between the two modes.
 */
interface ISubsidyModeConfig {
    enum SubsidyModeConfig { BOTH, REFUND_ONLY, PREPAID_ONLY }

    event SubsidyModeConfigSet(SubsidyModeConfig mode);

    /// @notice the subsidy mode(s) this provider currently honours.
    function subsidyModeConfig() external view returns (SubsidyModeConfig);

    /// @notice owner-only: set which subsidy mode(s) are active.
    function setSubsidyMode(SubsidyModeConfig mode) external;
}
