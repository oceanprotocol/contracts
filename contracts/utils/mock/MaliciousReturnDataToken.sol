pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MaliciousReturnDataToken
 * @dev An ERC20 that, when `junkBytes` is set (1..31), returns that many bytes of garbage from
 *      transferFrom WITHOUT moving any tokens. Used to prove the escrow's subsidy pull uses a
 *      low-level call + balanceOf-diff (not a `returns(bool)` decode that would revert on short
 *      returndata). `junkBytes == 0` behaves as a normal ERC20 (so it can be deposited first).
 */
contract MaliciousReturnDataToken is ERC20 {
    uint256 public junkBytes; // 0 = normal; 1..31 = return that many junk bytes, move nothing

    constructor() ERC20("Junk", "JUNK") {
        _mint(msg.sender, 1e28);
    }

    function setJunkBytes(uint256 n) external {
        junkBytes = n;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 n = junkBytes;
        if (n == 0) {
            return super.transferFrom(from, to, amount);
        }
        // return n bytes of junk (all 0xff), move nothing
        assembly {
            mstore(0x00, not(0))
            return(0x00, n)
        }
    }
}

/**
 * @title FallbackReturningTwoUints
 * @dev A NON-provider contract whose bare fallback returns two non-zero uints and which can hold a
 *      standing escrow allowance. It pins the documented residual exposure: a third-party smart
 *      account with a standing allowance that returns two uints from its fallback IS pulled from
 *      when a node names it as a "provider". A future change that closes this must do so deliberately.
 */
contract FallbackReturningTwoUints {
    uint256 public subsidyRet;
    uint256 public bonusRet;

    function configure(uint256 s, uint256 b) external {
        subsidyRet = s;
        bonusRet = b;
    }

    function approveToken(address token, address spender, uint256 amount) external {
        IERC20(token).approve(spender, amount);
    }

    fallback(bytes calldata) external returns (bytes memory) {
        return abi.encode(subsidyRet, bonusRet);
    }
}

/**
 * @title RevertingFallback
 * @dev A contract whose fallback always reverts; used to prove such an address is skipped.
 */
contract RevertingFallback {
    fallback() external {
        revert("RevertingFallback: nope");
    }
}
