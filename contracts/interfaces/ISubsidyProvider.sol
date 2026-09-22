pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
 * @title ISubsidyProvider
 * @dev Interface a third party implements to sponsor part of a payer's claim cost (a
 *      `subsidyAmount`, released back to the payer) and/or to add an extra reward on top for the
 *      node (a `bonusAmount`, paid to the payee/node). The escrow calls `onSubsidyClaim` once per
 *      entry of the node-supplied provider list, inside the claim transaction.
 */
interface ISubsidyProvider {
    /// @param node   payee / msg.sender of the claim
    /// @param payer  the user whose lock is being claimed
    /// @param jobType opaque category supplied by the node (the escrow never interprets it)
    /// @param token  the lock token
    /// @param amount full claim amount (bonus basis)
    /// @param subsidyNeeded remaining subsidy still uncovered by earlier providers in this claim's
    ///        list; it starts at `amount` and decreases as providers subsidize, and is **0** once
    ///        the job is already fully subsidized. A provider should offer at most `subsidyNeeded`
    ///        of subsidy, but may still return a `bonusAmount` even when `subsidyNeeded == 0`.
    ///        `amount` is always the full claim amount, so a provider can size its bonus as, e.g., a
    ///        percentage of the job regardless of how much subsidy is left.
    /// @return subsidyAmount amount of `token` that covers part of the PAYER's cost (released back to
    ///         the payer; escrow caps it at the remaining un-subsidized portion of the claim).
    /// @return bonusAmount   amount of `token` paid as an EXTRA reward to the NODE, on top of the
    ///         claim amount (not released to the payer; uncapped).
    ///
    /// Inside this call the provider updates its own budget/state AND approves the escrow to pull
    /// `subsidyAmount + bonusAmount` just-in-time, i.e.
    /// `IERC20(token).approve(msg.sender /* escrow */, subsidyAmount + bonusAmount)`
    /// (msg.sender of this callback is the escrow contract). Immediately after this returns, the
    /// escrow pulls the tokens with `transferFrom(provider -> escrow)` and never pulls more than the
    /// (capped subsidy + bonus) it can actually receive.
    ///
    /// SECURITY - a correct provider implementation MUST do ALL of the following, or it is drainable:
    ///   (a) `require(msg.sender == <the escrow address>)` - otherwise an attacker calls this
    ///       function directly with a spoofed `node`/`payer`, gets the just-in-time `approve`, and
    ///       `transferFrom`s the funds with no real claim at all.
    ///   (b) authenticate `node` / `payer` / `jobType` and only fund combinations it intends to.
    ///   (c) decrement a PERSISTED budget per call - the escrow calls this ONCE PER LIST ENTRY, and a
    ///       node may list the same provider many times in one claim, so a fixed per-call amount with
    ///       no persisted budget is drained Nx in a single transaction.
    /// The escrow calls the provider on a node-chosen address and `bonusAmount` is uncapped, so a
    /// provider missing any of (a)-(c) can be drained up to its escrow allowance. The escrow itself
    /// stays solvent regardless; this is the provider's own risk.
    ///
    /// RESIDUAL EXPOSURE - the escrow only enforces `provider != payer` and a "typed call, skip on
    /// revert" pattern. Any *third-party* smart-account that (i) holds a standing escrow allowance and
    /// (ii) returns two non-zero uints from a bare `onSubsidyClaim`/fallback can still be pulled from
    /// when a node names it as a provider. Integrators with permissive smart-account wallets are
    /// warned: do NOT keep a standing escrow allowance on a wallet whose fallback returns data.
    function onSubsidyClaim(
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 amount,
        uint256 subsidyNeeded
    ) external returns (uint256 subsidyAmount, uint256 bonusAmount);
}
