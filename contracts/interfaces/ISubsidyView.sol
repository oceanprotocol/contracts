pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
 * @title ISubsidyView
 * @dev Read-only surface every subsidy provider exposes so ONE dashboard can show "how much subsidy
 *      is available for a user" across providers with different budget models (rolling day/week/month
 *      caps, one-time onboarding credits, or anything future) without special-casing each contract.
 *
 *      Providers advertise this interface via ERC-165 `supportsInterface` (implemented alongside), so a
 *      dashboard can DISCOVER which contracts speak it and, later, which speak a v2. New capabilities
 *      (node-facing bonus budgets, promo schedules, rate descriptors, status codes, count-denominated
 *      budgets, ...) are added in a SEPARATE `ISubsidyViewV2` guarded by ERC-165 - never by mutating
 *      the `Bucket`/`Quote` structs here, because their ABI layout is positional and a field appended
 *      to an already-deployed provider is a breaking change. Treat v1 as frozen once a provider ships.
 *
 *      THE "AVAILABLE" LADDER (three deliberately-different figures - a dashboard must not conflate):
 *        - Bucket.remaining : per-window budget headroom only. Ignores balance, gates AND pct. For a
 *          provider with nested windows (e.g. day ⊂ week ⊂ month) the buckets are NOT summable - take
 *          the MIN across them. Never sum Bucket.remaining across a provider's own windows.
 *        - remainingSubsidy : the single "claimable right now" figure for a user/token - the min across
 *          windows, capped by the provider balance, and returned as 0 when the user is gated out or the
 *          provider is paused. ALWAYS FINITE (never a sentinel) and gated, so `Σ remainingSubsidy`
 *          across providers is a safe, truthful upper bound for a portfolio total (upper bound because
 *          the escrow stacks providers in an ordered, cap-decrementing walk, not a plain sum).
 *        - quoteSubsidy : the fully-resolved grant for a SPECIFIC job (applies pct, all caps, balance,
 *          and every gate incl. node/jobType). The authoritative "what will this job get" number, and
 *          it returns the bonus leg too (see Quote).
 *
 *      Bucket.unlimited == true means "no cap for this window"; then `limit` and `remaining` are 0 and
 *      meaningless (read `unlimited`, never a magic number), while `used` still carries the real spend.
 *      Period is a COARSE kind; anything outside the common set uses Period.CUSTOM and states its exact
 *      length in `periodSeconds` (0 == one-time / no fixed window), so new windows need no interface
 *      change. `periodSeconds` is a display/semantic descriptor, not necessarily an on-chain timer.
 *      NOTE: a rolling provider's Period.MONTH may be a fixed 28-day (4-week) window, NOT a calendar
 *      month - a dashboard should format from `periodSeconds`, not from the enum name.
 */
interface ISubsidyView {
    enum Period { ONE_TIME, DAY, WEEK, MONTH, CUSTOM }

    // coarse model kind, for dashboard grouping/labelling and quick discovery
    enum SubsidyKind { ROLLING_WINDOW, ONE_TIME, OTHER }

    struct Bucket {
        Period period;         // coarse kind for UI (CUSTOM for anything not in the common set)
        uint256 periodSeconds; // exact window length in seconds (0 == one-time / no fixed window)
        bool unlimited;        // true => no cap this window; limit & remaining are 0 and meaningless
        uint256 limit;         // the cap for this window in token wei (0 when unlimited)
        uint256 used;          // real cumulative spend this window (valid even when unlimited)
        uint256 remaining;     // limit - used; 0 when unlimited (read `unlimited`, never a sentinel)
        uint256 resetsAt;      // unix ts of the next automatic reset (0 == admin-driven / no timer)
    }

    // the two economically-distinct legs of a grant, mirroring ISubsidyProvider.onSubsidyClaim:
    // `subsidy` is released to the PAYER (cost reduction); `bonus` is an extra reward paid to the NODE.
    struct Quote {
        uint256 subsidy;
        uint256 bonus;
    }

    // subsidyBuckets return: the RAW per-window budget PLUS the payer-side eligibility flags, so a
    // dashboard can show the budget and simultaneously know whether it is currently drawable, without
    // extra calls. The buckets are still raw (independent of these flags, balance and pct). NOTE: the
    // node and jobType gates are NOT reflected here (subsidyBuckets has no node/jobType args) - a fully
    // gated per-job answer still comes from quoteSubsidy.
    struct BucketReport {
        bool paused;       // provider is paused: nothing is drawable right now regardless of budget
        bool userAllowed;  // payer passes the user AccessList gate (a null list => always true)
        bool tokenEnabled; // token is configured and enabled for subsidy
        Bucket[] buckets;  // per-window budget headroom (RAW)
    }

    /// coarse model kind for grouping/labelling in a dashboard
    function subsidyKind() external view returns (SubsidyKind);

    /// interface revision this provider implements (bump for a new ISubsidyView* version it supports)
    function version() external view returns (uint16);

    /// per-window budget breakdown for a payer/token (only the windows the provider models), plus the
    /// payer-side eligibility flags (paused / userAllowed / tokenEnabled). Buckets are raw budget.
    function subsidyBuckets(address payer, address token) external view returns (BucketReport memory);

    /// single "claimable now" figure: min across windows, balance-capped, gated. ALWAYS FINITE.
    /// summable across providers as a portfolio upper bound.
    function remainingSubsidy(address payer, address token) external view returns (uint256);

    /// fully-resolved grant for a specific hypothetical job (0/0 if paused / disabled / not allowed);
    /// returns both the payer subsidy and the node bonus legs.
    function quoteSubsidy(
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 amount,
        uint256 subsidyNeeded
    ) external view returns (Quote memory);

    /// eligibility gates
    function isUserAllowed(address payer) external view returns (bool);
    function isNodeAllowed(address node) external view returns (bool);
    function isJobTypeSubsidized(uint256 jobType) external view returns (bool);
    function getAllowedJobTypes() external view returns (uint256[] memory);

    /// provider funding for a token
    function availableBalance(address token) external view returns (uint256);
}
