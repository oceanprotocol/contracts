# Solidity API

## ERC20TemplateEnterprise

_ERC20TemplateEnterprise is an ERC20 compliant token template
     Used by the factory contract as a bytecode reference to
     deploy new Datatokens.
IMPORTANT CHANGES:
 - buyFromFreAndOrder function:  one call to buy a DT from the minting capable FRE, startOrder and burn the DT
 - buyFromDispenserAndOrder function:  one call to fetch a DT from the Dispenser, startOrder and burn the DT
 - creation of pools is not allowed_

### BASE

```solidity
uint256 BASE
```

### DOMAIN_SEPARATOR

```solidity
bytes32 DOMAIN_SEPARATOR
```

### PERMIT_TYPEHASH

```solidity
bytes32 PERMIT_TYPEHASH
```

### nonces

```solidity
mapping(address => uint256) nonces
```

### router

```solidity
address router
```

### fixedRate

```solidity
struct fixedRate {
  address contractAddress;
  bytes32 id;
}
```

### fixedRateExchanges

```solidity
struct ERC20TemplateEnterprise.fixedRate[] fixedRateExchanges
```

### dispensers

```solidity
address[] dispensers
```

### providerFee

```solidity
struct providerFee {
  address providerFeeAddress;
  address providerFeeToken;
  uint256 providerFeeAmount;
  uint8 v;
  bytes32 r;
  bytes32 s;
  uint256 validUntil;
  bytes providerData;
}
```

### consumeMarketFee

```solidity
struct consumeMarketFee {
  address consumeMarketFeeAddress;
  address consumeMarketFeeToken;
  uint256 consumeMarketFeeAmount;
}
```

### OrderStarted

```solidity
event OrderStarted(address consumer, address payer, uint256 amount, uint256 serviceIndex, uint256 timestamp, address publishMarketAddress, uint256 blockNumber)
```

### OrderReused

```solidity
event OrderReused(bytes32 orderTxId, address caller, uint256 timestamp, uint256 number)
```

### OrderExecuted

```solidity
event OrderExecuted(address providerAddress, address consumerAddress, bytes32 orderTxId, bytes providerData, bytes providerSignature, bytes consumerData, bytes consumerSignature, uint256 timestamp, uint256 blockNumber)
```

### PublishMarketFee

```solidity
event PublishMarketFee(address PublishMarketFeeAddress, address PublishMarketFeeToken, uint256 PublishMarketFeeAmount)
```

### ConsumeMarketFee

```solidity
event ConsumeMarketFee(address consumeMarketFeeAddress, address consumeMarketFeeToken, uint256 consumeMarketFeeAmount)
```

### PublishMarketFeeChanged

```solidity
event PublishMarketFeeChanged(address caller, address PublishMarketFeeAddress, address PublishMarketFeeToken, uint256 PublishMarketFeeAmount)
```

### ProviderFee

```solidity
event ProviderFee(address providerFeeAddress, address providerFeeToken, uint256 providerFeeAmount, bytes providerData, uint8 v, bytes32 r, bytes32 s, uint256 validUntil)
```

### MinterProposed

```solidity
event MinterProposed(address currentMinter, address newMinter)
```

### MinterApproved

```solidity
event MinterApproved(address currentMinter, address newMinter)
```

### NewFixedRate

```solidity
event NewFixedRate(bytes32 exchangeId, address owner, address exchangeContract, address baseToken)
```

### NewDispenser

```solidity
event NewDispenser(address dispenserContract)
```

### NewPaymentCollector

```solidity
event NewPaymentCollector(address caller, address _newPaymentCollector, uint256 timestamp, uint256 blockNumber)
```

### onlyNotInitialized

```solidity
modifier onlyNotInitialized()
```

### onlyNFTOwner

```solidity
modifier onlyNFTOwner()
```

### onlyPublishingMarketFeeAddress

```solidity
modifier onlyPublishingMarketFeeAddress()
```

### onlyERC20Deployer

```solidity
modifier onlyERC20Deployer()
```

### initialize

```solidity
function initialize(string[] strings_, address[] addresses_, address[] factoryAddresses_, uint256[] uints_, bytes[] bytes_) external returns (bool)
```

_initialize
     Called prior contract initialization (e.g creating new Datatoken instance)
     Calls private _initialize function. Only if contract is not initialized._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| strings_ | string[] | refers to an array of strings                      [0] = name token                      [1] = symbol |
| addresses_ | address[] | refers to an array of addresses passed by user                     [0]  = minter account who can mint datatokens (can have multiple minters)                     [1]  = paymentCollector initial paymentCollector for this DT                     [2]  = publishing Market Address                     [3]  = publishing Market Fee Token |
| factoryAddresses_ | address[] | refers to an array of addresses passed by the factory                     [0]  = erc721Address                     [1]  = router address |
| uints_ | uint256[] | refers to an array of uints                     [0] = cap_ the total ERC20 cap                     [1] = publishing Market Fee Amount |
| bytes_ | bytes[] | refers to an array of bytes                     Currently not used, usefull for future templates |

### createFixedRate

```solidity
function createFixedRate(address fixedPriceAddress, address[] addresses, uint256[] uints) external returns (bytes32 exchangeId)
```

_createFixedRate
     Creates a new FixedRateExchange setup._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| fixedPriceAddress | address | fixedPriceAddress |
| addresses | address[] | array of addresses [baseToken,owner,marketFeeCollector] |
| uints | uint256[] | array of uints [baseTokenDecimals,datatokenDecimals, fixedRate, marketFee, withMint] |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| exchangeId | bytes32 |  |

### createDispenser

```solidity
function createDispenser(address _dispenser, uint256 maxTokens, uint256 maxBalance, bool withMint, address) external
```

_createDispenser
     Creates a new Dispenser_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _dispenser | address | dispenser contract address |
| maxTokens | uint256 | - max tokens to dispense |
| maxBalance | uint256 | - max balance of requester. |
| withMint | bool | - with MinterRole param allowedSwapper have it here for compat reasons, will be overwritten |
|  | address |  |

### mint

```solidity
function mint(address account, uint256 value) external
```

_mint
     Only the minter address can call it.
     msg.value should be higher than zero and gt or eq minting fee_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | refers to an address that token is going to be minted to. |
| value | uint256 | refers to amount of tokens that is going to be minted. |

### _checkProviderFee

```solidity
function _checkProviderFee(struct ERC20TemplateEnterprise.providerFee _providerFee) internal
```

__checkProviderFee
     Checks if a providerFee structure is valid, signed and 
     transfers fee to providerAddress_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _providerFee | struct ERC20TemplateEnterprise.providerFee | providerFee structure |

### startOrder

```solidity
function startOrder(address consumer, uint256 serviceIndex, struct ERC20TemplateEnterprise.providerFee _providerFee, struct ERC20TemplateEnterprise.consumeMarketFee _consumeMarketFee) public
```

_startOrder
     called by payer or consumer prior ordering a service consume on a marketplace.
     Requires previous approval of consumeFeeToken and publishMarketFeeToken_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| consumer | address | is the consumer address (payer could be different address) |
| serviceIndex | uint256 | service index in the metadata |
| _providerFee | struct ERC20TemplateEnterprise.providerFee | provider fee |
| _consumeMarketFee | struct ERC20TemplateEnterprise.consumeMarketFee | consume market fee |

### reuseOrder

```solidity
function reuseOrder(bytes32 orderTxId, struct ERC20TemplateEnterprise.providerFee _providerFee) external
```

_reuseOrder
     called by payer or consumer having a valid order, but with expired provider access
     Pays the provider fee again, but it will not require a new datatoken payment
     Requires previous approval of provider fee._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderTxId | bytes32 | previous valid order |
| _providerFee | struct ERC20TemplateEnterprise.providerFee | provider feee |

### addMinter

```solidity
function addMinter(address _minter) external
```

_addMinter
     Only ERC20Deployer (at 721 level) can update.
     There can be multiple minters_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minter | address | new minter address |

### removeMinter

```solidity
function removeMinter(address _minter) external
```

_removeMinter
     Only ERC20Deployer (at 721 level) can update.
     There can be multiple minters_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minter | address | minter address to remove |

### addPaymentManager

```solidity
function addPaymentManager(address _paymentManager) external
```

_addPaymentManager (can set who's going to collect fee when consuming orders)
     Only ERC20Deployer (at 721 level) can update.
     There can be multiple paymentCollectors_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _paymentManager | address | new minter address |

### removePaymentManager

```solidity
function removePaymentManager(address _paymentManager) external
```

_removePaymentManager
     Only ERC20Deployer (at 721 level) can update.
     There can be multiple paymentManagers_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _paymentManager | address | _paymentManager address to remove |

### setData

```solidity
function setData(bytes _value) external
```

_setData
     Only ERC20Deployer (at 721 level) can call it.
     This function allows to store data with a preset key (keccak256(ERC20Address)) into NFT 725 Store_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _value | bytes | data to be set with this key |

### cleanPermissions

```solidity
function cleanPermissions() external
```

_cleanPermissions()
     Only NFT Owner (at 721 level) can call it.
     This function allows to remove all minters, feeManagers and reset the paymentCollector_

### cleanFrom721

```solidity
function cleanFrom721() external
```

_cleanFrom721()
     OnlyNFT(721) Contract can call it.
     This function allows to remove all minters, feeManagers and reset the paymentCollector
      This function is used when transferring an NFT to a new owner,
so that permissions at ERC20level (minter,feeManager,paymentCollector) can be reset._

### _internalCleanPermissions

```solidity
function _internalCleanPermissions() internal
```

### setPaymentCollector

```solidity
function setPaymentCollector(address _newPaymentCollector) external
```

_setPaymentCollector
     Only feeManager can call it
     This function allows to set a newPaymentCollector (receives DT when consuming)
            If not set the paymentCollector is the NFT Owner_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newPaymentCollector | address | new fee collector |

### _setPaymentCollector

```solidity
function _setPaymentCollector(address _newPaymentCollector) internal
```

__setPaymentCollector_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newPaymentCollector | address | new fee collector |

### getPublishingMarketFee

```solidity
function getPublishingMarketFee() external view returns (address, address, uint256)
```

_getPublishingMarketFee
     Get publishingMarket Fee
     This function allows to get the current fee set by the publishing market_

### setPublishingMarketFee

```solidity
function setPublishingMarketFee(address _publishMarketFeeAddress, address _publishMarketFeeToken, uint256 _publishMarketFeeAmount) external
```

_setPublishingMarketFee
     Only publishMarketFeeAddress can call it
     This function allows to set the fee required by the publisherMarket_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _publishMarketFeeAddress | address | new _publishMarketFeeAddress |
| _publishMarketFeeToken | address | new _publishMarketFeeToken |
| _publishMarketFeeAmount | uint256 | new fee amount |

### getId

```solidity
function getId() public pure returns (uint8)
```

_getId
     Return template id in case we need different ABIs. 
     If you construct your own template, please make sure to change the hardcoded value_

### name

```solidity
function name() public view returns (string)
```

_name
     It returns the token name._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | Datatoken name. |

### symbol

```solidity
function symbol() public view returns (string)
```

_symbol
     It returns the token symbol._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | Datatoken symbol. |

### getERC721Address

```solidity
function getERC721Address() public view returns (address)
```

_getERC721Address
     It returns the parent ERC721_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | ERC721 address. |

### decimals

```solidity
function decimals() public pure returns (uint8)
```

_decimals
     It returns the token decimals.
     how many supported decimal points_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint8 | Datatoken decimals. |

### cap

```solidity
function cap() external view returns (uint256)
```

_cap
     it returns the capital._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Datatoken cap. |

### isInitialized

```solidity
function isInitialized() external view returns (bool)
```

_isInitialized
     It checks whether the contract is initialized._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | true if the contract is initialized. |

### permit

```solidity
function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external
```

_permit
     used for signed approvals, see ERC20Template test for more details_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| owner | address | user who signed the message |
| spender | address | spender |
| value | uint256 | token amount |
| deadline | uint256 | deadline after which signed message is no more valid |
| v | uint8 | parameters from signed message |
| r | bytes32 | parameters from signed message |
| s | bytes32 | parameters from signed message |

### getPaymentCollector

```solidity
function getPaymentCollector() public view returns (address)
```

_getPaymentCollector
     It returns the current paymentCollector_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | paymentCollector address |

### fallback

```solidity
fallback() external payable
```

_fallback function
     this is a default fallback function in which receives
     the collected ether._

### receive

```solidity
receive() external payable
```

_receive function
     this is a default receive function in which receives
     the collected ether._

### withdrawETH

```solidity
function withdrawETH() external payable
```

_withdrawETH
     transfers all the accumlated ether the collector account_

### OrderParams

```solidity
struct OrderParams {
  address consumer;
  uint256 serviceIndex;
  struct ERC20TemplateEnterprise.providerFee _providerFee;
  struct ERC20TemplateEnterprise.consumeMarketFee _consumeMarketFee;
}
```

### FreParams

```solidity
struct FreParams {
  address exchangeContract;
  bytes32 exchangeId;
  uint256 maxBaseTokenAmount;
  uint256 swapMarketFee;
  address marketFeeAddress;
}
```

### buyFromFreAndOrder

```solidity
function buyFromFreAndOrder(struct ERC20TemplateEnterprise.OrderParams _orderParams, struct ERC20TemplateEnterprise.FreParams _freParams) external
```

_buyFromFreAndOrder
     Buys 1 DT from the FRE and then startsOrder, while burning that DT_

### buyFromDispenserAndOrder

```solidity
function buyFromDispenserAndOrder(struct ERC20TemplateEnterprise.OrderParams _orderParams, address dispenserContract) external
```

_buyFromDispenserAndOrder
     Gets DT from dispenser and then startsOrder, while burning that DT_

### isERC20Deployer

```solidity
function isERC20Deployer(address user) public view returns (bool)
```

_isERC20Deployer
     returns true if address has deployERC20 role_

### getFixedRates

```solidity
function getFixedRates() public view returns (struct ERC20TemplateEnterprise.fixedRate[])
```

_getFixedRates
     Returns the list of fixedRateExchanges created for this datatoken_

### getDispensers

```solidity
function getDispensers() public view returns (address[])
```

_getDispensers
     Returns the list of dispensers created for this datatoken_

### _pullUnderlying

```solidity
function _pullUnderlying(address erc20, address from, address to, uint256 amount) internal
```

### orderExecuted

```solidity
function orderExecuted(bytes32 orderTxId, bytes providerData, bytes providerSignature, bytes consumerData, bytes consumerSignature, address consumerAddress) external
```

_orderExecuted
     Providers should call this to prove order execution_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| orderTxId | bytes32 | order tx |
| providerData | bytes | provider data |
| providerSignature | bytes | provider signature |
| consumerData | bytes | consumer data |
| consumerSignature | bytes | consumer signature |
| consumerAddress | address | consumer address |

### _ecrecovery

```solidity
function _ecrecovery(bytes32 hash, bytes sig) internal pure returns (address)
```

