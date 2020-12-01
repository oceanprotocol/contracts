pragma solidity >=0.5.0;
//interface that all 1SS compatible contracts should expose
interface IOneSidedStake {
    function newDataTokenCreated(
        address datatokenAddress,
        address basetokenAddress,
        address poolAddress,
        address publisherAddress,
        uint256 burnInEndBlock,
        uint256[] calldata ssParams
    ) external returns (bool);
    function getDataTokenCirculatingSupply(address datatokenAddress) external view returns (uint);
    function getPublisherAddress(address datatokenAddress) external view returns(address);
    function getBaseTokenAddress(address datatokenAddress) external view returns(address);
    function getPoolAddress(address datatokenAddress) external view returns(address);
    function getBaseTokenBalance(address datatokenAddress) external view returns(uint);
    function getDataTokenBalance(address datatokenAddress) external view returns(uint);
    function getburnInEndBlock(address datatokenAddress) external view returns(uint);
    function getvestingEndBlock(address datatokenAddress) external view returns(uint);
    function getvestingAmount(address datatokenAddress) external view returns(uint);
    function getvestingLastBlock(address datatokenAddress) external view returns(uint);
    function getvestingAmountSoFar(address datatokenAddress) external view returns(uint);
    function isInBurnIn(address datatokenAddress) external view returns (bool);
    function calcInGivenOut(address datatokenAddress,address tokenIn,address tokenOut,uint256 tokenAmountOut) external view returns (uint256);
    function calcOutGivenIn(address datatokenAddress,address tokenIn,address tokenOut,uint256 tokenAmountIn) external view returns (uint256);
    function canStake(address datatokenAddress,address stakeToken,uint256 amount) external view returns (bool);
    function Stake(address datatokenAddress,address stakeToken,uint256 amount) external;
    function canUnStake(address datatokenAddress,address stakeToken,uint256 amount) external view returns (bool);
    function UnStake(address datatokenAddress,address stakeToken,uint256 amount) external;
    function notifyFinalize(address datatokenAddress) external;
    function allowStake(address datatokenAddress,address basetoken,uint datatokenAmount,uint basetokenAmount,address userAddress) external view returns (bool);
    function allowUnStake(address datatokenAddress,address basetoken,uint datatokenAmount,uint basetokenAmount,address userAddress) external view returns (bool);
    function swapExactAmountIn(address datatokenAddress,address userAddress,address tokenIn,uint tokenAmountIn,address tokenOut,uint minAmountOut) external returns (uint tokenAmountOut);
    function swapExactAmountOut(address datatokenAddress,address userAddress,address tokenIn,uint maxTokenAmountIn,address tokenOut,uint amountOut) external returns (uint tokenAmountIn);

}
