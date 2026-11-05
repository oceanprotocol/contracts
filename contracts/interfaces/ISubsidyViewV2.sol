pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
 * @title ISubsidyViewV2
 * @dev Read-only extension of `ISubsidyView` (v1 is frozen — never mutate its `Quote`/`Bucket`). A
 *      provider may now offer subsidy under two modes, and a dashboard/node needs to see BOTH for a
 *      given (user, node, token, jobType) query:
 *        - REIMBURSEMENT: the claim-time `ISubsidyProvider.onSubsidyClaim` leg (subsidy released to the
 *          payer AFTER the claim).
 *        - PREFUNDED:     the lock-time `ISubsidyLockProvider.onSubsidyLock` leg (tokens pre-funded into
 *          the lock at creation; a zero-deposit path for new users).
 *      Discover via ERC-165 `supportsInterface(type(ISubsidyViewV2).interfaceId)`.
 *
 *      SHARED-BUDGET CAVEAT. Unless a provider documents otherwise, both modes draw from the SAME
 *      per-provider budget/balance, so each leg is a "max if used alone" figure and the two are NOT
 *      additive — spending one reduces what the other can give (same rule as "never sum a provider's
 *      own nested windows").
 */
interface ISubsidyViewV2 {
    enum SubsidyMode { REIMBURSEMENT, PREFUNDED }

    // the two legs of a grant, mirroring the two interfaces. `subsidy` is the amount in the given mode
    // (released to the payer for REIMBURSEMENT, pre-funded into the lock for PREFUNDED); `bonus` is any
    // extra node reward (0 for providers that do not pay a bonus).
    struct ModeQuote {
        SubsidyMode mode;
        uint256 subsidy;
        uint256 bonus;
    }

    /// @notice Both legs for a hypothetical job, as a length-2 array ordered
    ///         [REIMBURSEMENT, PREFUNDED]. A mode the provider does not offer reports (mode, 0, 0).
    ///         Each leg applies the provider's pct, caps, balance and all gates.
    function quoteSubsidyModes(
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 amount,
        uint256 subsidyNeeded
    ) external view returns (ModeQuote[] memory);

    /// @notice Convenience single-leg accessor for one `mode`.
    function quoteSubsidyByMode(
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 amount,
        uint256 subsidyNeeded,
        SubsidyMode mode
    ) external view returns (uint256 subsidy, uint256 bonus);
}
