pragma solidity ^0.5.7;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "./ServiceFeeManager.sol";

contract DataTokenTemplate is ERC20, ServiceFeeManager {
    using SafeMath for uint256;
    
    bool private initialized = false;
    string private _name;
    string private _symbol;
    address private _minter;
    uint256 private _cap;
    uint256 private _decimals;
    
    modifier onlyNotInitialized() {
        require(
          !initialized,
          'Token Instance already initialized'
        );
        _;
    }
    
    modifier onlyMinter() {
        require(
            msg.sender == _minter,
            'Invalid minter'
        );
        _;
    }
    
    // only used prior contract deployment
    constructor(
        string memory name,
        string memory symbol,
        address minter
    )
        public
    {
         _initialize(
            name,
            symbol,
            minter
        );
    }
    
    // only used prior token instance setup (all state variables will be initialized)
    // "initialize(string,string,address)","datatoken-1","dt-1",0xBa3e0EC852Dc24cA7F454ea545D40B1462501711
    function initialize(
        string memory name,
        string memory symbol,
        address minter
    ) 
        public
        onlyNotInitialized 
    {
        _initialize(
            name,
            symbol,
            minter
        );
    }
    
    function _initialize(
        string memory name,
        string memory symbol,
        address minter    
    ) private {
        require(minter != address(0), 'Invalid minter:  address(0)');
        require(_minter == address(0), 'Invalid minter: access denied');
        
        _decimals = 18;
        uint256 baseCap = 1400000000;
        _cap = baseCap.mul(uint256(10) ** _decimals);
        
        _name = name;
        _symbol = symbol;
        _minter = minter;
        
        initialized = true;
    }
    
    function mint(address account, uint256 value) public payable onlyMinter {
        require(totalSupply().add(value) <= _cap, "ERC20Capped: cap exceeded");
        
        uint256 startGas = gasleft();
        address payable sender = msg.sender;
        super._mint(address(this), value);

        uint256 fee = getFee(startGas, value); 
        uint256 cashback = getCashback(fee, msg.value);

        require(msg.value >= fee,
            "fee amount is not enough");

        sender.transfer(cashback);

        _transfer(address(this), account, value);

    }
    
    function setMinter(address minter) public onlyMinter {
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
}