## `ERC20Template`



ERC20Template is a Data Token ERC20 compliant template 
used by the factory contract

### `onlyNotInitialized()`





### `onlyMinter()`






### `constructor(string name, string symbol, address minter, address payable feeManager)` (public)

only used prior contract deployment



### `initialize(string name, string symbol, address minter, address payable feeManager)` (public)

only used prior token instance setup (all state variables will be initialized)
"initialize(string,string,address)","datatoken-1","dt-1",0xBa3e0EC852Dc24cA7F454ea545D40B1462501711



### `mint(address account, uint256 value)` (public)





### `pause()` (public)





### `unpause()` (public)





### `setMinter(address minter)` (public)





### `name() → string` (public)





### `symbol() → string` (public)





### `decimals() → uint256` (public)





### `cap() → uint256` (public)





### `isMinter(address account) → bool` (public)





### `isInitialized() → bool` (public)





### `isPaused() → bool` (public)






