# Solidity API

## MockOldDT

_DatatokenTemplate is an ERC20 compliant token template
     Used by the factory contract as a bytecode reference to 
     deploy new Datatokens._

### BASE

```solidity
uint256 BASE
```

### BASE_COMMUNITY_FEE_PERCENTAGE

```solidity
uint256 BASE_COMMUNITY_FEE_PERCENTAGE
```

### BASE_MARKET_FEE_PERCENTAGE

```solidity
uint256 BASE_MARKET_FEE_PERCENTAGE
```

### OrderStarted

```solidity
event OrderStarted(address consumer, address payer, uint256 amount, uint256 serviceId, uint256 timestamp, address mrktFeeCollector, uint256 marketFee)
```

### OrderFinished

```solidity
event OrderFinished(bytes32 orderTxId, address consumer, uint256 amount, uint256 serviceId, address provider, uint256 timestamp)
```

### MinterProposed

```solidity
event MinterProposed(address currentMinter, address newMinter)
```

### MinterApproved

```solidity
event MinterApproved(address currentMinter, address newMinter)
```

### onlyNotInitialized

```solidity
modifier onlyNotInitialized()
```

### onlyMinter

```solidity
modifier onlyMinter()
```

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize(string name, string symbol, address minterAddress, uint256 cap_, string blob_, address feeCollector) external returns (bool)
```

### mint

```solidity
function mint(address account, uint256 value) external
```

### startOrder

```solidity
function startOrder(address consumer, uint256 amount, uint256 serviceId, address mrktFeeCollector) external
```

### finishOrder

```solidity
function finishOrder(bytes32 orderTxId, address consumer, uint256 amount, uint256 serviceId) external
```

### proposeMinter

```solidity
function proposeMinter(address newMinter) external
```

_proposeMinter
     It proposes a new token minter address.
     Only the current minter can call it._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newMinter | address | refers to a new token minter address. |

### approveMinter

```solidity
function approveMinter() external
```

_approveMinter
     It approves a new token minter address.
     Only the current minter can call it._

### blob

```solidity
function blob() external view returns (string)
```

_blob
     It returns the blob (e.g https://123.com)._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | Datatoken blob. |

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

### isMinter

```solidity
function isMinter(address account) external view returns (bool)
```

_isMinter
     It takes the address and checks whether it has a minter role._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | refers to the address. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | true if account has a minter role. |

### minter

```solidity
function minter() external view returns (address)
```

_minter_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | minter's address. |

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

### calculateFee

```solidity
function calculateFee(uint256 amount, uint256 feePercentage) public pure returns (uint256)
```

_calculateFee
     giving a fee percentage, and amount it calculates the actual fee_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | the amount of token |
| feePercentage | uint256 | the fee percentage |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the token fee. |

