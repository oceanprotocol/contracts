# Solidity API

## BFactory

### opcCollector

```solidity
address opcCollector
```

### poolTemplates

```solidity
address[] poolTemplates
```

### BPoolCreated

```solidity
event BPoolCreated(address newBPoolAddress, address registeredBy, address datatokenAddress, address baseTokenAddress, address bpoolTemplateAddress, address ssAddress)
```

### PoolTemplateAdded

```solidity
event PoolTemplateAdded(address caller, address contractAddress)
```

### PoolTemplateRemoved

```solidity
event PoolTemplateRemoved(address caller, address contractAddress)
```

### constructor

```solidity
constructor(address _bpoolTemplate, address _opcCollector, address[] _preCreatedPools) public
```

### newBPool

```solidity
function newBPool(address[2] tokens, uint256[] ssParams, uint256[] swapFees, address[] addresses) internal returns (address bpool)
```

_Deploys new BPool proxy contract. 
       Template contract address could not be a zero address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokens | address[2] | [datatokenAddress, baseTokenAddress] publisherAddress user which will be assigned the vested amount. |
| ssParams | uint256[] | params for the ssContract. |
| swapFees | uint256[] | swapFees (swapFee, swapMarketFee), swapOceanFee will be set automatically later        marketFeeCollector marketFeeCollector address        @param addresses // array of addresses passed by the user        [controller,baseTokenAddress,baseTokenSender,publisherAddress, marketFeeCollector,poolTemplate address]       @return bpool address of a new proxy BPool contract |
| addresses | address[] |  |

### _addPoolTemplate

```solidity
function _addPoolTemplate(address poolTemplate) internal
```

__addPoolTemplate
     Adds an address to the list of pools templates
 @param poolTemplate address Contract to be added_

### _removePoolTemplate

```solidity
function _removePoolTemplate(address poolTemplate) internal
```

__removeFixedRateContract
     Removes an address from the list of pool templates
 @param poolTemplate address Contract to be removed_

### isPoolTemplate

```solidity
function isPoolTemplate(address poolTemplate) public view virtual returns (bool)
```

_isPoolTemplate
     Removes true if address exists in the list of templates
 @param poolTemplate address Contract to be checked_

### getPoolTemplates

```solidity
function getPoolTemplates() public view virtual returns (address[])
```

_getPoolTemplates
     Returns the list of pool templates_

