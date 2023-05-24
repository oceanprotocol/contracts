# Solidity API

## BPool

_Used by the (Ocean version) BFactory contract as a bytecode reference to
     deploy new BPools.

This contract is a friendly fork of Balancer [1]
 [1] https://github.com/balancer-labs/balancer-core/contracts/.

All fees are expressed in wei.  Examples:
 (1e17 = 10 % , 1e16 = 1% , 1e15 = 0.1%, 1e14 = 0.01%)_

### Record

```solidity
struct Record {
  bool bound;
  uint256 index;
  uint256 denorm;
  uint256 balance;
}
```

### LOG_SWAP

```solidity
event LOG_SWAP(address caller, address tokenIn, address tokenOut, uint256 tokenAmountIn, uint256 tokenAmountOut, uint256 timestamp, uint256 inBalance, uint256 outBalance, uint256 newSpotPrice)
```

### LOG_JOIN

```solidity
event LOG_JOIN(address caller, address tokenIn, uint256 tokenAmountIn, uint256 timestamp)
```

### LOG_SETUP

```solidity
event LOG_SETUP(address caller, address baseToken, uint256 baseTokenAmountIn, uint256 baseTokenWeight, address datatoken, uint256 datatokenAmountIn, uint256 datatokenWeight)
```

### LOG_EXIT

```solidity
event LOG_EXIT(address caller, address tokenOut, uint256 tokenAmountOut, uint256 timestamp)
```

### LOG_CALL

```solidity
event LOG_CALL(bytes4 sig, address caller, uint256 timestamp, bytes data)
```

### LOG_BPT

```solidity
event LOG_BPT(uint256 bptAmount)
```

### LOG_BPT_SS

```solidity
event LOG_BPT_SS(uint256 bptAmount)
```

### OPCFee

```solidity
event OPCFee(address caller, address OPCWallet, address token, uint256 amount)
```

### SwapFeeChanged

```solidity
event SwapFeeChanged(address caller, uint256 amount)
```

### PublishMarketFee

```solidity
event PublishMarketFee(address caller, address marketAddress, address token, uint256 amount)
```

### ConsumeMarketFee

```solidity
event ConsumeMarketFee(address to, address token, uint256 amount)
```

### SWAP_FEES

```solidity
event SWAP_FEES(uint256 LPFeeAmount, uint256 oceanFeeAmount, uint256 marketFeeAmount, uint256 consumeMarketFeeAmount, address tokenFeeAddress)
```

### PublishMarketFeeChanged

```solidity
event PublishMarketFeeChanged(address caller, address newMarketCollector, uint256 swapFee)
```

### Gulped

```solidity
event Gulped(address token, uint256 oldBalance, uint256 newBalance)
```

### _lock_

```solidity
modifier _lock_()
```

### _viewlock_

```solidity
modifier _viewlock_()
```

### _publishMarketCollector

```solidity
address _publishMarketCollector
```

### ssContract

```solidity
contract ISideStaking ssContract
```

### getId

```solidity
function getId() public pure returns (uint8)
```

_getId
     Return template id in case we need different ABIs. 
     If you construct your own template, please make sure to change the hardcoded value_

### isInitialized

```solidity
function isInitialized() external view returns (bool)
```

### initialize

```solidity
function initialize(address controller, address factory, uint256[] swapFees, bool publicSwap, bool finalized, address[2] tokens, address[1] feeCollectors) external returns (bool)
```

### setup

```solidity
function setup(address datatokenAddress, uint256 datatokenAmount, uint256 datatokenWeight, address baseTokenAddress, uint256 baseTokenAmount, uint256 baseTokenWeight) external
```

_setup
     Initial setup of the pool
     Can be called only by the controller_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | datatokenAddress |
| datatokenAmount | uint256 | how many datatokens in the initial reserve |
| datatokenWeight | uint256 | datatoken weight (hardcoded in deployer at 50%) |
| baseTokenAddress | address | base token |
| baseTokenAmount | uint256 | how many basetokens in the initial reserve |
| baseTokenWeight | uint256 | base weight (hardcoded in deployer at 50%) |

### isPublicSwap

```solidity
function isPublicSwap() external view returns (bool)
```

_isPublicSwap
     Returns true if swapping is allowed_

### isFinalized

```solidity
function isFinalized() external view returns (bool)
```

_isFinalized
     Returns true if pool is finalized_

### isBound

```solidity
function isBound(address t) external view returns (bool)
```

_isBound
     Returns true if token is bound_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| t | address | token to be checked |

### _checkBound

```solidity
function _checkBound(address token) internal view
```

### getNumTokens

```solidity
function getNumTokens() external view returns (uint256)
```

_getNumTokens
     Returns number of tokens bounded to pool_

### getCurrentTokens

```solidity
function getCurrentTokens() external view returns (address[] tokens)
```

_getCurrentTokens
     Returns tokens bounded to pool, before the pool is finalized_

### getFinalTokens

```solidity
function getFinalTokens() public view returns (address[] tokens)
```

_getFinalTokens
     Returns tokens bounded to pool, after the pool was finalized_

### collectOPC

```solidity
function collectOPC() external
```

_collectOPC
     Collects and send all OPC Fees to _opcCollector.
     This funtion can be called by anyone, because fees are being sent to _opcCollector_

### getCurrentOPCFees

```solidity
function getCurrentOPCFees() public view returns (address[], uint256[])
```

_getCurrentOPCFees
     Get the current amount of fees which can be withdrawned by OPC_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | address[] - array of tokens addresses         uint256[] - array of amounts |
| [1] | uint256[] |  |

### getCurrentMarketFees

```solidity
function getCurrentMarketFees() public view returns (address[], uint256[])
```

_getCurrentMarketFees
     Get the current amount of fees which can be withdrawned by _publishMarketCollector_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | address[] - array of tokens addresses         uint256[] - array of amounts |
| [1] | uint256[] |  |

### collectMarketFee

```solidity
function collectMarketFee() external
```

_collectMarketFee
     Collects and send all Market Fees to _publishMarketCollector.
     This function can be called by anyone, because fees are being sent to _publishMarketCollector_

### updatePublishMarketFee

```solidity
function updatePublishMarketFee(address _newCollector, uint256 _newSwapFee) external
```

_updatePublishMarketFee
     Set _newCollector as _publishMarketCollector_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newCollector | address | new _publishMarketCollector |
| _newSwapFee | uint256 | new swapFee |

### getDenormalizedWeight

```solidity
function getDenormalizedWeight(address token) external view returns (uint256)
```

_getDenormalizedWeight
     Returns denormalized weight of a token_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | token to be checked |

### getTotalDenormalizedWeight

```solidity
function getTotalDenormalizedWeight() external view returns (uint256)
```

_getTotalDenormalizedWeight
     Returns total denormalized weught of the pool_

### getNormalizedWeight

```solidity
function getNormalizedWeight(address token) external view returns (uint256)
```

_getNormalizedWeight
     Returns normalized weight of a token_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | token to be checked |

### getBalance

```solidity
function getBalance(address token) external view returns (uint256)
```

_getBalance
     Returns the current token reserve amount_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | token to be checked |

### getSwapFee

```solidity
function getSwapFee() external view returns (uint256)
```

_getSwapFee
     Returns the current Liquidity Providers swap fee_

### getMarketFee

```solidity
function getMarketFee() external view returns (uint256)
```

_getMarketFee
     Returns the current fee of publishingMarket_

### getController

```solidity
function getController() external view returns (address)
```

_getController
     Returns the current controller address (ssBot)_

### getDatatokenAddress

```solidity
function getDatatokenAddress() external view returns (address)
```

_getDatatokenAddress
     Returns the current datatoken address_

### getBaseTokenAddress

```solidity
function getBaseTokenAddress() external view returns (address)
```

_getBaseTokenAddress
     Returns the current baseToken address_

### setSwapFee

```solidity
function setSwapFee(uint256 swapFee) public
```

_setSwapFee
     Allows controller to change the swapFee_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| swapFee | uint256 | new swap fee (max 1e17 = 10 % , 1e16 = 1% , 1e15 = 0.1%, 1e14 = 0.01%) |

### finalize

```solidity
function finalize() internal
```

_finalize
     Finalize pool. After this,new tokens cannot be bound_

### bind

```solidity
function bind(address token, uint256 balance, uint256 denorm) internal
```

_bind
     Bind a new token to the pool._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | token address |
| balance | uint256 | initial reserve |
| denorm | uint256 | denormalized weight |

### rebind

```solidity
function rebind(address token, uint256 balance, uint256 denorm) internal
```

_rebind
     Update pool reserves & weight after a token bind_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | token address |
| balance | uint256 | initial reserve |
| denorm | uint256 | denormalized weight |

### getSpotPrice

```solidity
function getSpotPrice(address tokenIn, address tokenOut, uint256 _consumeMarketSwapFee) external view returns (uint256 spotPrice)
```

_getSpotPrice
     Return the spot price of swapping tokenIn to tokenOut_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenIn | address | in token |
| tokenOut | address | out token |
| _consumeMarketSwapFee | uint256 | consume market swap fee |

### getAmountInExactOut

```solidity
function getAmountInExactOut(address tokenIn, address tokenOut, uint256 tokenAmountOut, uint256 _consumeMarketSwapFee) external view returns (uint256 tokenAmountIn, uint256 lpFeeAmount, uint256 oceanFeeAmount, uint256 publishMarketSwapFeeAmount, uint256 consumeMarketSwapFeeAmount)
```

_getAmountInExactOut
     How many tokensIn do you need in order to get exact tokenAmountOut.
            Returns: tokenAmountIn, LPFee, opcFee , publishMarketSwapFee, consumeMarketSwapFee_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenIn | address | token to be swaped |
| tokenOut | address | token to get |
| tokenAmountOut | uint256 | exact amount of tokenOut |
| _consumeMarketSwapFee | uint256 | consume market swap fee |

### getAmountOutExactIn

```solidity
function getAmountOutExactIn(address tokenIn, address tokenOut, uint256 tokenAmountIn, uint256 _consumeMarketSwapFee) external view returns (uint256 tokenAmountOut, uint256 lpFeeAmount, uint256 oceanFeeAmount, uint256 publishMarketSwapFeeAmount, uint256 consumeMarketSwapFeeAmount)
```

_getAmountOutExactIn
     How many tokensOut you will get for a exact tokenAmountIn
            Returns: tokenAmountOut, LPFee, opcFee ,  publishMarketSwapFee, consumeMarketSwapFee_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenIn | address | token to be swaped |
| tokenOut | address | token to get |
| tokenAmountIn | uint256 |  |
| _consumeMarketSwapFee | uint256 | consume market swap fee |

### swapExactAmountIn

```solidity
function swapExactAmountIn(address[3] tokenInOutMarket, uint256[4] amountsInOutMaxFee) external returns (uint256 tokenAmountOut, uint256 spotPriceAfter)
```

_swapExactAmountIn
     Swaps an exact amount of tokensIn to get a mimum amount of tokenOut_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenInOutMarket | address[3] | array of addreses: [tokenIn, tokenOut, consumeMarketFeeAddress] |
| amountsInOutMaxFee | uint256[4] | array of ints: [tokenAmountIn, minAmountOut, maxPrice, consumeMarketSwapFee] |

### swapExactAmountOut

```solidity
function swapExactAmountOut(address[3] tokenInOutMarket, uint256[4] amountsInOutMaxFee) external returns (uint256 tokenAmountIn, uint256 spotPriceAfter)
```

_swapExactAmountOut
     Swaps a maximum  maxAmountIn of tokensIn to get an exact amount of tokenOut_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenInOutMarket | address[3] | array of addreses: [tokenIn, tokenOut, consumeMarketFeeAddress] |
| amountsInOutMaxFee | uint256[4] | array of ints: [maxAmountIn,tokenAmountOut,maxPrice, consumeMarketSwapFee] |

### joinswapExternAmountIn

```solidity
function joinswapExternAmountIn(uint256 tokenAmountIn, uint256 minPoolAmountOut) external returns (uint256 poolAmountOut)
```

_joinswapExternAmountIn
     Single side add liquidity to the pool,
     expecting a minPoolAmountOut of shares for spending tokenAmountIn basetokens_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAmountIn | uint256 | exact number of base tokens to spend |
| minPoolAmountOut | uint256 | minimum of pool shares expectex |

### exitswapPoolAmountIn

```solidity
function exitswapPoolAmountIn(uint256 poolAmountIn, uint256 minAmountOut) external returns (uint256 tokenAmountOut)
```

_exitswapPoolAmountIn
     Single side remove liquidity from the pool,
     expecting a minAmountOut of basetokens for spending poolAmountIn pool shares_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolAmountIn | uint256 | exact number of pool shares to spend |
| minAmountOut | uint256 | minimum amount of basetokens expected |

### calcSingleOutPoolIn

```solidity
function calcSingleOutPoolIn(address tokenOut, uint256 poolAmountIn) external view returns (uint256 tokenAmountOut)
```

_calcSingleOutPoolIn
     Returns expected amount of tokenOut for removing exact poolAmountIn pool shares from the pool_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenOut | address | tokenOut |
| poolAmountIn | uint256 | amount of shares spent |

### calcPoolInSingleOut

```solidity
function calcPoolInSingleOut(address tokenOut, uint256 tokenAmountOut) external view returns (uint256 poolAmountIn)
```

_calcPoolInSingleOut
     Returns number of poolshares needed to withdraw exact tokenAmountOut tokens_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenOut | address | tokenOut |
| tokenAmountOut | uint256 | expected amount of tokensOut |

### calcSingleInPoolOut

```solidity
function calcSingleInPoolOut(address tokenIn, uint256 poolAmountOut) external view returns (uint256 tokenAmountIn)
```

_calcSingleInPoolOut
     Returns number of tokens to be staked to the pool in order to get an exact number of poolshares_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenIn | address | tokenIn |
| poolAmountOut | uint256 | expected amount of pool shares |

### calcPoolOutSingleIn

```solidity
function calcPoolOutSingleIn(address tokenIn, uint256 tokenAmountIn) external view returns (uint256 poolAmountOut)
```

_calcPoolOutSingleIn
     Returns number of poolshares obtain by staking exact tokenAmountIn tokens_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenIn | address | tokenIn |
| tokenAmountIn | uint256 | exact number of tokens staked |

### _pullUnderlying

```solidity
function _pullUnderlying(address erc20, address from, uint256 amount) internal
```

### _pushUnderlying

```solidity
function _pushUnderlying(address erc20, address to, uint256 amount) internal
```

### _pullPoolShare

```solidity
function _pullPoolShare(address from, uint256 amount) internal
```

### _pushPoolShare

```solidity
function _pushPoolShare(address to, uint256 amount) internal
```

### _mintPoolShare

```solidity
function _mintPoolShare(uint256 amount) internal
```

### _burnPoolShare

```solidity
function _burnPoolShare(uint256 amount) internal
```

### gulp

```solidity
function gulp(address token) external
```

