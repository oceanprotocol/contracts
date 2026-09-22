pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20FeeOnTransfer
 * @dev ERC20 that (when armed) deducts a fee on transferFrom, delivering less than requested. Used
 *      to prove the escrow's reject-partial branch: a provider whose transferFrom under-delivers
 *      (received < wantTotal) contributes 0. The fee only applies to transferFrom (so a plain
 *      deposit with the fee disarmed works), and the fee is burned from the sender.
 */
contract MockERC20FeeOnTransfer is ERC20 {
    bool public feeActive;
    uint256 public feeBps; // e.g. 1000 = 10%

    constructor() ERC20("FeeOnTransfer", "FOT") {
        _mint(msg.sender, 1e28);
    }

    function setFee(bool active, uint256 bps) external {
        feeActive = active;
        feeBps = bps;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (!feeActive) {
            return super.transferFrom(from, to, amount);
        }
        uint256 fee = (amount * feeBps) / 10000;
        _spendAllowance(from, _msgSender(), amount);
        _transfer(from, to, amount - fee);
        if (fee > 0) _burn(from, fee);
        return true;
    }
}

/**
 * @title MockERC20NoReturn
 * @dev USDT-style ERC20 whose transfer / transferFrom return NO data (while still moving tokens).
 *      `approve` still returns a bool so a provider can approve it. Used to prove the escrow's
 *      subsidy pull works via a low-level call (not a `returns(bool)` decode), and that deposits via
 *      SafeERC20 accept empty returndata.
 */
contract MockERC20NoReturn {
    string public constant name = "NoReturn";
    string public constant symbol = "NORET";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        totalSupply = 1e28;
        balanceOf[msg.sender] = 1e28;
        emit Transfer(address(0), msg.sender, 1e28);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // returns NOTHING on purpose (USDT-style)
    function transfer(address to, uint256 amount) external {
        _move(msg.sender, to, amount);
    }

    // returns NOTHING on purpose (USDT-style)
    function transferFrom(address from, address to, uint256 amount) external {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "NORET: allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "NORET: balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
