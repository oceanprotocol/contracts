# Solidity API

## Dispenser

### router

```solidity
address router
```

### DataToken

```solidity
struct DataToken {
  bool active;
  address owner;
  uint256 maxTokens;
  uint256 maxBalance;
  address allowedSwapper;
}
```

### datatokens

```solidity
mapping(address => struct Dispenser.DataToken) datatokens
```

### datatokensList

```solidity
address[] datatokensList
```

### DispenserCreated

```solidity
event DispenserCreated(address datatokenAddress, address owner, uint256 maxTokens, uint256 maxBalance, address allowedSwapper)
```

### DispenserActivated

```solidity
event DispenserActivated(address datatokenAddress)
```

### DispenserDeactivated

```solidity
event DispenserDeactivated(address datatokenAddress)
```

### DispenserAllowedSwapperChanged

```solidity
event DispenserAllowedSwapperChanged(address datatoken, address newAllowedSwapper)
```

### TokensDispensed

```solidity
event TokensDispensed(address datatokenAddress, address userAddress, uint256 amount)
```

### OwnerWithdrawed

```solidity
event OwnerWithdrawed(address datatoken, address owner, uint256 amount)
```

### onlyRouter

```solidity
modifier onlyRouter()
```

### onlyOwner

```solidity
modifier onlyOwner(address datatoken)
```

### onlyOwnerAndTemplate

```solidity
modifier onlyOwnerAndTemplate(address datatoken)
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

### status

```solidity
function status(address datatoken) external view returns (bool active, address owner, bool isMinter, uint256 maxTokens, uint256 maxBalance, uint256 balance, address allowedSwapper)
```

_status
     Get information about a datatoken dispenser_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatoken | address | refers to datatoken address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| active | bool | - if the dispenser is active for this datatoken |
| owner | address | - owner of this dispenser |
| isMinter | bool | - check the datatoken contract if the dispenser has mint roles |
| maxTokens | uint256 | - max tokens to dispense |
| maxBalance | uint256 | - max balance of requester. If the balance is higher, the dispense is rejected |
| balance | uint256 | - internal balance of the contract (if any) |
| allowedSwapper | address | - address allowed to request DT if != 0 |

### create

```solidity
function create(address datatoken, uint256 maxTokens, uint256 maxBalance, address owner, address allowedSwapper) external
```

_create
     Create a new dispenser_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatoken | address | refers to datatoken address. |
| maxTokens | uint256 | - max tokens to dispense |
| maxBalance | uint256 | - max balance of requester. |
| owner | address | - owner |
| allowedSwapper | address | - if !=0, only this address can request DTs |

### activate

```solidity
function activate(address datatoken, uint256 maxTokens, uint256 maxBalance) external
```

_activate
     Activate a new dispenser_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatoken | address | refers to datatoken address. |
| maxTokens | uint256 | - max tokens to dispense |
| maxBalance | uint256 | - max balance of requester. |

### deactivate

```solidity
function deactivate(address datatoken) external
```

_deactivate
     Deactivate an existing dispenser_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatoken | address | refers to datatoken address. |

### setAllowedSwapper

```solidity
function setAllowedSwapper(address datatoken, address newAllowedSwapper) external
```

_setAllowedSwapper
     Sets a new allowedSwapper_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatoken | address | refers to datatoken address. |
| newAllowedSwapper | address | refers to the new allowedSwapper |

### dispense

```solidity
function dispense(address datatoken, uint256 amount, address destination) external payable
```

_dispense
 Dispense datatokens to caller. 
 The dispenser must be active, hold enough DT (or be able to mint more) 
 and respect maxTokens/maxBalance requirements_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatoken | address | refers to datatoken address. |
| amount | uint256 | amount of datatokens required. |
| destination | address | refers to who will receive the tokens |

### ownerWithdraw

```solidity
function ownerWithdraw(address datatoken) external
```

_ownerWithdraw
     Withdraw all datatokens in this dispenser balance to ERC20.getPaymentCollector()_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatoken | address | refers to datatoken address. |

### _ownerWithdraw

```solidity
function _ownerWithdraw(address datatoken) internal
```

