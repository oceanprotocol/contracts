pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ISubsidyLockProvider.sol";

/**
 * @title SponsorshipLib
 * @dev Lock-time ("pre-funded") sponsorship engine for the Ocean escrows, factored into an EXTERNAL
 *      (delegatecall-linked) library so most of the provider-interaction bytecode lives once outside each
 *      escrow (EIP-170 headroom — audit risk #5). The library's external functions are DELEGATECALLed by
 *      the escrow, so they execute in the ESCROW's storage/identity context:
 *        - storage mapping parameters (sponsorships / sponsoredTotal / providerReclaimable) resolve to the
 *          escrow's own slots (the escrow declares them; the library only receives references),
 *        - `address(this)` is the escrow, so `token.transferFrom(provider, address(this), …)` pulls to the
 *          escrow and `token.transfer(provider, …)` pushes from the escrow balance,
 *        - a CALL made here to a provider carries `msg.sender == address(this) == escrow` (the provider's
 *          `require(msg.sender == authorizedEscrow)` passes),
 *        - events emitted here are attributed to the escrow address (same topic as IEscrowLockSubsidy).
 *      Behaviour is byte-identical to the previously in-escrow helpers.
 */
library SponsorshipLib {
    // The sponsorship backing a lock, keyed in the escrow by keccak256(abi.encode(payee, payer, jobId)).
    struct Sponsorship { uint256 total; uint256 jobType; address[] providers; uint256[] amounts; }

    // Same signatures as IEscrowLockSubsidy; under delegatecall they log against the escrow address.
    event LockSponsored(address indexed payer,address indexed payee,uint256 jobId,address token,address provider,uint256 amount);
    event SponsorRefunded(address indexed payer,address indexed payee,uint256 jobId,address token,address provider,uint256 amount,bool reclaimable);

    // gas forwarded to the (revert-swallowed) onSubsidyRefund notify; bounds griefing in the
    // permissionless cancel batch while leaving room for the provider's budget bookkeeping.
    uint256 private constant REFUND_NOTIFY_GAS = 120000;
    // gas forwarded to the refund PUSH transfer; generous for any standard ERC20 but caps a
    // callback/ERC-777-token gas-bomb so it cannot OOG-brick a claim or the permissionless cancel
    // batch (on OOG/revert the amount falls through to providerReclaimable, recoverable via sweep).
    uint256 private constant REFUND_PUSH_GAS = 100000;

    /* ===================== external (delegatecall-linked) ===================== */

    /**
     * @dev createLock / reLock-grow. Consults each UNIQUE non-payer provider for up-front sponsorship of
     *      `lockAmount`; `remaining` starts at `lockAmount` and decrements; each provider is capped at
     *      min(grant, remaining) then pulled reject-partial. Contributions are merged by provider address
     *      into sponsorships[lockId] (so a repeat provider on reLock-grow accumulates), and the newly
     *      sponsored amount is added to sponsorship.total, sponsorship.jobType and sponsoredTotal[token].
     *      One bad provider/token never reverts the lock (low-level quote, reject-partial pull).
     * @return added newly sponsored amount (S on create, S_add on grow); <= lockAmount by the cap.
     */
    function applyLockSubsidies(
        mapping(bytes32 => Sponsorship) storage sponsorships,
        mapping(address => uint256) storage sponsoredTotal,
        uint256 jobId,
        bytes32 lockId,
        address node,
        address payer,
        address token,
        uint256 jobType,
        uint256 lockAmount,
        address[] memory providers
    ) external returns (uint256 added) {
        Sponsorship storage sp = sponsorships[lockId];
        uint256 remaining = lockAmount;
        for (uint256 i = 0; i < providers.length; i++) {
            if (remaining == 0) break;
            address provider = providers[i];
            if (provider == payer) continue;
            if (_seen(providers, i, provider)) continue; // no stacked grants from a repeated entry
            uint256 want = _consult(lockId, node, payer, token, jobType, lockAmount, provider, remaining);
            if (want == 0) continue;
            _record(sp, provider, want); // merge by address
            added += want;
            remaining -= want;
            emit LockSponsored(payer, node, jobId, token, provider, want);
        }
        if (added > 0) {
            sp.total += added;
            sp.jobType = jobType;
            sponsoredTotal[token] += added;
        }
    }

    /**
     * @dev claim / cancel full settlement. Consume `consume` from the stored amounts in LIST ORDER
     *      (exact, no division), refund each provider its unused remainder amt_i - consumed_i (push +
     *      reclaimable fallback + revert-swallowing onSubsidyRefund notify), then decrement
     *      sponsoredTotal by the whole total and delete the sponsorship entry.
     *      consume = fromSponsored (claim, amount C <= L) or 0 (cancel -> full refund).
     */
    function settleRefund(
        mapping(bytes32 => Sponsorship) storage sponsorships,
        mapping(address => uint256) storage sponsoredTotal,
        mapping(address => mapping(address => uint256)) storage providerReclaimable,
        bytes32 lockId,
        address payee,
        address payer,
        uint256 jobId,
        address token,
        uint256 consume
    ) external {
        Sponsorship storage sp = sponsorships[lockId];
        uint256 jobType = sp.jobType;
        uint256 total = sp.total;
        uint256 np = sp.providers.length;
        // EFFECTS first (CEI): snapshot providers + per-provider refunds, then clear state, THEN push.
        address[] memory provs = new address[](np);
        uint256[] memory refs = new uint256[](np);
        uint256 rem = consume;
        for (uint256 i = 0; i < np; i++) {
            uint256 amt = sp.amounts[i];
            uint256 c = amt < rem ? amt : rem;
            rem -= c;
            provs[i] = sp.providers[i];
            refs[i] = amt - c;
        }
        sponsoredTotal[token] -= total;
        delete sponsorships[lockId];
        // INTERACTIONS last
        for (uint256 i = 0; i < np; i++) {
            if (refs[i] > 0) _refundOne(providerReclaimable, lockId, provs[i], payee, payer, jobId, jobType, token, refs[i]);
        }
    }

    /**
     * @dev reLock-shrink. Refund the sponsored reduction d = S_old - S_new IN LIST ORDER
     *      (refund_i = min(amt_i, remaining_d) walking providers — NOT per-provider flooring, which can
     *      over-assign the last provider), reduce each provider's stored amount, decrement sponsoredTotal
     *      by d, and set total = S_new (or delete the entry when S_new == 0).
     */
    function shrinkSponsored(
        mapping(bytes32 => Sponsorship) storage sponsorships,
        mapping(address => uint256) storage sponsoredTotal,
        mapping(address => mapping(address => uint256)) storage providerReclaimable,
        bytes32 lockId,
        address payee,
        address payer,
        uint256 jobId,
        address token,
        uint256 S_old,
        uint256 S_new
    ) external {
        uint256 d = S_old - S_new;
        Sponsorship storage sp = sponsorships[lockId];
        uint256 jobType = sp.jobType;
        uint256 np = sp.providers.length;
        // EFFECTS first (CEI): snapshot providers + per-provider refunds and apply all state, THEN push.
        address[] memory provs = new address[](np);
        uint256[] memory refs = new uint256[](np);
        uint256 remD = d;
        for (uint256 i = 0; i < np; i++) {
            uint256 amt = sp.amounts[i];
            uint256 r = amt < remD ? amt : remD;
            remD -= r;
            provs[i] = sp.providers[i];
            refs[i] = r;
            if (r > 0) sp.amounts[i] = amt - r; // keep stored amounts consistent with S_new
        }
        sponsoredTotal[token] -= d;
        if (S_new == 0) { delete sponsorships[lockId]; }
        else { sp.total = S_new; }
        // INTERACTIONS last
        for (uint256 i = 0; i < np; i++) {
            if (refs[i] > 0) _refundOne(providerReclaimable, lockId, provs[i], payee, payer, jobId, jobType, token, refs[i]);
        }
    }

    /* ===================== internal helpers (embedded in the library) ===================== */

    // true if `provider` appears in list[0..upto)
    function _seen(address[] memory list, uint256 upto, address provider) private pure returns (bool) {
        for (uint256 j = 0; j < upto; j++) { if (list[j] == provider) return true; }
        return false;
    }

    // record `want` for `provider`, merging into its existing slot by address (reLock-grow accumulates)
    function _record(Sponsorship storage sp, address provider, uint256 want) private {
        uint256 plen = sp.providers.length;
        for (uint256 k = 0; k < plen; k++) {
            if (sp.providers[k] == provider) { sp.amounts[k] += want; return; }
        }
        sp.providers.push(provider);
        sp.amounts.push(want);
    }

    // LOW-LEVEL onSubsidyLock quote (failed call OR <32-byte returndata contributes 0), cap at
    // `remaining`, then a reject-partial pull. Returns the accepted amount.
    function _consult(bytes32 lockId, address node, address payer, address token, uint256 jobType,
        uint256 lockAmount, address provider, uint256 remaining) private returns (uint256 want) {
        if (provider.code.length == 0) return 0;
        (bool ok, bytes memory data) = provider.call(
            abi.encodeWithSelector(ISubsidyLockProvider.onSubsidyLock.selector,
                lockId, node, payer, jobType, token, lockAmount, remaining));
        if (!ok || data.length < 32) return 0;
        uint256 sponsorAmount = abi.decode(data, (uint256));
        want = sponsorAmount < remaining ? sponsorAmount : remaining; // cap
        if (want == 0) return 0;
        if (!_pull(token, provider, want)) return 0; // reject-partial
        return want;
    }

    // guarded token pull: low-level transferFrom(provider -> escrow); balanceOf-diff is the sole source
    // of truth; returns true only if the escrow received the FULL `want` (reject-partial). address(this)
    // is the escrow under delegatecall, so tokens land in the escrow.
    function _pull(address token, address provider, uint256 want) private returns (bool) {
        uint256 b = IERC20(token).balanceOf(address(this));
        (bool ok,) = token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, provider, address(this), want));
        if (!ok) return false;
        uint256 a = IERC20(token).balanceOf(address(this));
        return (a >= b ? a - b : 0) >= want;
    }

    // PUSH one provider's refund via a guarded low-level transfer (never safeTransfer — a reverting /
    // blacklisting token must not brick the claim or the permissionless cancel batch); on failure credit
    // providerReclaimable. Then notify onSubsidyRefund (revert-swallowing, gas-bounded) so the provider
    // can restore its budget — called in BOTH branches (budget restored regardless of push success).
    function _refundOne(
        mapping(address => mapping(address => uint256)) storage providerReclaimable,
        bytes32 lockId,
        address provider,
        address payee,
        address payer,
        uint256 jobId,
        uint256 jobType,
        address token,
        uint256 refund
    ) private {
        uint256 b = IERC20(token).balanceOf(address(this));
        (bool ok,) = token.call{gas: REFUND_PUSH_GAS}(abi.encodeWithSelector(IERC20.transfer.selector, provider, refund));
        uint256 a = IERC20(token).balanceOf(address(this));
        bool dropped = b >= a && (b - a) >= refund;
        if (!ok || !dropped) {
            providerReclaimable[provider][token] += refund;
            emit SponsorRefunded(payer, payee, jobId, token, provider, refund, true);
        } else {
            emit SponsorRefunded(payer, payee, jobId, token, provider, refund, false);
        }
        provider.call{gas: REFUND_NOTIFY_GAS}(abi.encodeWithSelector(
            ISubsidyLockProvider.onSubsidyRefund.selector, lockId, payee, payer, jobType, token, refund));
    }
}
