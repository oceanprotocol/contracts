pragma solidity ^0.5.7;

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

    address payable private beneficiary;

    FeeManager serviceFeeManager;
    
    modifier onlyNotInitialized() {
        require(
            !initialized,
            'DataToken: token instance already initialized'
        );
        _;
    }
    
    modifier onlyMinter() {
        require(
            msg.sender == _minter,
            'DataToken: invalid minter' 
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
        address payable feeManager

    )
        public
    {
        _initialize(
            name,
            symbol,
            minter,
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
        address payable feeManager
    ) 
        public
        onlyNotInitialized 
    {
        _initialize(
            name,
            symbol,
            minter,
            feeManager
        );
    }
    
    function _initialize(
        string memory name,
        string memory symbol,
        address minter,
        address payable feeManager
    ) private {
        require(minter != address(0), 'Invalid minter:  address(0)');
        require(_minter == address(0), 'Invalid minter: access denied');
        
        _decimals = 18;
        uint256 baseCap = 1400000000;
        _cap = baseCap.mul(uint256(10) ** _decimals);
       
        _name = name;
        _symbol = symbol;
        _minter = minter;

        serviceFeeManager = FeeManager(feeManager);
        beneficiary = feeManager;
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
        uint256 startGas = gasleft();
        require(
            totalSupply().add(value) <= _cap,
            'DataToken: cap exceeded'
        );
        
        _mint(account, value);
        require(
            msg.value >= serviceFeeManager.getFee(startGas, value),
            'DataToken: fee amount is not enough'
        );
        
        beneficiary.transfer(msg.value);
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