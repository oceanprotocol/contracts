pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
 * @title ISubsidyLockProvider
 * @dev Lock-time ("pre-funded") sponsorship, a SEPARATE interface from `ISubsidyProvider` so that
 *      adding it never changes `type(ISubsidyProvider).interfaceId` (the ERC-165 marker of the shipped
 *      claim-time interface stays frozen). A provider may implement one or both; the escrow discovers
 *      lock-time support by calling `onSubsidyLock` with a LOW-LEVEL call (a non-implementing provider
 *      contributes 0, never reverts the lock).
 *
 *      MODEL. Unlike `onSubsidyClaim` (reimbursement: the subsidy is released to the PAYER AFTER the
 *      claim), lock-time sponsorship PRE-FUNDS the lock: the escrow pulls the provider's tokens into a
 *      non-withdrawable bucket when the lock is created, and the node is later paid from that bucket
 *      first. A fully-sponsored payer can therefore transact with ZERO deposit. Unused sponsored tokens
 *      (partial claim / expiry / reLock-shrink) are PUSHED back to the provider by the escrow, which
 *      then calls `onSubsidyRefund` so the provider can restore its budget.
 *
 *      RESERVATION ACCOUNTING (why `lockId`). `onSubsidyLock` reserves budget against the CURRENT
 *      window (e.g. a rolling day/week/month counter, or a one-time round). A lock can live up to the
 *      authorization's maxLockSeconds and routinely crosses a window boundary (or an admin round bump)
 *      before the refund arrives. The refund therefore MUST reverse the EXACT counters that were
 *      debited at lock time, not whatever window is current at refund time — otherwise the budget
 *      underflows (silent subsidy leak / DoS) or credits a window it never debited (cap bypass). The
 *      escrow passes a stable `lockId` to both callbacks; the provider records the reserved slots keyed
 *      by `lockId` at lock and reverses them on refund.
 */
interface ISubsidyLockProvider {
    /// @notice Called by the escrow inside `createLock` (and `reLock`-grow) for each named provider.
    /// @param lockId stable id of the lock = keccak256(abi.encode(payee, payer, jobId)); the provider
    ///        keys its per-lock reservation by this value. On a reLock-grow the SAME lockId is passed
    ///        again, so the provider ADDS to the existing reservation.
    /// @param node   payee / msg.sender of the lock.
    /// @param payer  the user the lock is created for.
    /// @param jobType opaque category supplied by the node.
    /// @param token  the lock token.
    /// @param lockAmount full (gross) lock amount — bonus/pct basis.
    /// @param sponsorNeeded remaining amount still unsponsored by earlier providers in this lock's
    ///        list; the escrow additionally caps the pulled amount at this value, so returning more is
    ///        harmless.
    /// @return sponsorAmount amount of `token` the provider funds up-front. The provider decrements a
    ///         PERSISTED budget by this amount, records the reservation under `lockId`, and approves the
    ///         escrow (msg.sender) to pull exactly `sponsorAmount` just-in-time
    ///         (`IERC20(token).approve(msg.sender, sponsorAmount)`), which the escrow pulls immediately
    ///         (reject-partial).
    ///
    /// SECURITY — like `onSubsidyClaim`, a correct implementation MUST (a) require(msg.sender == a
    /// registered escrow), (b) authenticate node/payer/jobType via its gates, and (c) persist the
    /// reservation BEFORE the approve. In addition, because sponsored tokens are paid straight to the
    /// NODE at claim (no payer deposit fronted), a provider offering this leg SHOULD require a
    /// nodeAccessList (and realistically a userAccessList): with open gates it is drainable by a sybil
    /// node + disposable payers.
    function onSubsidyLock(
        bytes32 lockId,
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 lockAmount,
        uint256 sponsorNeeded
    ) external returns (uint256 sponsorAmount);

    /// @notice Called by the escrow AFTER it has already pushed `refundAmount` of `token` back to the
    ///         provider (partial claim / expiry / reLock-shrink). This call does NOT move tokens; it
    ///         only lets the provider restore its budget by crediting back the EXACT window counters it
    ///         debited at lock, looked up by `lockId`. May be called multiple times per `lockId`
    ///         (partial refunds); the sum never exceeds the amount reserved under that `lockId`.
    ///
    /// SECURITY — MUST require(msg.sender == the registered escrow). Must be tolerant: the escrow calls
    /// it with a low-level, revert-swallowing call, so a revert here only forfeits the budget credit
    /// (the tokens were already returned); it must not assume a token pull.
    function onSubsidyRefund(
        bytes32 lockId,
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 refundAmount
    ) external;
}
