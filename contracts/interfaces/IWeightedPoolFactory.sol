pragma solidity >= 0.8.0;



import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWeightedPoolFactory {



   function create(
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        uint256 swapFeePercentage,
        address owner
    ) external returns (address);





}

