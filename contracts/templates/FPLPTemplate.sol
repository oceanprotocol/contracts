pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import '../interfaces/IERC20Template.sol';

/**
 * @title FixedPriceLiquidtyProvider Template
 *
 * @dev FixedPriceLiquidtyProvider Template is a Swap Contract for fixed prices
 *      Used by the factory contract as a bytecode reference to deploy new FixedPriceLiquidtyProvider.
 */
contract FPLPTemplate {
    address private _lpAddress;
    address private _basetoken;
    address private _datatoken;
    uint256 private _ratio;
    bool private initialized = false;

    modifier onlyNotInitialized() {
        require(!initialized, 'FPLPTemplate: instance already initialized');
        _;
    }

    /**
     * @dev constructor
     *      Called on contract deployment.  Could not be called with zero address parameters or zero ratio
     * @param lpAddress address that is providing liquidity (usually datatoken minter)
     * @param basetoken base token (IE: Ocean)
     * @param datatoken DataToken address
     * @param ratio exchange rate (IE: How many basetokens are required to get a DataToken)
     */
    constructor(
        address lpAddress,
        address basetoken,
        address datatoken,
        uint256 ratio
    ) public {
        _initialize(lpAddress, basetoken, datatoken, ratio);
    }

    function initialize(
        address lpAddress,
        address basetoken,
        address datatoken,
        uint256 ratio
    ) public onlyNotInitialized returns (bool) {
        return _initialize(lpAddress, basetoken, datatoken, ratio);
    }

    function _initialize(
        address lpAddress,
        address basetoken,
        address datatoken,
        uint256 ratio
    ) private onlyNotInitialized returns (bool) {
        require(
            lpAddress != address(0),
            'FPLPTemplate: Invalid LP,  zero address'
        );
        require(
            basetoken != address(0),
            'FPLPTemplate: Invalid basetoken,  zero address'
        );
        require(
            datatoken != address(0),
            'FPLPTemplate: Invalid datatoken,  zero address'
        );
        require(
            basetoken != datatoken,
            'PLPTemplate: Invalid datatoken,  equals basetoken'
        );
        require(ratio > 0, 'FPLPTemplate: Invalid ratio value');
        _lpAddress = lpAddress;
        _basetoken = basetoken;
        _datatoken = datatoken;
        _ratio = ratio;
    }

    /**
     * @dev isInitialized
     *      Function checks if the contract is initialized.
     * @return true if the contract is initialized, false if it is not.
     */

    function isInitialized() public view returns (bool) {
        return initialized;
    }

    /**
     * @dev buyDataTokens
     *      Buys Datatokens using base token
     * @param dtAmount amount of DataTokens to be bought
     * @return true
     */
    function buyDataTokens(uint256 dtAmount) public returns (bool) {
        //TO DO - This assumes that ratio is going to be always expressed in wei
        uint256 baseAmount = dtAmount * (_ratio / (10**18));
        //TO DO  - should we check the reserve first or just let it fail if there is not enough DT ?
        require(
            IERC20Template(_basetoken).transfer(_lpAddress, baseAmount),
            'ERROR: transfer failed'
        );
        require(
            IERC20Template(_datatoken).transferFrom(
                _lpAddress,
                msg.sender,
                dtAmount
            ),
            'ERROR: transferFrom failed'
        );
        return true;
    }

    /**
     * @dev getRatio
     *      Gets Ratio
     * @return uint ratio
     */
    function getRatio() public view returns (uint256) {
        return (_ratio);
    }

    /**
     * @dev getTokens
     *      Gets tokens addresses
     * @return address[] tokens
     */
    function getTokens() public view returns (address[] memory) {
        address[] memory tokens = new address[](2);
        tokens[0] = _basetoken;
        tokens[1] = _datatoken;
        return (tokens);
    }

    /**
     * @dev getDTReserve
     *      Gets amount of DT available to trade
     * @return uint amount of DT
     */
    function getDTReserve() public view returns (uint256) {
        //get both balance & allowence and return the smaller one
        uint256 balance = IERC20Template(_datatoken).balanceOf(_lpAddress);
        uint256 allowance = IERC20Template(_datatoken).allowance(
            _lpAddress,
            address(this)
        );
        if (balance < allowance) return (balance);
        else return (allowance);
    }
}
