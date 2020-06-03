pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import '../fee/FeeManager.sol';
import './token/ERC20Pausable.sol';
import '../interfaces/IERC20Template.sol';
/**
* @title DataTokenTemplate
*  
* @dev DataTokenTemplate is an ERC20 compliant token template
*      Used by the factory contract as a bytecode reference to 
*      deploy new DataTokens.
*/
contract DataTokenTemplate is IERC20Template, ERC20Pausable {
    using SafeMath for uint256;
    
    bool    private initialized = false;
    string  private _name;
    string  private _symbol;
    string  private _blob;
    uint256 private _cap;
    uint256 private _decimals;
    address private _minter;

    FeeManager serviceFeeManager;
    
    modifier onlyNotInitialized() {
        require(
            !initialized,
            'DataTokenTemplate: token instance already initialized'
        );
        _;
    }
    
    modifier onlyMinter() {
        require(
            msg.sender == _minter,
            'DataTokenTemplate: invalid minter' 
        );
        _;
    }

    /**
     * @dev constructor
     *      Called prior contract deployment
     * @param name refers to a template DataToken name
     * @param symbol refers to a template DataToken symbol
     * @param minter refers to an address that has minter role
     * @param feeManager refers to an address of a FeeManager contract address
     */
    constructor(
        string memory name,
        string memory symbol,
        address minter,
        uint256 cap,
        string memory blob,
        address payable feeManager

    )
        public
    {
        _initialize(
            name,
            symbol,
            minter,
            cap,
            blob,
            feeManager
        );
    }
    
    /**
     * @dev initialize
     *      Called prior contract initialization (e.g creating new DataToken instance)
            Calls private _initialize function. Only if contract is not initialized.
     * @param name refers to a new DataToken name
     * @param symbol refers to a nea DataToken symbol
     * @param minter refers to an address that has minter rights
     * @param feeManager refers to an address of a FeeManager contract address
     */
    function initialize(
        string memory name,
        string memory symbol,
        address minter,
        uint256 cap,
        string memory blob,
        address payable feeManager
    ) 
        public
        onlyNotInitialized
        returns(bool)
    {
        return _initialize(
            name,
            symbol,
            minter,
            cap,
            blob,
            feeManager
        );
    }

    /**
     * @dev _initialize
     *      Private function called on contract initialization.
     * @param name refers to a new DataToken name
     * @param symbol refers to a nea DataToken symbol
     * @param minter refers to an address that has minter rights
     * @param feeManager refers to an address of a FeeManager contract address
     */
    function _initialize(
        string memory name,
        string memory symbol,
        address minter,
        uint256 cap,
        string memory blob,
        address payable feeManager
    )
        private
        returns(bool)
    {
        require(
            minter != address(0), 
            'DataTokenTemplate: Invalid minter,  zero address'
        );
        
        require(
            feeManager != address(0), 
            'DataTokenTemplate: Invalid feeManager, zero address'
        );

        require(
            _minter == address(0), 
            'DataTokenTemplate: Invalid minter, zero address'
        );

        require(
            cap > 0,
            'DataTokenTemplate: Invalid cap value'
        );
        
        _decimals = 0;
        _cap = cap;
        _name = name;
        _blob = blob;
        _symbol = symbol;
        _minter = minter;
        serviceFeeManager = FeeManager(feeManager);
        initialized = true;
        return initialized;
    }

    /**
     * @dev mint
     *      It takes the fee as msg.value and mints new DataTokens
     *      the minting fee is calculated using ServiceFeeManager 
     *      it could be called only if the contract is not paused.
     *      Only the minter address can call it.
     *      msg.value should be higher than zero and gt or eq minting fee
     * @param account refers to an address that token is going to be minted to.
     * @param value refers to amount of tokens that is going to be minted.
     */
    function mint(
        address account,
        uint256 value
    ) 
    public 
    payable 
    onlyNotPaused 
    onlyMinter 
    {
        require(
            totalSupply().add(value) <= _cap, 
            'DataTokenTemplate: cap exceeded'
        );
        require(
            msg.value >= serviceFeeManager.calculateFee(value, _cap), 
            'DataTokenTemplate: invalid data token minting fee'
        );
        _mint(account, value);
        address(serviceFeeManager).transfer(msg.value);
    }

    /**
     * @dev pause
     *      It pauses the contract functionalities (transfer, mint, etc)
     *      Only could be called if the contract is not already paused.
     *      Only called by the minter address.
     */
    function pause() public onlyNotPaused onlyMinter {
        paused = true;
    }

    /**
     * @dev unpause
     *      It unpauses the contract.
     *      Only called if the contract is paused.
     *      Only minter can call it.
     */
    function unpause() public onlyPaused onlyMinter {
        paused = false;
    }

    /**
     * @dev setMinter
     *      It sets a new token minter address.
     *      Only called be called if the contract is not paused.
     *      Only the current minter can call it.
     * @param minter refers to a new token minter address.
     */
    function setMinter(address minter) public onlyNotPaused onlyMinter {
        _minter = minter;
    }

    /**
     * @dev name
     *      It returns the token name.
     * @return DataToken name.
     */
    function name() public view returns(string memory) {
        return _name;
    }

    /**
     * @dev symbol
     *      It returns the token symbol.
     * @return DataToken symbol.
     */
    function symbol() public view returns(string memory) {
        return _symbol;
    }

    /**
     * @dev blob
     *      It returns the blob (e.g https://123.com).
     * @return DataToken blob.
     */
    function blob() public view returns(string memory) {
        return _blob;
    }

    /**
     * @dev decimals
     *      It returns the token decimals.
     *      how many supported decimal points
     * @return DataToken decimals.
     */
    function decimals() public view returns(uint256) {
        return _decimals;
    }

    /**
     * @dev cap
     *      it returns the capital.
     * @return DataToken cap.
     */
    function cap() public view returns (uint256) {
        return _cap;
    }

    /**
     * @dev isMinter
     *      It takes the address and checks whether it has a minter role.
     * @param account refers to the address.
     * @return true if account has a minter role.
     */
    function isMinter(address account) public view returns(bool) {
        return (_minter == account);
    } 

    /**
     * @dev isInitialized
     *      It checks whether the contract is initialized.
     * @return true if the contract is initialized.
     */ 
    function isInitialized() public view returns(bool) {
        return initialized;
    }

    /**
     * @dev isPaused
     *      Function checks if the contract is paused.
     * @return true if the contract is paused.
     */ 
    function isPaused() public view returns(bool) {
        return paused;
    }
}