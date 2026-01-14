pragma solidity 0.8.12;
// Copyright Ocean Protocol contributors
// SPDX-License-Identifier: Apache-2.0

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title GrantsToken
 * @dev Implementation of the ERC20 token named "Grants" with additional features:
 *      - Burnable: allows token holders to burn their tokens
 *      - Capped: token supply has a maximum cap
 *      - Ownable: owner can manage the token (minting, pausing)
 *      - Pausable: owner can pause/unpause token transfers
 *      - Permit: allows gasless token approvals via EIP-2612
 */
contract GrantsToken is
    ERC20,
    ERC20Burnable,
    ERC20Capped,
    ERC20Permit,
    Ownable,
    Pausable
{
    // Events
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);

    uint8 private constant _DECIMALS = 6;

    /**
     * @dev Constructor for GrantsToken
     * @param initialSupply Initial amount of tokens to mint (in wei, accounting for 6 decimals)
     * @param cap Maximum token supply cap (in wei, accounting for 6 decimals)
     */
    constructor(uint256 initialSupply, uint256 cap)
        ERC20("COMPY", "COMPY")
        ERC20Permit("COMPY")
        ERC20Capped(cap)
    {
        require(initialSupply <= cap, "GrantsToken: initial supply exceeds cap");
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
            emit TokensMinted(msg.sender, initialSupply);
        }
    }

    /**
     * @dev Returns the number of decimals used for this token
     * @return uint8 The number of decimals (6)
     */
    function decimals() public view override returns (uint8) {
        return _DECIMALS;
    }

    /**
     * @dev Mint new tokens (only owner)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount)
        public
        onlyOwner
    {
        require(to != address(0), "GrantsToken: cannot mint to zero address");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @dev Pause all token transfers (only owner)
     */
    function pause() public onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause token transfers (only owner)
     */
    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * @dev Get the current token cap
     * @return uint256 The maximum token supply
     */
    function cap() public view override(ERC20Capped) returns (uint256) {
        return super.cap();
    }

    /**
     * @dev Internal function to update balances before token transfer
     * Ensures minting doesn't exceed cap and pausing works correctly
     */
    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Capped)
    {
        super._mint(to, amount);
    }

    /**
     * @dev Internal function to handle before token transfer hook
     * Implements pause functionality
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20) whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    /**
     * @dev Override burn to emit custom event
     */
    function burn(uint256 amount) public override(ERC20Burnable) {
        address burner = _msgSender();
        super.burn(amount);
        emit TokensBurned(burner, amount);
    }

    /**
     * @dev Override burnFrom to emit custom event
     */
    function burnFrom(address account, uint256 amount)
        public
        override(ERC20Burnable)
    {
        super.burnFrom(account, amount);
        emit TokensBurned(account, amount);
    }
}
