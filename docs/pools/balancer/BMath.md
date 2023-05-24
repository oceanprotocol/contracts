# Solidity API

## BMath

### _swapPublishMarketFee

```solidity
uint256 _swapPublishMarketFee
```

### _swapFee

```solidity
uint256 _swapFee
```

### router

```solidity
address router
```

### _datatokenAddress

```solidity
address _datatokenAddress
```

### _baseTokenAddress

```solidity
address _baseTokenAddress
```

### communityFees

```solidity
mapping(address => uint256) communityFees
```

### publishMarketFees

```solidity
mapping(address => uint256) publishMarketFees
```

### getOPCFee

```solidity
function getOPCFee() public view returns (uint256)
```

### swapfees

```solidity
struct swapfees {
  uint256 LPFee;
  uint256 oceanFeeAmount;
  uint256 publishMarketFeeAmount;
  uint256 consumeMarketFee;
}
```

### calcSpotPrice

```solidity
function calcSpotPrice(uint256 tokenBalanceIn, uint256 tokenWeightIn, uint256 tokenBalanceOut, uint256 tokenWeightOut, uint256 _swapMarketFee) internal view returns (uint256 spotPrice)
```

### calcOutGivenIn

```solidity
function calcOutGivenIn(uint256[4] data, uint256 tokenAmountIn, uint256 _consumeMarketSwapFee) public view returns (uint256 tokenAmountOut, uint256 balanceInToAdd, struct BMath.swapfees _swapfees)
```

### calcInGivenOut

```solidity
function calcInGivenOut(uint256[4] data, uint256 tokenAmountOut, uint256 _consumeMarketSwapFee) public view returns (uint256 tokenAmountIn, uint256 tokenAmountInBalance, struct BMath.swapfees _swapfees)
```

### calcPoolOutGivenSingleIn

```solidity
function calcPoolOutGivenSingleIn(uint256 tokenBalanceIn, uint256 poolSupply, uint256 tokenAmountIn) internal pure returns (uint256 poolAmountOut)
```

### calcSingleInGivenPoolOut

```solidity
function calcSingleInGivenPoolOut(uint256 tokenBalanceIn, uint256 poolSupply, uint256 poolAmountOut) internal pure returns (uint256 tokenAmountIn)
```

### calcSingleOutGivenPoolIn

```solidity
function calcSingleOutGivenPoolIn(uint256 tokenSupply, uint256 poolSupply, uint256 poolAmountIn) internal pure returns (uint256 tokenAmountOut)
```

### calcPoolInGivenSingleOut

```solidity
function calcPoolInGivenSingleOut(uint256 tokenBalanceOut, uint256 poolSupply, uint256 tokenAmountOut) internal pure returns (uint256 poolAmountIn)
```

