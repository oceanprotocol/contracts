## `DTFactory`



Implementation of Ocean DataTokens Factory

DTFactory deploys DataToken proxy contracts.
New DataToken proxy contracts are links to the template contract's bytecode.
Proxy contract functionality is based on Ocean Protocol custom implementation of ERC1167 standard.


### `constructor(address _template, address _collector)` (public)



constructor
Called on contract deployment. Could not be called with zero address parameters.


### `createToken(string blob, string name, string symbol, uint256 cap) → address token` (public)



Deploys new DataToken proxy contract.
Template contract address could not be a zero address.


### `getCurrentTokenCount() → uint256` (external)



get the current token count.


### `getTokenTemplate() → address` (external)



get the token template address



### `TokenCreated(address newTokenAddress, address templateAddress, string tokenName)`





### `TokenRegistered(address tokenAddress, string tokenName, string tokenSymbol, uint256 tokenCap, address registeredBy, string blob)`





