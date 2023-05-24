# Solidity API

## FixedRateExchange

_FixedRateExchange is a fixed rate exchange Contract
     Marketplaces uses this contract to allow consumers
     exchanging datatokens with ocean token using a fixed
     exchange rate._

### MIN_FEE

```solidity
uint256 MIN_FEE
```

### MAX_FEE

```solidity
uint256 MAX_FEE
```

### MIN_RATE

```solidity
uint256 MIN_RATE
```

### router

```solidity
address router
```

### Exchange

```solidity
struct Exchange {
  bool active;
  address exchangeOwner;
  address datatoken;
  address baseToken;
  uint256 fixedRate;
  uint256 dtDecimals;
  uint256 btDecimals;
  uint256 dtBalance;
  uint256 btBalance;
  uint256 marketFee;
  address marketFeeCollector;
  uint256 marketFeeAvailable;
  uint256 oceanFeeAvailable;
  bool withMint;
  address allowedSwapper;
}
```

### onlyActiveExchange

```solidity
modifier onlyActiveExchange(bytes32 exchangeId)
```

### onlyExchangeOwner

```solidity
modifier onlyExchangeOwner(bytes32 exchangeId)
```

### onlyRouter

```solidity
modifier onlyRouter()
```

### ExchangeCreated

```solidity
event ExchangeCreated(bytes32 exchangeId, address baseToken, address datatoken, address exchangeOwner, uint256 fixedRate)
```

### ExchangeRateChanged

```solidity
event ExchangeRateChanged(bytes32 exchangeId, address exchangeOwner, uint256 newRate)
```

### ExchangeMintStateChanged

```solidity
event ExchangeMintStateChanged(bytes32 exchangeId, address exchangeOwner, bool withMint)
```

### ExchangeActivated

```solidity
event ExchangeActivated(bytes32 exchangeId, address exchangeOwner)
```

### ExchangeDeactivated

```solidity
event ExchangeDeactivated(bytes32 exchangeId, address exchangeOwner)
```

### ExchangeAllowedSwapperChanged

```solidity
event ExchangeAllowedSwapperChanged(bytes32 exchangeId, address allowedSwapper)
```

### Swapped

```solidity
event Swapped(bytes32 exchangeId, address by, uint256 baseTokenSwappedAmount, uint256 datatokenSwappedAmount, address tokenOutAddress, uint256 marketFeeAmount, uint256 oceanFeeAmount, uint256 consumeMarketFeeAmount)
```

### TokenCollected

```solidity
event TokenCollected(bytes32 exchangeId, address to, address token, uint256 amount)
```

### OceanFeeCollected

```solidity
event OceanFeeCollected(bytes32 exchangeId, address feeToken, uint256 feeAmount)
```

### MarketFeeCollected

```solidity
event MarketFeeCollected(bytes32 exchangeId, address feeToken, uint256 feeAmount)
```

### ConsumeMarketFee

```solidity
event ConsumeMarketFee(bytes32 exchangeId, address to, address token, uint256 amount)
```

### SWAP_FEES

```solidity
event SWAP_FEES(bytes32 exchangeId, uint256 oceanFeeAmount, uint256 marketFeeAmount, uint256 consumeMarketFeeAmount, address tokenFeeAddress)
```

### PublishMarketFeeChanged

```solidity
event PublishMarketFeeChanged(bytes32 exchangeId, address caller, address newMarketCollector, uint256 swapFee)
```

### constructor

```solidity
constructor(address _router) public
```

### getId

```solidity
function getId() public pure returns (uint8)
```

_getId
     Return template id in case we need different ABIs. 
     If you construct your own template, please make sure to change the hardcoded value_

### getOPCFee

```solidity
function getOPCFee(address baseTokenAddress) public view returns (uint256)
```

### createWithDecimals

```solidity
function createWithDecimals(address datatoken, address[] addresses, uint256[] uints) external returns (bytes32 exchangeId)
```

_create
     creates new exchange pairs between a baseToken
     (ocean token) and datatoken.
datatoken refers to a datatoken contract address
addresses  - array of addresses with the following struct:
               [0] - baseToken
               [1] - owner
               [2] - marketFeeCollector
               [3] - allowedSwapper - if != address(0), only that is allowed to swap (used for ERC20Enterprise)
uints  - array of uints with the following struct:
               [0] - baseTokenDecimals
               [1] - datatokenDecimals
               [2] - fixedRate
               [3] - marketFee
               [4] - withMint_

### generateExchangeId

```solidity
function generateExchangeId(address baseToken, address datatoken) public pure returns (bytes32)
```

_generateExchangeId
     creates unique exchange identifier for two token pairs._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseToken | address | refers to a base token contract address |
| datatoken | address | refers to a datatoken contract address |

### Fees

```solidity
struct Fees {
  uint256 baseTokenAmount;
  uint256 oceanFeeAmount;
  uint256 publishMarketFeeAmount;
  uint256 consumeMarketFeeAmount;
}
```

### _getBaseTokenOutPrice

```solidity
function _getBaseTokenOutPrice(bytes32 exchangeId, uint256 datatokenAmount) internal view returns (uint256 baseTokenAmount)
```

### calcBaseInGivenOutDT

```solidity
function calcBaseInGivenOutDT(bytes32 exchangeId, uint256 datatokenAmount, uint256 consumeMarketSwapFeeAmount) public view returns (uint256 baseTokenAmount, uint256 oceanFeeAmount, uint256 publishMarketFeeAmount, uint256 consumeMarketFeeAmount)
```

_calcBaseInGivenOutDT
     Calculates how many baseTokens are needed to get exact amount of datatokens_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 | a unique exchange idnetifier |
| datatokenAmount | uint256 | the amount of datatokens to be exchanged |
| consumeMarketSwapFeeAmount | uint256 | fee amount for consume market |

### calcBaseOutGivenInDT

```solidity
function calcBaseOutGivenInDT(bytes32 exchangeId, uint256 datatokenAmount, uint256 consumeMarketSwapFeeAmount) public view returns (uint256 baseTokenAmount, uint256 oceanFeeAmount, uint256 publishMarketFeeAmount, uint256 consumeMarketFeeAmount)
```

_calcBaseOutGivenInDT
     Calculates how many basteTokens you will get for selling exact amount of baseTokens_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 | a unique exchange idnetifier |
| datatokenAmount | uint256 | the amount of datatokens to be exchanged |
| consumeMarketSwapFeeAmount | uint256 | fee amount for consume market |

### buyDT

```solidity
function buyDT(bytes32 exchangeId, uint256 datatokenAmount, uint256 maxBaseTokenAmount, address consumeMarketAddress, uint256 consumeMarketSwapFeeAmount) external
```

_swap
     atomic swap between two registered fixed rate exchange._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 | a unique exchange idnetifier |
| datatokenAmount | uint256 | the amount of datatokens to be exchanged |
| maxBaseTokenAmount | uint256 | maximum amount of base tokens to pay |
| consumeMarketAddress | address | consumeMarketAddress |
| consumeMarketSwapFeeAmount | uint256 | fee amount for consume market |

### sellDT

```solidity
function sellDT(bytes32 exchangeId, uint256 datatokenAmount, uint256 minBaseTokenAmount, address consumeMarketAddress, uint256 consumeMarketSwapFeeAmount) external
```

_sellDT
     Sell datatokenAmount while expecting at least minBaseTokenAmount_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 | a unique exchange idnetifier |
| datatokenAmount | uint256 | the amount of datatokens to be exchanged |
| minBaseTokenAmount | uint256 | minimum amount of base tokens to cash in |
| consumeMarketAddress | address | consumeMarketAddress |
| consumeMarketSwapFeeAmount | uint256 | fee amount for consume market |

### collectBT

```solidity
function collectBT(bytes32 exchangeId, uint256 amount) public
```

_collectBT
     Collects and send basetokens.
     This function can be called by anyone, because fees are being sent to ERC20.getPaymentCollector_

### _collectBT

```solidity
function _collectBT(bytes32 exchangeId, uint256 amount) internal
```

### collectDT

```solidity
function collectDT(bytes32 exchangeId, uint256 amount) public
```

_collectDT
     Collects and send datatokens.
     This function can be called by anyone, because fees are being sent to ERC20.getPaymentCollector_

### _collectDT

```solidity
function _collectDT(bytes32 exchangeId, uint256 amount) internal
```

### collectMarketFee

```solidity
function collectMarketFee(bytes32 exchangeId) public
```

_collectMarketFee
     Collects and send publishingMarketFee.
     This function can be called by anyone, because fees are being sent to exchanges.marketFeeCollector_

### _collectMarketFee

```solidity
function _collectMarketFee(bytes32 exchangeId) internal
```

### collectOceanFee

```solidity
function collectOceanFee(bytes32 exchangeId) public
```

_collectOceanFee
     Collects and send OP Community fees.
     This function can be called by anyone, because fees are being sent to opcCollector_

### _collectOceanFee

```solidity
function _collectOceanFee(bytes32 exchangeId) internal
```

### updateMarketFeeCollector

```solidity
function updateMarketFeeCollector(bytes32 exchangeId, address _newMarketCollector) external
```

_updateMarketFeeCollector
     Set _newMarketCollector as _publishMarketCollector_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 |  |
| _newMarketCollector | address | new _publishMarketCollector |

### updateMarketFee

```solidity
function updateMarketFee(bytes32 exchangeId, uint256 _newMarketFee) external
```

### getMarketFee

```solidity
function getMarketFee(bytes32 exchangeId) public view returns (uint256)
```

### getNumberOfExchanges

```solidity
function getNumberOfExchanges() external view returns (uint256)
```

_getNumberOfExchanges
     gets the total number of registered exchanges_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | total number of registered exchange IDs |

### setRate

```solidity
function setRate(bytes32 exchangeId, uint256 newRate) external
```

_setRate
     changes the fixed rate for an exchange with a new rate_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 | a unique exchange idnetifier |
| newRate | uint256 | new fixed rate value |

### toggleMintState

```solidity
function toggleMintState(bytes32 exchangeId, bool withMint) external
```

_toggleMintState
     toggle withMint state_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 | a unique exchange idnetifier |
| withMint | bool | new value |

### _checkAllowedWithMint

```solidity
function _checkAllowedWithMint(address owner, address datatoken, bool withMint) internal view returns (bool)
```

_checkAllowedWithMint
     internal function which establishes if a withMint flag can be set.  
     It does this by checking if the owner has rights for that datatoken_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| owner | address | exchange owner |
| datatoken | address | datatoken address |
| withMint | bool | desired flag, might get overwritten if owner has no roles |

### toggleExchangeState

```solidity
function toggleExchangeState(bytes32 exchangeId) external
```

_toggleExchangeState
     toggles the active state of an existing exchange_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 | a unique exchange identifier |

### setAllowedSwapper

```solidity
function setAllowedSwapper(bytes32 exchangeId, address newAllowedSwapper) external
```

_setAllowedSwapper
     Sets a new allowedSwapper_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 | a unique exchange identifier |
| newAllowedSwapper | address | refers to the new allowedSwapper |

### getRate

```solidity
function getRate(bytes32 exchangeId) external view returns (uint256)
```

_getRate
     gets the current fixed rate for an exchange_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 | a unique exchange idnetifier |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | fixed rate value |

### getDTSupply

```solidity
function getDTSupply(bytes32 exchangeId) public view returns (uint256 supply)
```

_getSupply
     gets the current supply of datatokens in an fixed
     rate exchagne_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 | the exchange ID |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| supply | uint256 |  |

### getBTSupply

```solidity
function getBTSupply(bytes32 exchangeId) public view returns (uint256 supply)
```

_getSupply
     gets the current supply of datatokens in an fixed
     rate exchagne_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 | the exchange ID |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| supply | uint256 |  |

### getExchange

```solidity
function getExchange(bytes32 exchangeId) external view returns (address exchangeOwner, address datatoken, uint256 dtDecimals, address baseToken, uint256 btDecimals, uint256 fixedRate, bool active, uint256 dtSupply, uint256 btSupply, uint256 dtBalance, uint256 btBalance, bool withMint)
```

### getAllowedSwapper

```solidity
function getAllowedSwapper(bytes32 exchangeId) external view returns (address allowedSwapper)
```

### getFeesInfo

```solidity
function getFeesInfo(bytes32 exchangeId) external view returns (uint256 marketFee, address marketFeeCollector, uint256 opcFee, uint256 marketFeeAvailable, uint256 oceanFeeAvailable)
```

### getExchanges

```solidity
function getExchanges() external view returns (bytes32[])
```

_getExchanges
     gets all the exchanges list_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32[] | a list of all registered exchange Ids |

### isActive

```solidity
function isActive(bytes32 exchangeId) external view returns (bool)
```

_isActive
     checks whether exchange is active_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 | a unique exchange idnetifier |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | true if exchange is true, otherwise returns false |

### _pullUnderlying

```solidity
function _pullUnderlying(address erc20, address from, address to, uint256 amount) internal
```

