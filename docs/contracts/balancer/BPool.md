## `BPool`



Used by the (Ocean version) BFactory contract as a bytecode reference to
deploy new BPools.

This contract is is nearly identical to the BPool.sol contract at [1]
The only difference is the "Proxy contract functionality" section 
given below. We'd inherit from BPool if we could, for simplicity.
But we can't, because the proxy section needs to access private
variables declared in BPool, and Solidity disallows this. Therefore
the best we can do for now is clearly demarcate the proxy section. 

[1] https://github.com/balancer-labs/balancer-core/contracts/.

### `_logs_()`





### `_lock_()`





### `_viewlock_()`





### `onlyNotInitialized()`






### `isInitialized() → bool` (external)





### `initialize(address controller, address factory, uint256 swapFee, bool publicSwap, bool finalized) → bool` (external)





### `setup(address dataTokenAaddress, uint256 dataTokenAmount, uint256 dataTokenWeight, address baseTokenAddress, uint256 baseTokenAmount, uint256 baseTokenWeight, uint256 swapFee)` (external)





### `isPublicSwap() → bool` (external)





### `isFinalized() → bool` (external)





### `isBound(address t) → bool` (external)





### `getNumTokens() → uint256` (external)





### `getCurrentTokens() → address[] tokens` (external)





### `getFinalTokens() → address[] tokens` (external)





### `getDenormalizedWeight(address token) → uint256` (external)





### `getTotalDenormalizedWeight() → uint256` (external)





### `getNormalizedWeight(address token) → uint256` (external)





### `getBalance(address token) → uint256` (external)





### `getSwapFee() → uint256` (external)





### `getController() → address` (external)





### `setSwapFee(uint256 swapFee)` (public)





### `setController(address manager)` (external)





### `setPublicSwap(bool public_)` (public)





### `finalize()` (public)





### `bind(address token, uint256 balance, uint256 denorm)` (public)





### `rebind(address token, uint256 balance, uint256 denorm)` (public)





### `unbind(address token)` (external)





### `gulp(address token)` (external)





### `getSpotPrice(address tokenIn, address tokenOut) → uint256 spotPrice` (external)





### `getSpotPriceSansFee(address tokenIn, address tokenOut) → uint256 spotPrice` (external)





### `joinPool(uint256 poolAmountOut, uint256[] maxAmountsIn)` (external)





### `exitPool(uint256 poolAmountIn, uint256[] minAmountsOut)` (external)





### `swapExactAmountIn(address tokenIn, uint256 tokenAmountIn, address tokenOut, uint256 minAmountOut, uint256 maxPrice) → uint256 tokenAmountOut, uint256 spotPriceAfter` (external)





### `swapExactAmountOut(address tokenIn, uint256 maxAmountIn, address tokenOut, uint256 tokenAmountOut, uint256 maxPrice) → uint256 tokenAmountIn, uint256 spotPriceAfter` (external)





### `joinswapExternAmountIn(address tokenIn, uint256 tokenAmountIn, uint256 minPoolAmountOut) → uint256 poolAmountOut` (external)





### `joinswapPoolAmountOut(address tokenIn, uint256 poolAmountOut, uint256 maxAmountIn) → uint256 tokenAmountIn` (external)





### `exitswapPoolAmountIn(address tokenOut, uint256 poolAmountIn, uint256 minAmountOut) → uint256 tokenAmountOut` (external)





### `exitswapExternAmountOut(address tokenOut, uint256 tokenAmountOut, uint256 maxPoolAmountIn) → uint256 poolAmountIn` (external)





### `_pullUnderlying(address erc20, address from, uint256 amount)` (internal)





### `_pushUnderlying(address erc20, address to, uint256 amount)` (internal)





### `_pullPoolShare(address from, uint256 amount)` (internal)





### `_pushPoolShare(address to, uint256 amount)` (internal)





### `_mintPoolShare(uint256 amount)` (internal)





### `_burnPoolShare(uint256 amount)` (internal)






### `LOG_SWAP(address caller, address tokenIn, address tokenOut, uint256 tokenAmountIn, uint256 tokenAmountOut)`





### `LOG_JOIN(address caller, address tokenIn, uint256 tokenAmountIn)`





### `LOG_EXIT(address caller, address tokenOut, uint256 tokenAmountOut)`





### `LOG_CALL(bytes4 sig, address caller, bytes data)`





