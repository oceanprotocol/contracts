pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockBlacklistToken
 * @dev A standard ERC20 that can BLACKLIST addresses: any transfer / transferFrom whose `to` is
 *      blacklisted reverts (USDC/USDT-style blocklist). Used to drive the escrow's refund-push
 *      reclaimable fallback: when the escrow pushes an unused sponsored amount back to a blacklisted
 *      provider, the low-level transfer fails (ok == false) and the escrow must credit
 *      providerReclaimable instead of bricking the claim / cancel batch. It must NOT be blacklisted
 *      during deposit / lock pulls, only flipped on before the refund.
 */
contract MockBlacklistToken is ERC20 {
    mapping(address => bool) public blacklisted;

    constructor() ERC20("Blacklist", "BLK") {
        _mint(msg.sender, 1e28);
    }

    function setBlacklisted(address who, bool v) external {
        blacklisted[who] = v;
    }

    function _beforeTokenTransfer(address, address to, uint256) internal view override {
        require(!blacklisted[to], "BLK: recipient blacklisted");
    }
}
