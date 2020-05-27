## `ERC20Pausable`



ERC20Pausable adds the ability to pause ERC20 compliant template 
used by the ERC20Template contract for pausing the contract.

### `onlyNotPaused()`





### `onlyPaused()`






### `transfer(address to, uint256 value) → bool` (public)



transfer
Standard ERC20 transfer function with onlyNotPaused modifier.
Can be called only if the contract is not paused.


### `transferFrom(address from, address to, uint256 value) → bool` (public)



transfer
Standard ERC20 transferFrom function with onlyNotPaused modifier.
Can be called only if the contract is not paused.


### `approve(address spender, uint256 value) → bool` (public)



approve
Standard ERC20 approve function with onlyNotPaused modifier.
Can be called only if the contract is not paused.


### `increaseAllowance(address spender, uint256 addedValue) → bool` (public)



increaseAllowance
Standard ERC20 increaseAllowance function with onlyNotPaused modifier.
Can be called only if the contract is not paused.


### `decreaseAllowance(address spender, uint256 subtractedValue) → bool` (public)



decreaseAllowance
Standard ERC20 decreaseAllowance function with onlyNotPaused modifier.
Can be called only if the contract is not paused.



