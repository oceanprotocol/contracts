# Solidity API

## SmartWalletChecker

### isManager

```solidity
mapping(address => bool) isManager
```

### isAllowed

```solidity
mapping(address => bool) isAllowed
```

### onlyManager

```solidity
modifier onlyManager()
```

### constructor

```solidity
constructor() public
```

### setManager

```solidity
function setManager(address _manager, bool _status) external
```

Sets the status of a manager

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _manager | address | The address of the manager |
| _status | bool | The status to allow the manager |

### setAllowedContract

```solidity
function setAllowedContract(address _contract, bool _status) external
```

Sets the status of a contract to be allowed or disallowed

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contract | address | The address of the contract |
| _status | bool | The status to allow the manager |

### check

```solidity
function check(address _address) external view returns (bool)
```

returns true is _address is whitelisted

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _address | address | The address to check |

