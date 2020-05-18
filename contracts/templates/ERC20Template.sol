pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import '../fee/FeeManager.sol';
import './token/ERC20Pausable.sol';

/**
* @title ERC20Template 
* @dev ERC20Template is a Data Token ERC20 compliant template 
*      used by the factory contract
*/
contract ERC20Template is ERC20Pausable {
    using SafeMath for uint256;
    
    bool    private initialized = false;
    string  private _name;
    string  private _symbol;
    uint256 private _cap;
    uint256 private _decimals;
    address private _minter;

    FeeManager serviceFeeManager;
    
    modifier onlyNotInitialized() {
        require(
            !initialized,
            'ERC20Template: token instance already initialized'
        );
        _;
    }
    
    modifier onlyMinter() {
        require(
            msg.sender == _minter,
            'ERC20Template: invalid minter' 
        );
        _;
    }
    
    /**
     * @notice only used prior contract deployment
     */
    constructor(
        string memory name,
        string memory symbol,
        address minter,
        uint256 cap,
        address payable feeManager

    )
        public
    {
        _initialize(
            name,
            symbol,
            minter,
            cap,
            feeManager
        );
    }
    
    /**
     * @notice only used prior token instance setup (all state variables will be initialized)
        "initialize(string,string,address)","datatoken-1","dt-1",0xBa3e0EC852Dc24cA7F454ea545D40B1462501711
     */
    function initialize(
        string memory name,
        string memory symbol,
        address minter,
        uint256 cap,
        address payable feeManager
    ) 
        public
        onlyNotInitialized 
    {
        _initialize(
            name,
            symbol,
            minter,
            cap,
            feeManager
        );
    }
    
    function _initialize(
        string memory name,
        string memory symbol,
        address minter,
        uint256 cap,
        address payable feeManager
    ) private {
        require(
            minter != address(0), 
            'ERC20Template: Invalid minter,  zero address'
        );
        
        require(
            feeManager != address(0), 
            'ERC20Template: Invalid feeManager, zero address'
        );

        require(
            _minter == address(0), 
            'ERC20Template: Invalid minter, access denied'
        );

        require(
            cap > 0,
            'ERC20Template: Invalid cap value'
        );
        
        _decimals = 0;
        _cap = cap;
        _name = name;
        _symbol = symbol;
        _minter = minter;
        serviceFeeManager = FeeManager(feeManager);
        initialized = true;
    }
    
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
            'ERC20Template: cap exceeded'
        );
        require(
            msg.value >= serviceFeeManager.calculateFee(value, _cap), 
            'ERC20Template: invalid data token minting fee'
        );
        _mint(account, value);
        address(serviceFeeManager).transfer(msg.value);
    }

    function pause() public onlyNotPaused onlyMinter {
        paused = true;
    }

    function unpause() public onlyPaused onlyMinter {
        paused = false;
    }

    function setMinter(address minter) public onlyNotPaused onlyMinter {
        _minter = minter;
    }
    
    function name() public view returns(string memory) {
        return _name;
    }
    
    function symbol() public view returns(string memory) {
        return _symbol;
    }
    
    function decimals() public view returns(uint256) {
        return _decimals;
    }
    
    function cap() public view returns (uint256) {
        return _cap;
    }
    
    function isMinter(address account) public view returns(bool) {
        return (_minter == account);
    } 
    
    function isInitialized() public view returns(bool) {
        return initialized;
    }

    function isPaused() public view returns(bool) {
        return paused;
    }
}