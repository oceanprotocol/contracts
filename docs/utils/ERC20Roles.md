# Solidity API

## ERC20Roles

### permissions

```solidity
mapping(address => struct ERC20Roles.RolesERC20) permissions
```

### authERC20

```solidity
address[] authERC20
```

### RolesERC20

```solidity
struct RolesERC20 {
  bool minter;
  bool paymentManager;
}
```

### AddedMinter

```solidity
event AddedMinter(address user, address signer, uint256 timestamp, uint256 blockNumber)
```

### RemovedMinter

```solidity
event RemovedMinter(address user, address signer, uint256 timestamp, uint256 blockNumber)
```

### getPermissions

```solidity
function getPermissions(address user) public view returns (struct ERC20Roles.RolesERC20)
```

_getPermissions
     Returns list of roles for an user_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | user address |

### isMinter

```solidity
function isMinter(address account) public view returns (bool)
```

_isMinter
     Check if an address has the minter role_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | refers to an address that is checked |

### _addMinter

```solidity
function _addMinter(address _minter) internal
```

__addMinter
     Internal function to add minter role to an user._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minter | address | user address |

### _removeMinter

```solidity
function _removeMinter(address _minter) internal
```

__removeMinter
     Internal function to remove minter role from an user._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minter | address | user address |

### AddedPaymentManager

```solidity
event AddedPaymentManager(address user, address signer, uint256 timestamp, uint256 blockNumber)
```

### RemovedPaymentManager

```solidity
event RemovedPaymentManager(address user, address signer, uint256 timestamp, uint256 blockNumber)
```

### _addPaymentManager

```solidity
function _addPaymentManager(address _paymentCollector) internal
```

__addPaymentManager
     Internal function to add paymentManager role to an user._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _paymentCollector | address | user address |

### _removePaymentManager

```solidity
function _removePaymentManager(address _paymentCollector) internal
```

__removePaymentManager
     Internal function to remove paymentManager role from an user._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _paymentCollector | address | user address |

### CleanedPermissions

```solidity
event CleanedPermissions(address signer, uint256 timestamp, uint256 blockNumber)
```

### _cleanPermissions

```solidity
function _cleanPermissions() internal
```

### _pushToAuthERC20

```solidity
function _pushToAuthERC20(address user) internal
```

__pushToAuthERC20
     Checks authERC20 array and adds the user address if does not exists_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | address to be checked |

### _SafeRemoveFromAuthERC20

```solidity
function _SafeRemoveFromAuthERC20(address user) internal
```

__SafeRemoveFromAuthERC20
     Checks if user has any roles left, and if not, it will remove it from auth array_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | address to be checked and removed |

