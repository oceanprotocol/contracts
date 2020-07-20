## `DTFactory`



Implementation of Ocean DataTokens Factory

DTFactory deploys DataToken proxy contracts.
New DataToken proxy contracts are links to the template contract's bytecode. 
Proxy contract functionality is based on Ocean Protocol custom implementation of ERC1167 standard.


### `constructor(address _template)` (public)



constructor
Called on contract deployment. Could not be called with zero address parameters.


### `createToken(string blob) → address token` (public)



Deploys new DataToken proxy contract.
Template contract address could not be a zero address. 


### `getCurrentTokenIndex() → uint256` (external)



get the current token index. 


### `getTokenTemplate() → address` (external)



get the token template address



### `TokenCreated(address newTokenAddress, address templateAddress, string tokenName)`





### `TokenRegistered(address tokenAddress, string tokenName, string tokenSymbol, uint256 tokenCap, address registeredBy, uint256 registeredAt, string blob)`





