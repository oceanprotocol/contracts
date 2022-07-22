// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
pragma solidity 0.8.12;

//import "OpenZeppelin/openzeppelin-contracts@4.2.0/contracts/token/ERC20/IERC20.sol";
//import "OpenZeppelin/openzeppelin-contracts@4.2.0/contracts/token/ERC20/utils/SafeERC20.sol";
//import "OpenZeppelin/openzeppelin-contracts@4.2.0/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IDFRewards.sol";
import "../interfaces/IPool.sol";

contract DFStrategyV1 is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IDFRewards dfrewards;
    uint8 public id = 1;

    constructor(address _dfrewards) {
        dfrewards = IDFRewards(_dfrewards);
    }

    function claimMultiple(address _to, address[] calldata tokenAddresses)
        public
    {
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            dfrewards.claimFor(_to, tokenAddresses[i]);
        }
    }

    // Recipient claims for themselves
    function claim(address[] calldata tokenAddresses) external returns (bool) {
        claimMultiple(msg.sender, tokenAddresses);
        return true;
    }

    function claimables(address _to, address[] calldata tokenAddresses)
        external
        view
        returns (uint256[] memory result)
    {
        result = new uint256[](tokenAddresses.length);
        for (uint256 i = 0; i < tokenAddresses.length; i += 1) {
            result[i] = dfrewards.claimable(_to, tokenAddresses[i]);
        }
        return result;
    }

    /*
     * @dev Claims rewards and stakes them into multiple pools.
     * @param tokenAddress  Token address to claim
     * @param poolAddress  Array of pool address to stake the rewards
     * @param amount Array of amount to stake in each pool.
     */
    function claimAndStake(
        address tokenAddress,
        address[] calldata poolAddress,
        uint256[] calldata amount
    ) public nonReentrant returns (bool) {
        require(poolAddress.length == amount.length, "Lengths must match");
        uint256 totalAmount = 0;
        uint256 i;
        for (i = 0; i < amount.length; i += 1) {
            totalAmount += amount[i];
        }
        require(
            dfrewards.claimable(msg.sender, tokenAddress) > totalAmount,
            "Not enough rewards"
        );
        uint256 balanceBefore = IERC20(tokenAddress).balanceOf(address(this));
        uint256 claimed = dfrewards.claimForStrat(msg.sender, tokenAddress); // claim rewards for strategy
        uint256 balanceAfter = IERC20(tokenAddress).balanceOf(address(this));
        require(balanceAfter - balanceBefore == claimed, "Not enough rewards");

        for (i = 0; i < amount.length; i += 1) {
            stake(tokenAddress, poolAddress[i], amount[i], msg.sender);
        }

        if (claimed > totalAmount) {
            IERC20(tokenAddress).safeTransfer(
                msg.sender,
                claimed - totalAmount
            );
        }

        return true;
    }

    function stake(
        address tokenAddress,
        address poolAddress,
        uint256 amount,
        address _to
    ) internal returns (bool) {
        require(
            tokenAddress == IPool(poolAddress).getBaseTokenAddress(),
            "Cannot stake"
        );
        uint256 balanceBefore = IERC20(poolAddress).balanceOf(address(this));
        IERC20(tokenAddress).approve(poolAddress, amount);
        IPool(poolAddress).joinswapExternAmountIn(amount, 0);
        uint256 sharesBalance = IERC20(poolAddress).balanceOf(address(this)) -
            balanceBefore;
        IERC20(poolAddress).safeTransfer(_to, sharesBalance);
        return true;
    }
}
