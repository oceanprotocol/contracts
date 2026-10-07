pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import '../interfaces/IERC20.sol';
import '../utils/SafeERC20.sol';
import '../interfaces/ISubsidyProvider.sol';
import '../interfaces/ISubsidyView.sol';
import '../interfaces/ISubsidyLockProvider.sol';
import '../interfaces/ISubsidyViewV2.sol';
import '../interfaces/ISubsidyModeConfig.sol';
import '../interfaces/IAccessList.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/utils/introspection/IERC165.sol';

/**
 * @title OPFSubsidyProvider
 * @dev Ocean Protocol Foundation's on-chain sponsorship program. A concrete `ISubsidyProvider`
 *      that the escrow consults at claim time. It sponsors part of a payer's job cost (never a node
 *      bonus in v1), subject to:
 *        - per-token percentage-of-job ceiling (basis points),
 *        - per-user rolling day / week / month caps (0 == unlimited for that period),
 *        - three membership gates: user AccessList, node AccessList, and an owner-managed jobType
 *          allowlist (an empty allowlist == all jobTypes allowed),
 *        - the contract's own token balance.
 *      Funds are plain ERC20 transfers to this contract; the owner reclaims unspent funds via
 *      withdrawTokens / withdrawAllTokens.
 *
 *      Epoch windows are fixed and epoch-aligned (no offset): dayIndex = ts/1 days (resets 00:00
 *      UTC), weekIndex = ts/1 weeks (7-day blocks, boundaries on Thursdays 00:00 UTC as the Unix
 *      epoch is a Thursday), monthIndex = ts/4 weeks (28-day blocks from the epoch, NOT a calendar
 *      month). day ⊂ week ⊂ month nest exactly.
 *
 *      Security (per ISubsidyProvider (a)/(b)/(c)): onSubsidyClaim (a) only pays a registered escrow
 *      (the drain guard), (b) authenticates payer/node/jobType via the gates, and (c) persists the
 *      per-period budget spend BEFORE the just-in-time approve (CEI), so listing this provider many
 *      times in one claim can never double-spend.
 */
contract OPFSubsidyProvider is ISubsidyProvider, ISubsidyView, ISubsidyLockProvider, ISubsidyViewV2, ISubsidyModeConfig, IERC165, ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // pctBps is in basis points: 10000 == 100%
    uint256 public constant BPS = 10000;
    // upper bound on the jobType allowlist size, so a future replace can never exceed the block gas
    // limit and freeze the gate config (owner self-DoS guard).
    uint256 public constant MAX_ALLOWED_JOBTYPES = 100;

    // fixed, nested epoch windows (1 / 7 / 28 days)
    uint256 public constant DAY = 1 days;
    uint256 public constant WEEK = 1 weeks;
    uint256 public constant MONTH = 4 weeks;

    // per-token config; a period limit of 0 == unlimited for that period
    struct TokenLimits {
        uint256 pctBps;   // percentage-of-job ceiling in basis points (0..BPS)
        uint256 daily;    // per-user daily cap in token wei (0 == unlimited)
        uint256 weekly;   // per-user weekly cap in token wei (0 == unlimited)
        uint256 monthly;  // per-user monthly cap in token wei (0 == unlimited)
        bool enabled;     // token subsidised only when true
    }

    mapping(address => TokenLimits) public tokenLimits;   // token -> config
    mapping(address => bool) public authorizedEscrow;     // escrows allowed to call onSubsidyClaim

    // which subsidy mode(s) this provider honours (ISubsidyModeConfig: BOTH / REFUND_ONLY / PREPAID_ONLY).
    // Default BOTH (enum index 0, so no constructor needed). pause() disables all subsidy; this only
    // selects between the two modes. The enum + event live in ISubsidyModeConfig (shared standard).
    SubsidyModeConfig public override subsidyModeConfig;

    address public userAccessList; // payer must hold a token in this list (address(0) == gate off)
    address public nodeAccessList; // node must hold a token in this list (address(0) == gate off)

    uint256[] private _allowedJobTypes;              // owner-managed allowlist (empty == all allowed)
    mapping(uint256 => bool) public isJobTypeAllowed; // O(1) membership, kept in sync with the array

    // per-user, per-token, per-period cumulative subsidy used, keyed by period index (auto-resets)
    mapping(address => mapping(address => mapping(uint256 => uint256))) private dailyUsed;   // [payer][token][dayIndex]
    mapping(address => mapping(address => mapping(uint256 => uint256))) private weeklyUsed;  // [payer][token][weekIndex]
    mapping(address => mapping(address => mapping(uint256 => uint256))) private monthlyUsed; // [payer][token][monthIndex]

    // Lock-time (ISubsidyLockProvider) reservation accounting. A lock may cross a day/week/month
    // boundary between onSubsidyLock and onSubsidyRefund, so we record which EXACT window counters
    // each sub-grant debited (audit F1). A reLock-grow calls onSubsidyLock again with the SAME lockId
    // (possibly in a different window), so reservations are an APPENDED list of window-stamped
    // sub-grants per lockId, reversed from the END on refund.
    struct Resv { uint256 d; uint256 w; uint256 m; uint256 amount; }
    mapping(bytes32 => Resv[]) private lockReservations; // lockId -> window-stamped sub-grants

    // events
    event SubsidyGranted(
        address indexed escrow,
        address indexed node,
        address indexed payer,
        address token,
        uint256 amount,
        uint256 dayIndex,
        uint256 weekIndex,
        uint256 monthIndex
    );
    event TokenLimitsSet(address indexed token, uint256 pctBps, uint256 daily, uint256 weekly, uint256 monthly, bool enabled);
    event UserAccessListSet(address indexed accessList);
    event NodeAccessListSet(address indexed accessList);
    event AllowedJobTypesSet(uint256[] jobTypes);
    event AuthorizedEscrowSet(address indexed escrow, bool allowed);
    event Withdraw(address indexed token, address indexed to, uint256 amount);
    // lock-time sponsorship events
    event SubsidyLocked(address indexed escrow, bytes32 indexed lockId, address indexed payer, address node, address token, uint256 amount);
    event SubsidyRefunded(address indexed escrow, bytes32 indexed lockId, address indexed payer, address token, uint256 amount);

    // ---------------------------------------------------------------------------------------------
    // Core: ISubsidyProvider callback
    // ---------------------------------------------------------------------------------------------

    /**
     * @dev Consulted by the escrow once per list entry. Returns (subsidyAmount, 0). Never reverts on
     *      the eligibility path: an ineligible / unauthorised call returns (0,0) so NO approve is
     *      granted. Effects (per-period counters) are persisted BEFORE the just-in-time approve.
     */
    function onSubsidyClaim(
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 amount,
        uint256 subsidyNeeded
    ) external override nonReentrant returns (uint256 subsidyAmount, uint256 bonusAmount) {
        // (a) drain guard: only a registered escrow gets an approve
        if (!authorizedEscrow[msg.sender]) return (0, 0);
        // mode: claim-time (refund) leg must be enabled
        if (!_refundEnabled()) return (0, 0);

        uint256 grant = _computeGrant(node, payer, jobType, token, amount, subsidyNeeded);
        if (grant == 0) return (0, 0);

        uint256 d = block.timestamp / DAY;
        uint256 w = block.timestamp / WEEK;
        uint256 m = block.timestamp / MONTH;

        // EFFECTS before INTERACTION (CEI): (c) persist the per-period budget spend
        dailyUsed[payer][token][d] += grant;
        weeklyUsed[payer][token][w] += grant;
        monthlyUsed[payer][token][m] += grant;

        // INTERACTION: just-in-time approve the escrow (msg.sender) to pull exactly `grant`.
        // Zero-then-set via SafeERC20 so non-standard tokens work: USDT-style approves that return no
        // bool are handled by _callOptionalReturn, and clearing to 0 first satisfies tokens that forbid
        // a non-zero -> non-zero allowance change AND clears any stale allowance left by an earlier
        // reject-partial pull.
        IERC20(token).safeApprove(msg.sender, 0);
        IERC20(token).safeApprove(msg.sender, grant);

        emit SubsidyGranted(msg.sender, node, payer, token, grant, d, w, m);
        return (grant, 0); // bonus always 0
    }

    // ---------------------------------------------------------------------------------------------
    // Core: ISubsidyLockProvider callbacks (lock-time / pre-funded sponsorship)
    // ---------------------------------------------------------------------------------------------

    /**
     * @dev Consulted by the escrow inside createLock (and reLock-grow). Uses the SAME grant math as
     *      onSubsidyClaim (pct / caps / balance / gates / pause), reserves the budget at the CURRENT
     *      window, records the reservation under `lockId` so onSubsidyRefund can reverse the exact
     *      counters later, then just-in-time approves the escrow (USDT-safe). Returns 0 (no approve)
     *      on any ineligible path, never reverts on eligibility.
     */
    function onSubsidyLock(
        bytes32 lockId,
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 lockAmount,
        uint256 sponsorNeeded
    ) external override nonReentrant returns (uint256 sponsorAmount) {
        // (a) drain guard: only a registered escrow gets an approve
        if (!authorizedEscrow[msg.sender]) return 0;
        // mode: lock-time (prepaid) leg must be enabled
        if (!_prepaidEnabled()) return 0;
        // Gating: _computeGrant applies BOTH the user AND node AccessList gates; a list set to the ZERO
        // address means that gate is open to everyone, so the operator can run an open, user-gated,
        // node-gated or fully-gated sponsored program. NOTE: the pre-funded leg pays the node DIRECTLY
        // at claim, so an OPEN program (both lists zero) is sybil-drainable down to the funded balance /
        // per-window caps — operators running open onboarding must fund/cap accordingly.
        uint256 grant = _computeGrant(node, payer, jobType, token, lockAmount, sponsorNeeded);
        if (grant == 0) return 0;

        uint256 d = block.timestamp / DAY;
        uint256 w = block.timestamp / WEEK;
        uint256 m = block.timestamp / MONTH;

        // EFFECTS before INTERACTION (CEI): reserve the per-period budget AND stamp the reservation
        // so a refund (even one that lands in a later window) reverses these exact counters.
        dailyUsed[payer][token][d] += grant;
        weeklyUsed[payer][token][w] += grant;
        monthlyUsed[payer][token][m] += grant;
        // key the reservation by (escrow, lockId): the same provider may sponsor on BOTH escrows, and
        // lockId omits the escrow address, so two escrows could reuse the same (payer,jobId) -> lockId.
        lockReservations[keccak256(abi.encodePacked(msg.sender, lockId))].push(Resv(d, w, m, grant));

        // INTERACTION: just-in-time approve the escrow (msg.sender) to pull exactly `grant`.
        IERC20(token).safeApprove(msg.sender, 0);
        IERC20(token).safeApprove(msg.sender, grant);

        emit SubsidyLocked(msg.sender, lockId, payer, node, token, grant);
        return grant;
    }

    /**
     * @dev Escrow has ALREADY pushed `refundAmount` back (partial claim / expiry / reLock-shrink); this
     *      only restores budget. Reverses the stored reservation sub-grants for `lockId` from the END,
     *      crediting back the EXACT window counters each one debited, bounded by the remaining reserved
     *      amount. No token transfer here.
     */
    function onSubsidyRefund(
        bytes32 lockId,
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 refundAmount
    ) external override nonReentrant {
        require(authorizedEscrow[msg.sender], "OPFSubsidy: not authorized escrow");
        node; jobType; // authenticated by lockId reservation; silence unused-param warnings

        Resv[] storage rs = lockReservations[keccak256(abi.encodePacked(msg.sender, lockId))];
        uint256 remaining = refundAmount;
        // consume from the END; each sub-grant reduces the exact counters it debited at lock time.
        while (remaining > 0 && rs.length > 0) {
            Resv storage r = rs[rs.length - 1];
            uint256 take = _min(remaining, r.amount);
            dailyUsed[payer][token][r.d] -= take;
            weeklyUsed[payer][token][r.w] -= take;
            monthlyUsed[payer][token][r.m] -= take;
            remaining -= take;
            if (take == r.amount) {
                rs.pop();
            } else {
                r.amount -= take;
            }
        }
        emit SubsidyRefunded(msg.sender, lockId, payer, token, refundAmount - remaining);
    }

    /**
     * @dev Shared grant math used by BOTH onSubsidyClaim and quoteSubsidy so they can never diverge.
     *      Applies paused / token.enabled / the three gates, then caps the grant by pct, each period
     *      remaining, and the contract's token balance. Pure view (no state change).
     */
    function _computeGrant(
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 amount,
        uint256 subsidyNeeded
    ) internal view returns (uint256) {
        if (paused()) return 0;
        TokenLimits memory L = tokenLimits[token];
        if (!L.enabled) return 0;
        if (!_isAllowed(userAccessList, payer)) return 0; // (b) user gate
        if (!_isAllowed(nodeAccessList, node)) return 0;   // (b) node gate
        if (_allowedJobTypes.length != 0 && !isJobTypeAllowed[jobType]) return 0; // (b) jobType gate

        uint256 d = block.timestamp / DAY;
        uint256 w = block.timestamp / WEEK;
        uint256 m = block.timestamp / MONTH;

        uint256 grant = subsidyNeeded;                          // never exceed what the escrow needs
        grant = _min(grant, (amount * L.pctBps) / BPS);         // percentage-of-job ceiling
        grant = _capRemaining(grant, dailyUsed[payer][token][d], L.daily);
        grant = _capRemaining(grant, weeklyUsed[payer][token][w], L.weekly);
        grant = _capRemaining(grant, monthlyUsed[payer][token][m], L.monthly);
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (grant > bal) grant = bal;                           // only grant what we can deliver
        return grant;
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    // remaining budget for a period given `used` and `limit`; limit == 0 means unlimited
    function _capRemaining(uint256 want, uint256 used, uint256 limit) internal pure returns (uint256) {
        if (limit == 0) return want;
        uint256 rem = limit > used ? limit - used : 0;
        return _min(want, rem);
    }

    // list == address(0) => gate off (allow all); else membership == balanceOf > 0
    function _isAllowed(address list, address who) internal view returns (bool) {
        if (list == address(0)) return true;
        return IAccessListContract(list).balanceOf(who) > 0;
    }

    // mode gating: REFUND (claim-time) active unless PREPAID_ONLY; PREPAID (lock-time) active unless REFUND_ONLY
    function _refundEnabled() internal view returns (bool) { return subsidyModeConfig != SubsidyModeConfig.PREPAID_ONLY; }
    function _prepaidEnabled() internal view returns (bool) { return subsidyModeConfig != SubsidyModeConfig.REFUND_ONLY; }

    // ---------------------------------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------------------------------

    function setTokenLimits(
        address token,
        uint256 pctBps,
        uint256 daily,
        uint256 weekly,
        uint256 monthly,
        bool enabled
    ) external onlyOwner {
        require(token != address(0), "OPFSubsidy: token is zero address");
        require(pctBps <= BPS, "OPFSubsidy: pctBps > BPS");
        tokenLimits[token] = TokenLimits(pctBps, daily, weekly, monthly, enabled);
        emit TokenLimitsSet(token, pctBps, daily, weekly, monthly, enabled);
    }

    function setUserAccessList(address accessList) external onlyOwner {
        userAccessList = accessList;
        emit UserAccessListSet(accessList);
    }

    function setNodeAccessList(address accessList) external onlyOwner {
        nodeAccessList = accessList;
        emit NodeAccessListSet(accessList);
    }

    /**
     * @dev Replaces the jobType allowlist: clears the old entries' flags, resets the array, then sets
     *      the new ones (dedup-guarded so the array and mapping stay in sync). Pass [] to disable the
     *      gate (all jobTypes allowed).
     */
    function setAllowedJobTypes(uint256[] calldata jobTypes) external onlyOwner {
        require(jobTypes.length <= MAX_ALLOWED_JOBTYPES, "OPFSubsidy: too many jobTypes");
        // clear old flags
        uint256 oldLen = _allowedJobTypes.length;
        for (uint256 i = 0; i < oldLen; i++) {
            isJobTypeAllowed[_allowedJobTypes[i]] = false;
        }
        delete _allowedJobTypes;
        // set new flags, skipping duplicates so the array matches the mapping
        for (uint256 i = 0; i < jobTypes.length; i++) {
            if (!isJobTypeAllowed[jobTypes[i]]) {
                isJobTypeAllowed[jobTypes[i]] = true;
                _allowedJobTypes.push(jobTypes[i]);
            }
        }
        emit AllowedJobTypesSet(jobTypes);
    }

    function setAuthorizedEscrow(address escrow, bool allowed) external onlyOwner {
        require(escrow != address(0), "OPFSubsidy: escrow is zero address");
        authorizedEscrow[escrow] = allowed;
        emit AuthorizedEscrowSet(escrow, allowed);
    }

    /// @dev Owner picks which subsidy mode(s) are active: BOTH (default), REFUND_ONLY (claim-time only),
    ///      or PREPAID_ONLY (lock-time only). A disabled callback returns 0; the matching quote leg reports 0.
    function setSubsidyMode(SubsidyModeConfig mode) external override onlyOwner {
        subsidyModeConfig = mode;
        emit SubsidyModeConfigSet(mode);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // reclaim unspent funds (callable while paused)
    function withdrawTokens(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "OPFSubsidy: cannot withdraw to zero address");
        require(amount > 0, "OPFSubsidy: amount must be greater than zero");
        IERC20(token).safeTransfer(to, amount);
        emit Withdraw(token, to, amount);
    }

    function withdrawAllTokens(address token, address to) external onlyOwner nonReentrant {
        require(to != address(0), "OPFSubsidy: cannot withdraw to zero address");
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(to, balance);
        emit Withdraw(token, to, balance);
    }

    // ---------------------------------------------------------------------------------------------
    // Views (clients check remaining subsidy & limits before sending a job)
    // ---------------------------------------------------------------------------------------------

    function getTokenLimits(address token)
        external
        view
        returns (uint256 pctBps, uint256 daily, uint256 weekly, uint256 monthly, bool enabled)
    {
        TokenLimits memory L = tokenLimits[token];
        return (L.pctBps, L.daily, L.weekly, L.monthly, L.enabled);
    }

    // period index for an arbitrary timestamp (useful to look up usage for a specific date)
    function getDayByTimestamp(uint256 timestamp) public pure returns (uint256) {
        return timestamp / DAY;
    }

    function getWeekByTimestamp(uint256 timestamp) public pure returns (uint256) {
        return timestamp / WEEK;
    }

    function getMonthByTimestamp(uint256 timestamp) public pure returns (uint256) {
        return timestamp / MONTH;
    }

    function currentDayIndex() public view returns (uint256) {
        return getDayByTimestamp(block.timestamp);
    }

    function currentWeekIndex() public view returns (uint256) {
        return getWeekByTimestamp(block.timestamp);
    }

    function currentMonthIndex() public view returns (uint256) {
        return getMonthByTimestamp(block.timestamp);
    }

    // usage in the CURRENT period
    function dailyUsedBy(address payer, address token) public view returns (uint256) {
        return dailyUsed[payer][token][getDayByTimestamp(block.timestamp)];
    }

    function weeklyUsedBy(address payer, address token) public view returns (uint256) {
        return weeklyUsed[payer][token][getWeekByTimestamp(block.timestamp)];
    }

    function monthlyUsedBy(address payer, address token) public view returns (uint256) {
        return monthlyUsed[payer][token][getMonthByTimestamp(block.timestamp)];
    }

    // usage in the period CONTAINING `timestamp` (look up consumption for a specific date)
    function dailyUsedByAt(address payer, address token, uint256 timestamp) public view returns (uint256) {
        return dailyUsed[payer][token][getDayByTimestamp(timestamp)];
    }

    function weeklyUsedByAt(address payer, address token, uint256 timestamp) public view returns (uint256) {
        return weeklyUsed[payer][token][getWeekByTimestamp(timestamp)];
    }

    function monthlyUsedByAt(address payer, address token, uint256 timestamp) public view returns (uint256) {
        return monthlyUsed[payer][token][getMonthByTimestamp(timestamp)];
    }

    function remainingDaily(address payer, address token) public view returns (uint256) {
        uint256 limit = tokenLimits[token].daily;
        if (limit == 0) return type(uint256).max;
        uint256 used = dailyUsedBy(payer, token);
        return limit > used ? limit - used : 0;
    }

    function remainingWeekly(address payer, address token) public view returns (uint256) {
        uint256 limit = tokenLimits[token].weekly;
        if (limit == 0) return type(uint256).max;
        uint256 used = weeklyUsedBy(payer, token);
        return limit > used ? limit - used : 0;
    }

    function remainingMonthly(address payer, address token) public view returns (uint256) {
        uint256 limit = tokenLimits[token].monthly;
        if (limit == 0) return type(uint256).max;
        uint256 used = monthlyUsedBy(payer, token);
        return limit > used ? limit - used : 0;
    }

    /**
     * @dev Per-user period headroom independent of any specific job: min of the three period
     *      remainings capped by the contract balance (ignores pct / gating). Useful for dashboards.
     */
    // ISubsidyView: "claimable now" - min of the period headrooms capped by balance, gated to 0 when
    // the user is not allowed or the provider is paused. ALWAYS FINITE (each remaining* may be
    // unlimited, but the balance cap makes the result finite, and the gate returns 0 up front).
    function remainingSubsidy(address payer, address token) external view override returns (uint256) {
        if (paused() || !_isAllowed(userAccessList, payer)) return 0;
        uint256 rem = _min(
            _min(remainingDaily(payer, token), remainingWeekly(payer, token)),
            remainingMonthly(payer, token)
        );
        uint256 bal = IERC20(token).balanceOf(address(this));
        return _min(rem, bal);
    }

    /// @dev ISubsidyView: a rolling-cap provider exposes nested DAY / WEEK / MONTH buckets (take the
    ///      MIN across them, never the sum). A period limit of 0 is reported as `unlimited == true`
    ///      with limit/remaining == 0. `resetsAt` is the absolute unix ts of the next window reset.
    function subsidyBuckets(address payer, address token)
        external
        view
        override
        returns (BucketReport memory)
    {
        TokenLimits memory L = tokenLimits[token];
        Bucket[] memory buckets = new Bucket[](3);
        buckets[0] = _bucket(Period.DAY, DAY, L.daily, dailyUsedBy(payer, token), remainingDaily(payer, token));
        buckets[1] = _bucket(Period.WEEK, WEEK, L.weekly, weeklyUsedBy(payer, token), remainingWeekly(payer, token));
        buckets[2] = _bucket(Period.MONTH, MONTH, L.monthly, monthlyUsedBy(payer, token), remainingMonthly(payer, token));
        return BucketReport({
            paused: paused(),
            userAllowed: _isAllowed(userAccessList, payer),
            tokenEnabled: L.enabled,
            buckets: buckets
        });
    }

    // build a Bucket, mapping the "limit == 0 means unlimited" convention onto the explicit `unlimited`
    // flag (finite fields, no sentinel) and computing the absolute next-reset timestamp for the window.
    function _bucket(Period period, uint256 windowSeconds, uint256 limit, uint256 used, uint256 rem)
        internal
        view
        returns (Bucket memory)
    {
        bool isUnlimited = (limit == 0);
        return Bucket({
            period: period,
            periodSeconds: windowSeconds, // NOTE: MONTH is 4 weeks (28 days), not a calendar month
            unlimited: isUnlimited,
            limit: isUnlimited ? 0 : limit,
            used: used,
            remaining: isUnlimited ? 0 : rem,
            resetsAt: block.timestamp + (windowSeconds - (block.timestamp % windowSeconds))
        });
    }

    // ISubsidyView / ERC-165 discovery
    function subsidyKind() external pure override returns (SubsidyKind) {
        return SubsidyKind.ROLLING_WINDOW;
    }

    function version() external pure override returns (uint16) {
        return 1;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(ISubsidyView).interfaceId
            || interfaceId == type(ISubsidyProvider).interfaceId
            || interfaceId == type(ISubsidyLockProvider).interfaceId
            || interfaceId == type(ISubsidyViewV2).interfaceId
            || interfaceId == type(ISubsidyModeConfig).interfaceId;
    }

    /**
     * @dev Exactly what onSubsidyClaim would grant for a hypothetical job (applies pct, all caps,
     *      balance, and all three gates; returns 0 if paused / token disabled / user, node or jobType
     *      not allowed). The headline "how much will OPF cover for THIS job" getter. No state change.
     */
    function quoteSubsidy(
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 amount,
        uint256 subsidyNeeded
    ) external view override returns (Quote memory) {
        // subsidy only; OPF never pays a node bonus in v1 (bonus == 0). v1 quoteSubsidy mirrors the
        // claim-time (refund) leg, so it reports 0 when that mode is disabled.
        uint256 s = _refundEnabled() ? _computeGrant(node, payer, jobType, token, amount, subsidyNeeded) : 0;
        return Quote({subsidy: s, bonus: 0});
    }

    /**
     * @dev ISubsidyViewV2: report BOTH legs for a hypothetical job, tagged by mode. Here both the
     *      REIMBURSEMENT (onSubsidyClaim) and PREFUNDED (onSubsidyLock) legs draw from the SAME shared
     *      budget via _computeGrant, so both report the same figure. They are each a "max if used
     *      alone" value and are NOT additive — spending one reduces what is left for the other.
     */
    function quoteSubsidyModes(
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 amount,
        uint256 subsidyNeeded
    ) external view override returns (ModeQuote[] memory) {
        uint256 g = _computeGrant(node, payer, jobType, token, amount, subsidyNeeded);
        ModeQuote[] memory quotes = new ModeQuote[](2);
        // each leg reports 0 when its mode is disabled by the owner
        quotes[0] = ModeQuote(SubsidyMode.REIMBURSEMENT, _refundEnabled() ? g : 0, 0);
        quotes[1] = ModeQuote(SubsidyMode.PREFUNDED, _prepaidEnabled() ? g : 0, 0);
        return quotes;
    }

    /// @dev ISubsidyViewV2: single-leg accessor. Both modes share one budget, so the figure is the
    ///      same for either `mode` here.
    function quoteSubsidyByMode(
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 amount,
        uint256 subsidyNeeded,
        SubsidyMode mode
    ) external view override returns (uint256 subsidy, uint256 bonus) {
        bool enabled = mode == SubsidyMode.REIMBURSEMENT ? _refundEnabled() : _prepaidEnabled();
        if (!enabled) return (0, 0);
        return (_computeGrant(node, payer, jobType, token, amount, subsidyNeeded), 0);
    }

    function isUserAllowed(address payer) external view override returns (bool) {
        return _isAllowed(userAccessList, payer);
    }

    function isNodeAllowed(address node) external view override returns (bool) {
        return _isAllowed(nodeAccessList, node);
    }

    function getAllowedJobTypes() external view override returns (uint256[] memory) {
        return _allowedJobTypes;
    }

    function isJobTypeSubsidized(uint256 jobType) external view override returns (bool) {
        return _allowedJobTypes.length == 0 || isJobTypeAllowed[jobType];
    }

    function secondsUntilDayReset() external view returns (uint256) {
        return DAY - (block.timestamp % DAY);
    }

    function secondsUntilWeekReset() external view returns (uint256) {
        return WEEK - (block.timestamp % WEEK);
    }

    function secondsUntilMonthReset() external view returns (uint256) {
        return MONTH - (block.timestamp % MONTH);
    }

    function availableBalance(address token) external view override returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
