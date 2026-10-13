pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20ShortTransfer
 * @dev A deflationary-style ERC20 that, when armed, UNDER-DELIVERS on BOTH `transfer` and
 *      `transferFrom`: the recipient receives `amount - fee` while the SENDER's balance only drops by
 *      the delivered `amount - fee` (the fee is simply never moved). Both calls still return true and
 *      never revert.
 *
 *      Purpose (test-only): exercise the escrow's two under-delivery branches WITHOUT a revert:
 *        - lock-time pull: the escrow's reject-partial `transferFrom` sees it received < `want`, so the
 *          provider contributes 0 (no sponsorship recorded);
 *        - refund-time push: the escrow's guarded low-level `transfer` sees its own balance dropped by
 *          LESS than `refund` (ok == true but !dropped), so it falls back to providerReclaimable instead
 *          of bricking the claim / cancel.
 *      This complements MockBlacklistToken (which drives the SAME reclaimable fallback via a REVERTING
 *      push, ok == false) and MockERC20FeeOnTransfer (which only fees transferFrom).
 */
contract MockERC20ShortTransfer is ERC20 {
    bool public feeActive;
    uint256 public feeBps; // e.g. 1000 == 10% under-delivery

    constructor() ERC20("ShortTransfer", "SHORT") {
        _mint(msg.sender, 1e28);
    }

    function setFee(bool active, uint256 bps) external {
        feeActive = active;
        feeBps = bps;
    }

    // deliver amount-fee; the fee is never moved, so the SENDER's balance drops by only (amount-fee).
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (!feeActive) return super.transfer(to, amount);
        uint256 fee = (amount * feeBps) / 10000;
        _transfer(_msgSender(), to, amount - fee);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (!feeActive) return super.transferFrom(from, to, amount);
        uint256 fee = (amount * feeBps) / 10000;
        _spendAllowance(from, _msgSender(), amount);
        _transfer(from, to, amount - fee);
        return true;
    }
}
