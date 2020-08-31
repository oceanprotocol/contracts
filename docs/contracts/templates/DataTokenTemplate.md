## `DataTokenTemplate`



DataTokenTemplate is an ERC20 compliant token template
Used by the factory contract as a bytecode reference to 
deploy new DataTokens.

### `onlyNotInitialized()`





### `onlyMinter()`






### `constructor(string name, string symbol, address minter, uint256 cap, string blob, address feeCollector)` (public)



constructor
Called prior contract deployment


### `initialize(string name, string symbol, address minter, uint256 cap, string blob, address feeCollector) → bool` (external)



initialize
Called prior contract initialization (e.g creating new DataToken instance)
Calls private _initialize function. Only if contract is not initialized.


### `mint(address account, uint256 value)` (external)



mint
Only the minter address can call it.
msg.value should be higher than zero and gt or eq minting fee


### `startOrder(address receiver, uint256 amount, bytes32 did, uint256 serviceId, address feeCollector, uint256 feePercentage)` (external)



startOrder
called by consumer prior ordering a service consume on a marketplace


### `finishOrder(bytes32 orderTxId, address consumer, uint256 amount, bytes32 did, uint256 serviceId)` (external)



finishOrder
called by provider prior completing service delivery only
if there is a partial or full refund.


### `pause()` (external)



pause
It pauses the contract functionalities (transfer, mint, etc)
Only could be called if the contract is not already paused.
Only called by the minter address.

### `unpause()` (external)



unpause
It unpauses the contract.
Only called if the contract is paused.
Only minter can call it.

### `setMinter(address minter)` (external)



setMinter
It sets a new token minter address.
Only called be called if the contract is not paused.
Only the current minter can call it.


### `name() → string` (external)



name
It returns the token name.


### `symbol() → string` (external)



symbol
It returns the token symbol.


### `blob() → string` (external)



blob
It returns the blob (e.g https://123.com).


### `decimals() → uint256` (external)



decimals
It returns the token decimals.
how many supported decimal points


### `cap() → uint256` (external)



cap
it returns the capital.


### `isMinter(address account) → bool` (external)



isMinter
It takes the address and checks whether it has a minter role.


### `isInitialized() → bool` (external)



isInitialized
It checks whether the contract is initialized.


### `isPaused() → bool` (external)



isPaused
Function checks if the contract is paused.


### `calculateFee(uint256 amount, uint256 feePercentage) → uint256` (public)



calculateFee
giving a fee percentage, and amount it calculates the actual fee


### `calculateTotalFee(uint256 amount, uint256 feePercentage) → uint256` (external)



calculateTotalFee
giving a fee percentage, and amount it calculates 
the total fee (including the community fee) needed for order.



### `OrderStarted(uint256 amount, bytes32 did, uint256 serviceId, address receiver, uint256 startedAt, address feeCollector, uint256 marketFee)`





### `OrderFinished(bytes32 orderTxId, address consumer, uint256 amount, bytes32 did, uint256 serviceId, address provider)`





