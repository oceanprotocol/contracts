pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @dev Mock ERC20 token with configurable decimals and ERC20Permit support.
 *      This is a test utility contract that implements ERC20Permit for testing permit functionality.
 */
contract MockERC20Permit is ERC20, ERC20Permit {
    uint8 private _decimals;

    /**
     * @dev Sets the values for {name}, {symbol}, and {decimals}.
     * @param name_ Token name
     * @param symbol_ Token symbol
     * @param decimals_ Number of decimals
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        _decimals = decimals_;
        _mint(msg.sender, 10e25);
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
