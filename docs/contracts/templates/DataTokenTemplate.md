## `DataTokenTemplate`



DataTokenTemplate is an ERC20 compliant token template
Used by the factory contract as a bytecode reference to 
deploy new DataTokens.

### `onlyNotInitialized()`





### `onlyMinter()`






### `constructor(string name, string symbol, address minterAddress, uint256 cap, string blob, address feeCollector)` (public)



constructor
Called prior contract deployment


### `initialize(string name, string symbol, address minterAddress, uint256 cap, string blob, address feeCollector) → bool` (external)



initialize
Called prior contract initialization (e.g creating new DataToken instance)
Calls private _initialize function. Only if contract is not initialized.


### `mint(address account, uint256 value)` (external)



mint
Only the minter address can call it.
msg.value should be higher than zero and gt or eq minting fee


### `startOrder(address consumer, uint256 amount, uint256 serviceId, address mrktFeeCollector)` (external)



startOrder
called by payer or consumer prior ordering a service consume on a marketplace.


### `finishOrder(bytes32 orderTxId, address consumer, uint256 amount, uint256 serviceId)` (external)



finishOrder
called by provider prior completing service delivery only
if there is a partial or full refund.


### `proposeMinter(address newMinter)` (external)



proposeMinter
It proposes a new token minter address.
Only the current minter can call it.


### `approveMinter()` (external)



approveMinter
It approves a new token minter address.
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


### `decimals() → uint8` (external)



decimals
It returns the token decimals.
how many supported decimal points


### `cap() → uint256` (external)



cap
it returns the capital.


### `isMinter(address account) → bool` (external)



isMinter
It takes the address and checks whether it has a minter role.


### `minter() → address` (external)



minter


### `isInitialized() → bool` (external)



isInitialized
It checks whether the contract is initialized.


### `calculateFee(uint256 amount, uint256 feePercentage) → uint256` (public)



calculateFee
giving a fee percentage, and amount it calculates the actual fee



### `OrderStarted(address consumer, address payer, uint256 amount, uint256 serviceId, uint256 timestamp, address mrktFeeCollector, uint256 marketFee)`





### `OrderFinished(bytes32 orderTxId, address consumer, uint256 amount, uint256 serviceId, address provider, uint256 timestamp)`





### `MinterProposed(address currentMinter, address newMinter)`





### `MinterApproved(address currentMinter, address newMinter)`





