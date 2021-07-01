pragma solidity >= 0.7.0;



import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/IERC20.sol";

interface IOceanPoolFactory {



   function createPool(
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        uint256 swapFeePercentage,
        uint256 oceanFee,
        uint256 marketFee, 
        address owner
    ) external returns (address);


   function createPoolWithFork(address controller) external returns(address);


}
