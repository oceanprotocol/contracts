## `Factory`



Implementation of Ocean DataTokens Factory

Factory deploys DataToken proxy contracts.
New DataToken proxy contracts are links to the template contract's bytecode. 
Proxy contract functionality is based on Ocean Protocol custom implementation of ERC1167 standard.


### `constructor(address _template, address payable _feeManager)` (public)



constructor
Called on contract deployment. Could not be called with zero address parameters.


### `createToken(string _name, string _symbol, uint256 _cap, string _metadataReference, address _minter) → address token` (public)



Deploys new DataToken proxy contract.
Template contract address could not be a zero address. 



### `TokenCreated(address newTokenAddress, address templateAddress, string tokenName)`





### `TokenRegistered(address tokenAddress, string tokenName, string tokenSymbol, uint256 tokenCap, address RegisteredBy, uint256 RegisteredAt, string metadataReference)`





