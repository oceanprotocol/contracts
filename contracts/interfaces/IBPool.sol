pragma solidity >=0.5.0;
//reduced no of functions for BPool
interface IBPool {
    function getDataTokenAddress() external view returns (address);
    function getBaseTokenAddress() external view returns (address);
    function getController() external view returns (address);
    function setup(
        address dataTokenAaddress,
        uint256 dataTokenAmount,
        uint256 dataTokenWeight,
        address baseTokenAddress,
        uint256 baseTokenAmount,
        uint256 baseTokenWeight) external;
}
