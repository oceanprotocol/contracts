pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
 * @title MockUSDT
 * @dev Minimal USDT-style token for tests. Two non-standard behaviours that break a raw `approve`:
 *        - approve / transfer / transferFrom return NO boolean (bare no-return), so a caller that ABI-
 *          decodes a bool reverts; and
 *        - approve enforces "reset the allowance to zero before changing a non-zero allowance".
 *      Exercises the SafeERC20 zero-then-set path in the subsidy providers.
 */
contract MockUSDT {
    string public name = "Tether USD";
    string public symbol = "USDT";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint256 supply) {
        totalSupply = supply;
        balanceOf[msg.sender] = supply;
    }

    // no return value; enforces the USDT zero-first rule on a non-zero -> non-zero change
    function approve(address spender, uint256 value) external {
        require(value == 0 || allowance[msg.sender][spender] == 0, "USDT: use zero-first");
        allowance[msg.sender][spender] = value;
    }

    function transfer(address to, uint256 value) external {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
    }

    function transferFrom(address from, address to, uint256 value) external {
        uint256 a = allowance[from][msg.sender];
        require(a >= value, "USDT: insufficient allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - value;
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }
}
