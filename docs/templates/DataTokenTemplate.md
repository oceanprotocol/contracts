## `DataTokenTemplate`



DataTokenTemplate is an ERC20 compliant token template
Used by the factory contract as a bytecode reference to 
deploy new DataTokens.

### `onlyNotInitialized()`





### `onlyMinter()`






### `constructor(string name, string symbol, address minter, uint256 cap, string blob, address payable feeManager)` (public)



constructor
Called prior contract deployment


### `initialize(string name, string symbol, address minter, uint256 cap, string blob, address payable feeManager) → bool` (public)



initialize
Called prior contract initialization (e.g creating new DataToken instance)
Calls private _initialize function. Only if contract is not initialized.


### `mint(address account, uint256 value)` (public)



mint
It takes the fee as msg.value and mints new DataTokens
the minting fee is calculated using ServiceFeeManager 
it could be called only if the contract is not paused.
Only the minter address can call it.
msg.value should be higher than zero and gt or eq minting fee


### `pause()` (public)



pause
It pauses the contract functionalities (transfer, mint, etc)
Only could be called if the contract is not already paused.
Only called by the minter address.

### `unpause()` (public)



unpause
It unpauses the contract.
Only called if the contract is paused.
Only minter can call it.

### `setMinter(address minter)` (public)



setMinter
It sets a new token minter address.
Only called be called if the contract is not paused.
Only the current minter can call it.


### `name() → string` (public)



name
It returns the token name.


### `symbol() → string` (public)



symbol
It returns the token symbol.


### `blob() → string` (public)



blob
It returns the blob (e.g https://123.com).


### `decimals() → uint256` (public)



decimals
It returns the token decimals.
how many supported decimal points


### `cap() → uint256` (public)



cap
it returns the capital.


### `isMinter(address account) → bool` (public)



isMinter
It takes the address and checks whether it has a minter role.


### `isInitialized() → bool` (public)



isInitialized
It checks whether the contract is initialized.


### `isPaused() → bool` (public)



isPaused
Function checks if the contract is paused.



