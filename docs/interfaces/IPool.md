# Solidity API

## IPool

### getDatatokenAddress

```solidity
function getDatatokenAddress() external view returns (address)
```

### getBaseTokenAddress

```solidity
function getBaseTokenAddress() external view returns (address)
```

### getController

```solidity
function getController() external view returns (address)
```

### setup

```solidity
function setup(address datatokenAddress, uint256 datatokenAmount, uint256 datatokennWeight, address baseTokenAddress, uint256 baseTokenAmount, uint256 baseTokenWeight) external
```

### swapExactAmountIn

```solidity
function swapExactAmountIn(address[3] tokenInOutMarket, uint256[4] amountsInOutMaxFee) external returns (uint256 tokenAmountOut, uint256 spotPriceAfter)
```

### swapExactAmountOut

```solidity
function swapExactAmountOut(address[3] tokenInOutMarket, uint256[4] amountsInOutMaxFee) external returns (uint256 tokenAmountIn, uint256 spotPriceAfter)
```

### getAmountInExactOut

```solidity
function getAmountInExactOut(address tokenIn, address tokenOut, uint256 tokenAmountOut, uint256 _consumeMarketSwapFee) external view returns (uint256, uint256, uint256, uint256, uint256)
```

### getAmountOutExactIn

```solidity
function getAmountOutExactIn(address tokenIn, address tokenOut, uint256 tokenAmountIn, uint256 _consumeMarketSwapFee) external view returns (uint256, uint256, uint256, uint256, uint256)
```

### setSwapFee

```solidity
function setSwapFee(uint256 swapFee) external
```

### getId

```solidity
function getId() external pure returns (uint8)
```

### exitswapPoolAmountIn

```solidity
function exitswapPoolAmountIn(uint256 poolAmountIn, uint256 minAmountOut) external returns (uint256 tokenAmountOut)
```

### joinswapExternAmountIn

```solidity
function joinswapExternAmountIn(uint256 tokenAmountIn, uint256 minPoolAmountOut) external returns (uint256 poolAmountOut)
```

