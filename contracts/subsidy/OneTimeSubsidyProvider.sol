pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import '../interfaces/IERC20.sol';
import '../utils/SafeERC20.sol';
import '../interfaces/ISubsidyProvider.sol';
import '../interfaces/ISubsidyView.sol';
import '../interfaces/IAccessList.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/utils/introspection/IERC165.sol';

/**
 * @title OneTimeSubsidyProvider
 * @dev A one-time onboarding-credit sponsorship program. A concrete `ISubsidyProvider` that the
 *      escrow consults at claim time. It sponsors part of a payer's job cost (never a node bonus)
 *      out of a per-user ONE-TIME credit budget: e.g. "every eligible user gets 10 USDC of free
 *      compute to learn the platform, a close friend gets 20". Unlike OPFSubsidyProvider there are
 *      NO rolling day/week/month windows - the credit is a CUMULATIVE budget drawn down across many
 *      jobs until exhausted, and it only refreshes when an admin explicitly RESETS it (globally for
 *      everyone, or per user).
 *
 *      Grant per claim is capped by, in order:
 *        - the payer's remaining credit for the token (effectiveCredit - used-this-round),
 *        - an OPTIONAL per-job percentage-of-job ceiling (basis points; 0 == no per-job cap),
 *        - the contract's own token balance,
 *      and gated by: token.enabled, a user AccessList, a node AccessList, and an owner-managed
 *      jobType allowlist (empty allowlist == all jobTypes allowed).
 *
 *      NOTE on pctBps semantics (INTENTIONALLY INVERTED vs OPFSubsidyProvider): here `pctBps == 0`
 *      means "no per-job cap" (the whole remaining credit may be spent on a single job, the natural
 *      onboarding default), whereas in OPFSubsidyProvider `pctBps == 0` means "grant nothing".
 *
 *      RESET MODEL: usage is keyed by a per-user "round" index; a reset just advances the round to a
 *      fresh, empty slot (no per-user storage loop, O(1) and gas-cheap). effectiveRound(payer) =
 *      globalRound + userRound[payer]. resetAllUsers() increments globalRound, refreshing EVERY user
 *      (including any who were individually reset); resetUser(payer) increments only that user's
 *      offset. Both indices are monotonic, so a slot that already holds usage is never revisited.
 *      Per-user credit overrides and userRound persist across a global reset - only usage resets (the
 *      friend stays at 20 next round).
 *
 *      Funds are plain ERC20 transfers to this contract; the owner reclaims unspent funds via
 *      withdrawTokens / withdrawAllTokens.
 *
 *      Security (per ISubsidyProvider (a)/(b)/(c)): onSubsidyClaim (a) only pays a registered escrow
 *      (the drain guard), (b) authenticates payer/node/jobType via the gates, and (c) persists the
 *      per-round budget spend BEFORE the just-in-time approve (CEI), so listing this provider many
 *      times in one claim can never double-spend.
 *
 *      OPERATOR NOTES (shared constraints of the subsidy design, same as OPFSubsidyProvider):
 *        - Enable only standard ERC20s. For a fee-on-transfer / under-delivering token the escrow's
 *          reject-partial pull can leave a payer's credit marked used with NO subsidy delivered (a
 *          griefing/leak, never an over-drain: tokens out <= _used growth <= remaining credit). The
 *          provider cannot observe the escrow's received amount, so it cannot self-correct.
 *        - setAuthorizedEscrow(escrow, false) flips the drain guard but does NOT zero any standing
 *          ERC20 allowance to that escrow. In the honest flow the allowance is always spent to 0 in
 *          the same claim, so this matters only for an escrow that was already malicious/buggy.
 */
contract OneTimeSubsidyProvider is ISubsidyProvider, ISubsidyView, IERC165, ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // pctBps is in basis points: 10000 == 100%
    uint256 public constant BPS = 10000;
    // upper bound on the jobType allowlist size, so a future replace can never exceed the block gas
    // limit and freeze the gate config (owner self-DoS guard).
    uint256 public constant MAX_ALLOWED_JOBTYPES = 100;

    // per-token config
    struct TokenConfig {
        uint256 pctBps;        // OPTIONAL per-job ceiling in basis points (0 == no per-job cap)
        uint256 defaultCredit; // global one-time credit per user for this token, in token wei
        bool enabled;          // token subsidised only when true
    }

    mapping(address => TokenConfig) public tokenConfig;   // token -> config
    mapping(address => bool) public authorizedEscrow;     // escrows allowed to call onSubsidyClaim

    address public userAccessList; // payer must hold a token in this list (address(0) == gate off)
    address public nodeAccessList; // node must hold a token in this list (address(0) == gate off)

    uint256[] private _allowedJobTypes;              // owner-managed allowlist (empty == all allowed)
    mapping(uint256 => bool) public isJobTypeAllowed; // O(1) membership, kept in sync with the array

    // per-user credit override; the flag distinguishes "override == 0" from "use the default".
    mapping(address => mapping(address => uint256)) private _userCredit;    // [payer][token] => amount
    mapping(address => mapping(address => bool)) private _hasUserCredit;    // [payer][token] => override set

    // reset accounting: usage is keyed by the payer's effective round, so a reset just moves the key.
    uint256 public globalRound;                    // resetAllUsers() increments this
    mapping(address => uint256) public userRound;  // per-user reset offset, added on top of globalRound
    // [payer][token][round] => cumulative subsidy used within that round
    mapping(address => mapping(address => mapping(uint256 => uint256))) private _used;

    // events
    event SubsidyGranted(
        address indexed escrow,
        address indexed node,
        address indexed payer,
        address token,
        uint256 amount,
        uint256 round
    );
    event TokenConfigSet(address indexed token, uint256 pctBps, uint256 defaultCredit, bool enabled);
    event UserCreditSet(address indexed payer, address indexed token, uint256 amount);
    event UserCreditUnset(address indexed payer, address indexed token);
    event AllUsersReset(uint256 newGlobalRound);
    event UserReset(address indexed payer, uint256 newUserRound);
    event UserAccessListSet(address indexed accessList);
    event NodeAccessListSet(address indexed accessList);
    event AllowedJobTypesSet(uint256[] jobTypes);
    event AuthorizedEscrowSet(address indexed escrow, bool allowed);
    event Withdraw(address indexed token, address indexed to, uint256 amount);

    // ---------------------------------------------------------------------------------------------
    // Core: ISubsidyProvider callback
    // ---------------------------------------------------------------------------------------------

    /**
     * @dev Consulted by the escrow once per list entry. Returns (subsidyAmount, 0). Never reverts on
     *      the eligibility path: an ineligible / unauthorised call returns (0,0) so NO approve is
     *      granted. Effects (the per-round counter) are persisted BEFORE the just-in-time approve.
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

        uint256 grant = _computeGrant(node, payer, jobType, token, amount, subsidyNeeded);
        if (grant == 0) return (0, 0);

        uint256 round = effectiveRound(payer);

        // EFFECTS before INTERACTION (CEI): (c) persist the per-round budget spend
        _used[payer][token][round] += grant;

        // INTERACTION: just-in-time approve the escrow (msg.sender) to pull exactly `grant`
        IERC20(token).approve(msg.sender, grant);

        emit SubsidyGranted(msg.sender, node, payer, token, grant, round);
        return (grant, 0); // bonus always 0
    }

    /**
     * @dev Shared grant math used by BOTH onSubsidyClaim and quoteSubsidy so they can never diverge.
     *      Applies paused / token.enabled / the three gates, then caps the grant by the payer's
     *      remaining one-time credit, the optional pct ceiling, and the contract's token balance.
     *      Pure view (no state change).
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
        TokenConfig memory c = tokenConfig[token];
        if (!c.enabled) return 0;
        if (!_isAllowed(userAccessList, payer)) return 0; // (b) user gate
        if (!_isAllowed(nodeAccessList, node)) return 0;   // (b) node gate
        if (_allowedJobTypes.length != 0 && !isJobTypeAllowed[jobType]) return 0; // (b) jobType gate

        uint256 credit = effectiveCredit(payer, token);
        if (credit == 0) return 0;

        uint256 used = _used[payer][token][effectiveRound(payer)];
        uint256 remaining = credit > used ? credit - used : 0;

        uint256 grant = _min(subsidyNeeded, remaining);  // never exceed escrow need or credit
        if (c.pctBps != 0) {
            grant = _min(grant, (amount * c.pctBps) / BPS);    // optional per-job ceiling
        }
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (grant > bal) grant = bal;                          // only grant what we can deliver
        return grant;
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    // list == address(0) => gate off (allow all); else membership == balanceOf > 0
    function _isAllowed(address list, address who) internal view returns (bool) {
        if (list == address(0)) return true;
        return IAccessListContract(list).balanceOf(who) > 0;
    }

    // ---------------------------------------------------------------------------------------------
    // Credit configuration
    // ---------------------------------------------------------------------------------------------

    /**
     * @dev The one-time credit a payer gets for `token`: their override if set, else the token's
     *      global default. Independent of how much they have already used.
     */
    function effectiveCredit(address payer, address token) public view returns (uint256) {
        if (_hasUserCredit[payer][token]) return _userCredit[payer][token];
        return tokenConfig[token].defaultCredit;
    }

    // alias for dashboards
    function creditOf(address payer, address token) external view returns (uint256) {
        return effectiveCredit(payer, token);
    }

    function hasUserCredit(address payer, address token) external view returns (bool) {
        return _hasUserCredit[payer][token];
    }

    function setTokenConfig(
        address token,
        uint256 pctBps,
        uint256 defaultCredit,
        bool enabled
    ) external onlyOwner {
        require(token != address(0), "OneTimeSubsidy: token is zero address");
        require(pctBps <= BPS, "OneTimeSubsidy: pctBps > BPS");
        tokenConfig[token] = TokenConfig(pctBps, defaultCredit, enabled);
        emit TokenConfigSet(token, pctBps, defaultCredit, enabled);
    }

    // set a per-user credit override (e.g. a close friend gets more than the default)
    function setUserCredit(address payer, address token, uint256 amount) public onlyOwner {
        require(payer != address(0), "OneTimeSubsidy: payer is zero address");
        require(token != address(0), "OneTimeSubsidy: token is zero address");
        _userCredit[payer][token] = amount;
        _hasUserCredit[payer][token] = true;
        emit UserCreditSet(payer, token, amount);
    }

    // batch the same override amount across many users (e.g. an onboarding cohort)
    function setUserCredits(address[] calldata payers, address token, uint256 amount) external onlyOwner {
        for (uint256 i = 0; i < payers.length; i++) {
            setUserCredit(payers[i], token, amount);
        }
    }

    // drop a per-user override so the payer falls back to the token default
    function unsetUserCredit(address payer, address token) external onlyOwner {
        _hasUserCredit[payer][token] = false;
        _userCredit[payer][token] = 0;
        emit UserCreditUnset(payer, token);
    }

    // ---------------------------------------------------------------------------------------------
    // Reset (admin): refresh the one-time credit for everyone or a single user
    // ---------------------------------------------------------------------------------------------

    // reset usage for ALL users: advance the global round so every effectiveRound points to a fresh
    // (empty) usage slot - including users who were individually reset. Overrides persist; only
    // consumption resets.
    function resetAllUsers() external onlyOwner {
        globalRound += 1;
        emit AllUsersReset(globalRound);
    }

    // reset usage for a SINGLE user: bump only this user's offset so their usage slot is fresh,
    // without touching anyone else. Monotonic; a later resetAllUsers() still refreshes them too.
    function resetUser(address payer) public onlyOwner {
        userRound[payer] += 1;
        emit UserReset(payer, effectiveRound(payer));
    }

    function resetUsers(address[] calldata payers) external onlyOwner {
        for (uint256 i = 0; i < payers.length; i++) {
            resetUser(payers[i]);
        }
    }

    // the round whose usage slot a payer currently draws from
    function effectiveRound(address payer) public view returns (uint256) {
        return globalRound + userRound[payer];
    }

    // ---------------------------------------------------------------------------------------------
    // Owner configuration (gates / escrow / pause / withdraw) - same shape as OPFSubsidyProvider
    // ---------------------------------------------------------------------------------------------

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
        require(jobTypes.length <= MAX_ALLOWED_JOBTYPES, "OneTimeSubsidy: too many jobTypes");
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
        require(escrow != address(0), "OneTimeSubsidy: escrow is zero address");
        authorizedEscrow[escrow] = allowed;
        emit AuthorizedEscrowSet(escrow, allowed);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // reclaim unspent funds (callable while paused)
    function withdrawTokens(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "OneTimeSubsidy: cannot withdraw to zero address");
        require(amount > 0, "OneTimeSubsidy: amount must be greater than zero");
        IERC20(token).safeTransfer(to, amount);
        emit Withdraw(token, to, amount);
    }

    function withdrawAllTokens(address token, address to) external onlyOwner nonReentrant {
        require(to != address(0), "OneTimeSubsidy: cannot withdraw to zero address");
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(to, balance);
        emit Withdraw(token, to, balance);
    }

    // ---------------------------------------------------------------------------------------------
    // Views (clients check remaining credit & config before sending a job)
    // ---------------------------------------------------------------------------------------------

    function getTokenConfig(address token)
        external
        view
        returns (uint256 pctBps, uint256 defaultCredit, bool enabled)
    {
        TokenConfig memory c = tokenConfig[token];
        return (c.pctBps, c.defaultCredit, c.enabled);
    }

    // cumulative subsidy the payer has used in their CURRENT round
    function usedBy(address payer, address token) public view returns (uint256) {
        return _used[payer][token][effectiveRound(payer)];
    }

    // usage the payer had in a specific round (e.g. look up a past round's consumption)
    function usedByAt(address payer, address token, uint256 round) external view returns (uint256) {
        return _used[payer][token][round];
    }

    // credit the payer has left in their current round (ignores contract balance)
    function remainingCredit(address payer, address token) public view returns (uint256) {
        uint256 credit = effectiveCredit(payer, token);
        uint256 used = usedBy(payer, token);
        return credit > used ? credit - used : 0;
    }

    // ISubsidyView: "claimable now" - remaining credit capped by the contract balance, and gated to 0
    // when the user is not allowed or the provider is paused (so it is finite and safely summable).
    function remainingSubsidy(address payer, address token) external view override returns (uint256) {
        if (paused() || !_isAllowed(userAccessList, payer)) return 0;
        uint256 rem = remainingCredit(payer, token);
        uint256 bal = IERC20(token).balanceOf(address(this));
        return _min(rem, bal);
    }

    /// @dev ISubsidyView: a one-time provider has a single ONE_TIME bucket (no fixed window / timer),
    ///      wrapped with the payer-side eligibility flags.
    function subsidyBuckets(address payer, address token)
        external
        view
        override
        returns (BucketReport memory)
    {
        uint256 limit = effectiveCredit(payer, token);
        uint256 used = usedBy(payer, token);
        Bucket[] memory buckets = new Bucket[](1);
        buckets[0] = Bucket({
            period: Period.ONE_TIME,
            periodSeconds: 0,  // one-time: no fixed window
            unlimited: false,  // a one-time credit is always a finite cap
            limit: limit,
            used: used,
            remaining: limit > used ? limit - used : 0,
            resetsAt: 0        // resets are admin-driven (resetUser / resetAllUsers), no timer
        });
        return BucketReport({
            paused: paused(),
            userAllowed: _isAllowed(userAccessList, payer),
            tokenEnabled: tokenConfig[token].enabled,
            buckets: buckets
        });
    }

    // ISubsidyView / ERC-165 discovery
    function subsidyKind() external pure override returns (SubsidyKind) {
        return SubsidyKind.ONE_TIME;
    }

    function version() external pure override returns (uint16) {
        return 1;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(ISubsidyView).interfaceId
            || interfaceId == type(ISubsidyProvider).interfaceId;
    }

    /**
     * @dev Exactly what onSubsidyClaim would grant for a hypothetical job (applies pct, credit,
     *      balance, and all three gates; returns 0 if paused / token disabled / user, node or jobType
     *      not allowed). The headline "how much will this cover for THIS job" getter. No state change.
     */
    function quoteSubsidy(
        address node,
        address payer,
        uint256 jobType,
        address token,
        uint256 amount,
        uint256 subsidyNeeded
    ) external view override returns (Quote memory) {
        // subsidy only; this provider never pays a node bonus (bonus == 0)
        return Quote({subsidy: _computeGrant(node, payer, jobType, token, amount, subsidyNeeded), bonus: 0});
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

    function availableBalance(address token) external view override returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
