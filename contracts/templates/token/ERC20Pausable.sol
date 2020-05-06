pragma solidity ^0.5.7;

import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';

contract ERC20Pausable is ERC20 {

    bool internal paused    = false;
    
    modifier onlyNotPaused() {
        require(
            !paused,
            'DataToken: this token contract is paused' 
        );
        _;
    }

    modifier onlyPaused() {
        require(
            paused,
            'DataToken: this token contract is not paused' 
        );
        _;
    }

    function transfer(address to, uint256 value) public onlyNotPaused returns (bool) {
        return super.transfer(to, value);
    }

    function transferFrom(address from, address to, uint256 value) public onlyNotPaused returns (bool) {
        return super.transferFrom(from, to, value);
    }

    function approve(address spender, uint256 value) public onlyNotPaused returns (bool) {
        return super.approve(spender, value);
    }

    function increaseAllowance(address spender, uint256 addedValue) public onlyNotPaused returns (bool) {
        return super.increaseAllowance(spender, addedValue);
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public onlyNotPaused returns (bool) {
        return super.decreaseAllowance(spender, subtractedValue);
    }
}