## `ERC20Template`



ERC20Template is a DataToken ERC20 compliant template
Used by the factory contract as a bytecode reference to deploy new DataTokens.

### `onlyNotInitialized()`





### `onlyMinter()`






### `constructor(string name, string symbol, address minter, uint256 cap, address payable feeManager)` (public)



constructor
Called on contract deployment.  Could not be called with zero address parameters.


### `initialize(string name, string symbol, address minter, uint256 cap, address payable feeManager) → bool` (public)



initialize
Called on contract initialization. Used on new DataToken instance setup.
Calls private _initialize function. Only if contract is not initialized.


### `mint(address account, uint256 value)` (public)



mint
Function that takes the fee as msg.value and mints new DataTokens.
Can be called only if the contract is not paused.
Can be called only by the minter address.
Msg.value should be higher than zero. 


### `pause()` (public)



pause
Function that pauses the contract.
Can be called only if the contract is not already paused.
Can be called only by the minter address.

### `unpause()` (public)



unpause
Function that unpauses the contract.
Can be called only if the contract is paused.
Can be called only by the minter address.

### `setMinter(address minter)` (public)



setMinter
Function that sents a new minter address.
Can be called only if the contract is not paused.
Can be called only by the minter address.


### `name() → string` (public)



name
Function that reads private variable name.


### `symbol() → string` (public)



symbol
Function that reads private variable symbol.


### `decimals() → uint256` (public)



decimals
Function that reads private variable decimals.


### `cap() → uint256` (public)



cap
Function that reads private variable cap.


### `isMinter(address account) → bool` (public)



isMinter
Function takes the address and checks if it is a minter address.


### `isInitialized() → bool` (public)



isInitialized
Function checks if the contract is initialized.


### `isPaused() → bool` (public)



isPaused
Function checks if the contract is paused.



