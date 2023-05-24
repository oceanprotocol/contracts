# Solidity API

## ERC721Factory

_Implementation of Ocean datatokens Factory

     DTFactory deploys datatoken proxy contracts.
     New datatoken proxy contracts are links to the template contract's bytecode.
     Proxy contract functionality is based on Ocean Protocol custom implementation of ERC1167 standard._

### Template

```solidity
struct Template {
  address templateAddress;
  bool isActive;
}
```

### nftTemplateList

```solidity
mapping(uint256 => struct ERC721Factory.Template) nftTemplateList
```

### templateList

```solidity
mapping(uint256 => struct ERC721Factory.Template) templateList
```

### erc721List

```solidity
mapping(address => address) erc721List
```

### erc20List

```solidity
mapping(address => bool) erc20List
```

### NFTCreated

```solidity
event NFTCreated(address newTokenAddress, address templateAddress, string tokenName, address admin, string symbol, string tokenURI, bool transferable, address creator)
```

### templateCount

```solidity
uint256 templateCount
```

### router

```solidity
address router
```

### Template721Added

```solidity
event Template721Added(address _templateAddress, uint256 nftTemplateCount)
```

### Template20Added

```solidity
event Template20Added(address _templateAddress, uint256 nftTemplateCount)
```

### TokenCreated

```solidity
event TokenCreated(address newTokenAddress, address templateAddress, string name, string symbol, uint256 cap, address creator)
```

### NewPool

```solidity
event NewPool(address poolAddress, address ssContract, address baseTokenAddress)
```

### NewFixedRate

```solidity
event NewFixedRate(bytes32 exchangeId, address owner, address exchangeContract, address baseToken)
```

### NewDispenser

```solidity
event NewDispenser(address dispenserContract)
```

### DispenserCreated

```solidity
event DispenserCreated(address datatokenAddress, address owner, uint256 maxTokens, uint256 maxBalance, address allowedSwapper)
```

### Transfer

```solidity
event Transfer(address from, address to, uint256 tokenId)
```

### constructor

```solidity
constructor(address _template721, address _template, address _router) public
```

_constructor
     Called on contract deployment. Could not be called with zero address parameters._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _template721 | address | refers to the address of ERC721 template |
| _template | address | refers to the address of a deployed datatoken contract. |
| _router | address | router contract address |

### deployERC721Contract

```solidity
function deployERC721Contract(string name, string symbol, uint256 _templateIndex, address additionalERC20Deployer, address additionalMetaDataUpdater, string tokenURI, bool transferable, address owner) public returns (address token)
```

_deployERC721Contract_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | string | NFT name |
| symbol | string | NFT Symbol |
| _templateIndex | uint256 | template index we want to use |
| additionalERC20Deployer | address | if != address(0), we will add it with ERC20Deployer role |
| additionalMetaDataUpdater | address | if != address(0), we will add it with updateMetadata role |
| tokenURI | string |  |
| transferable | bool | if NFT is transferable. Cannot be changed afterwards |
| owner | address | owner of the NFT |

### getCurrentNFTCount

```solidity
function getCurrentNFTCount() external view returns (uint256)
```

_get the current token count._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the current token count |

### getNFTTemplate

```solidity
function getNFTTemplate(uint256 _index) external view returns (struct ERC721Factory.Template)
```

_get the token template Object_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _index | uint256 | template Index |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct ERC721Factory.Template | the template struct |

### add721TokenTemplate

```solidity
function add721TokenTemplate(address _templateAddress) public returns (uint256)
```

_add a new NFT Template.
      Only Factory Owner can call it_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _templateAddress | address | new template address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the actual template count |

### reactivate721TokenTemplate

```solidity
function reactivate721TokenTemplate(uint256 _index) external
```

_reactivate a disabled NFT Template.
            Only Factory Owner can call it_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _index | uint256 | index we want to reactivate |

### disable721TokenTemplate

```solidity
function disable721TokenTemplate(uint256 _index) external
```

_disable an NFT Template.
      Only Factory Owner can call it_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _index | uint256 | index we want to disable |

### getCurrentNFTTemplateCount

```solidity
function getCurrentNFTTemplateCount() external view returns (uint256)
```

### _isContract

```solidity
function _isContract(address account) internal view returns (bool)
```

_Returns true if `account` is a contract.

[IMPORTANT]
====
It is unsafe to assume that an address for which this function returns
false is an externally-owned account (EOA) and not a contract.

Among others, `isContract` will return false for the following
types of addresses:

 - an externally-owned account
 - a contract in construction
 - an address where a contract will be created
 - an address where a contract lived, but was destroyed
====_

### tokenStruct

```solidity
struct tokenStruct {
  string[] strings;
  address[] addresses;
  uint256[] uints;
  bytes[] bytess;
  address owner;
}
```

### createToken

```solidity
function createToken(uint256 _templateIndex, string[] strings, address[] addresses, uint256[] uints, bytes[] bytess) external returns (address token)
```

_Deploys new datatoken proxy contract.
     This function is not called directly from here. It's called from the NFT contract.
            An NFT contract can deploy multiple ERC20 tokens._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _templateIndex | uint256 | ERC20Template index |
| strings | string[] | refers to an array of strings                      [0] = name                      [1] = symbol |
| addresses | address[] | refers to an array of addresses                     [0]  = minter account who can mint datatokens (can have multiple minters)                     [1]  = paymentCollector  initial paymentCollector  for this DT                     [2]  = publishing Market Address                     [3]  = publishing Market Fee Token |
| uints | uint256[] | refers to an array of uints                     [0] = cap_ the total ERC20 cap                     [1] = publishing Market Fee Amount |
| bytess | bytes[] | refers to an array of bytes, not in use now, left for future templates |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | address of a new proxy datatoken contract |

### _createToken

```solidity
function _createToken(uint256 _templateIndex, string[] strings, address[] addresses, uint256[] uints, bytes[] bytess, address owner) internal returns (address token)
```

### _createTokenStep2

```solidity
function _createTokenStep2(address token, struct ERC721Factory.tokenStruct tokenData) internal
```

### getCurrentTokenCount

```solidity
function getCurrentTokenCount() external view returns (uint256)
```

_get the current ERC20token deployed count._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the current token count |

### getTokenTemplate

```solidity
function getTokenTemplate(uint256 _index) external view returns (struct ERC721Factory.Template)
```

_get the current ERC20token template.
      @param _index template Index_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct ERC721Factory.Template | the token Template Object |

### addTokenTemplate

```solidity
function addTokenTemplate(address _templateAddress) public returns (uint256)
```

_add a new ERC20Template.
      Only Factory Owner can call it_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _templateAddress | address | new template address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the actual template count |

### disableTokenTemplate

```solidity
function disableTokenTemplate(uint256 _index) external
```

_disable an ERC20Template.
      Only Factory Owner can call it_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _index | uint256 | index we want to disable |

### reactivateTokenTemplate

```solidity
function reactivateTokenTemplate(uint256 _index) external
```

_reactivate a disabled ERC20Template.
      Only Factory Owner can call it_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _index | uint256 | index we want to reactivate |

### getCurrentTemplateCount

```solidity
function getCurrentTemplateCount() external view returns (uint256)
```

### tokenOrder

```solidity
struct tokenOrder {
  address tokenAddress;
  address consumer;
  uint256 serviceIndex;
  struct IERC20Template.providerFee _providerFee;
  struct IERC20Template.consumeMarketFee _consumeMarketFee;
}
```

### startMultipleTokenOrder

```solidity
function startMultipleTokenOrder(struct ERC721Factory.tokenOrder[] orders) external
```

_startMultipleTokenOrder
     Used as a proxy to order multiple services
     Users can have inifinite approvals for fees for factory instead of having one approval/ erc20 contract
     Requires previous approval of all :
         - consumeFeeTokens
         - publishMarketFeeTokens
         - erc20 datatokens
         - providerFees_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orders | struct ERC721Factory.tokenOrder[] | an array of struct tokenOrder |

### reuseTokenOrder

```solidity
struct reuseTokenOrder {
  address tokenAddress;
  bytes32 orderTxId;
  struct IERC20Template.providerFee _providerFee;
}
```

### reuseMultipleTokenOrder

```solidity
function reuseMultipleTokenOrder(struct ERC721Factory.reuseTokenOrder[] orders) external
```

_reuseMultipleTokenOrder
     Used as a proxy to order multiple reuses
     Users can have inifinite approvals for fees for factory instead of having one approval/ erc20 contract
     Requires previous approval of all :
         - consumeFeeTokens
         - publishMarketFeeTokens
         - erc20 datatokens
         - providerFees_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orders | struct ERC721Factory.reuseTokenOrder[] | an array of struct tokenOrder |

### createNftWithErc20

```solidity
function createNftWithErc20(struct IFactory.NftCreateData _NftCreateData, struct IFactory.ErcCreateData _ErcCreateData) external returns (address erc721Address, address erc20Address)
```

_createNftWithErc20
     Creates a new NFT, then a ERC20,all in one call_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _NftCreateData | struct IFactory.NftCreateData | input data for nft creation |
| _ErcCreateData | struct IFactory.ErcCreateData | input data for erc20 creation |

### createNftWithErc20WithPool

```solidity
function createNftWithErc20WithPool(struct IFactory.NftCreateData _NftCreateData, struct IFactory.ErcCreateData _ErcCreateData, struct IFactory.PoolData _PoolData) external returns (address erc721Address, address erc20Address, address poolAddress)
```

_createNftWithErc20WithPool
     Creates a new NFT, then a ERC20, then a Pool, all in one call
     Use this carefully, because if Pool creation fails, you are still going to pay a lot of gas_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _NftCreateData | struct IFactory.NftCreateData | input data for NFT Creation |
| _ErcCreateData | struct IFactory.ErcCreateData | input data for ERC20 Creation |
| _PoolData | struct IFactory.PoolData | input data for Pool Creation |

### createNftWithErc20WithFixedRate

```solidity
function createNftWithErc20WithFixedRate(struct IFactory.NftCreateData _NftCreateData, struct IFactory.ErcCreateData _ErcCreateData, struct IFactory.FixedData _FixedData) external returns (address erc721Address, address erc20Address, bytes32 exchangeId)
```

_createNftWithErc20WithFixedRate
     Creates a new NFT, then a ERC20, then a FixedRateExchange, all in one call
     Use this carefully, because if Fixed Rate creation fails, you are still going to pay a lot of gas_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _NftCreateData | struct IFactory.NftCreateData | input data for NFT Creation |
| _ErcCreateData | struct IFactory.ErcCreateData | input data for ERC20 Creation |
| _FixedData | struct IFactory.FixedData | input data for FixedRate Creation |

### createNftWithErc20WithDispenser

```solidity
function createNftWithErc20WithDispenser(struct IFactory.NftCreateData _NftCreateData, struct IFactory.ErcCreateData _ErcCreateData, struct IFactory.DispenserData _DispenserData) external returns (address erc721Address, address erc20Address)
```

_createNftWithErc20WithDispenser
     Creates a new NFT, then a ERC20, then a Dispenser, all in one call
     Use this carefully_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _NftCreateData | struct IFactory.NftCreateData | input data for NFT Creation |
| _ErcCreateData | struct IFactory.ErcCreateData | input data for ERC20 Creation |
| _DispenserData | struct IFactory.DispenserData | input data for Dispenser Creation |

### MetaData

```solidity
struct MetaData {
  uint8 _metaDataState;
  string _metaDataDecryptorUrl;
  string _metaDataDecryptorAddress;
  bytes flags;
  bytes data;
  bytes32 _metaDataHash;
  struct IERC721Template.metaDataProof[] _metadataProofs;
}
```

### createNftWithMetaData

```solidity
function createNftWithMetaData(struct IFactory.NftCreateData _NftCreateData, struct ERC721Factory.MetaData _MetaData) external returns (address erc721Address)
```

_createNftWithMetaData
     Creates a new NFT, then sets the metadata, all in one call
     Use this carefully_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _NftCreateData | struct IFactory.NftCreateData | input data for NFT Creation |
| _MetaData | struct ERC721Factory.MetaData | input metadata |

### _pullUnderlying

```solidity
function _pullUnderlying(address erc20, address from, address to, uint256 amount) internal
```

