pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';

/**
* @title ERC20Pausable
*  
* @dev ERC20Pausable adds the ability to pause ERC20 compliant template 
*      used by the ERC20Template contract for pausing the contract.
*/
contract ERC20Pausable is ERC20 {

    bool internal paused = false;
    
    modifier onlyNotPaused() {
        require(
            !paused,
            'ERC20Pausable: this token contract is paused' 
        );
        _;
    }

    modifier onlyPaused() {
        require(
            paused,
            'ERC20Pausable: this token contract is not paused' 
        );
        _;
    }

    /**
     * @dev approve
     *      Standard ERC20 approve function with onlyNotPaused modifier.
     *      Can be called only if the contract is not paused.
     * @param spender refers to an address that is allowed to spend tokens.
     * @param value refers to amount of tokens that could be spent.
     * @return true if approval is success, false otherwise.
     */
    function approve(
        address spender, 
        uint256 value
    ) 
        public 
        onlyNotPaused 
        returns (bool) 
    {
        return super.approve(spender, value);
    }

    /**
     * @dev increaseAllowance
     *      Standard ERC20 increaseAllowance function with onlyNotPaused modifier.
     *      Can be called only if the contract is not paused.
     * @param spender refers to an address that is allowed to spend tokens.
     * @param addedValue refers to an added amount of tokens that could be spent.
     * @return true if allowance is increased successfully, false otherwise.
     */
    function increaseAllowance(
        address spender, 
        uint256 addedValue
    ) 
        public 
        onlyNotPaused 
        returns (bool) 
    {
        return super.increaseAllowance(spender, addedValue);
    }

    /**
     * @dev decreaseAllowance
     *      Standard ERC20 decreaseAllowance function with onlyNotPaused modifier.
     *      Can be called only if the contract is not paused.
     * @param spender refers to an address that is allowed to spend tokens.
     * @param subtractedValue refers to an subtracted amount of tokens that could be spent.
     * @return true if allowance is decreased successfully, false otherwise.
     */
    function decreaseAllowance(
        address spender, 
        uint256 subtractedValue
    ) 
        public 
        onlyNotPaused 
        returns (bool) 
    {
        return super.decreaseAllowance(spender, subtractedValue);
    }
}