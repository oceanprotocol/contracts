# Solidity API

## ERC721RolesAddress

### permissions

```solidity
mapping(address => struct ERC721RolesAddress.Roles) permissions
```

### auth

```solidity
address[] auth
```

### Roles

```solidity
struct Roles {
  bool manager;
  bool deployERC20;
  bool updateMetadata;
  bool store;
}
```

### RolesType

```solidity
enum RolesType {
  Manager,
  DeployERC20,
  UpdateMetadata,
  Store
}
```

### getPermissions

```solidity
function getPermissions(address user) public view returns (struct ERC721RolesAddress.Roles)
```

_getPermissions
     Returns list of roles for an user_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | user address |

### onlyManager

```solidity
modifier onlyManager()
```

### AddedTo725StoreList

```solidity
event AddedTo725StoreList(address user, address signer, uint256 timestamp, uint256 blockNumber)
```

### RemovedFrom725StoreList

```solidity
event RemovedFrom725StoreList(address user, address signer, uint256 timestamp, uint256 blockNumber)
```

### addTo725StoreList

```solidity
function addTo725StoreList(address _allowedAddress) public
```

_addTo725StoreList
     Adds store role to an user.
     It can be called only by a manager_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _allowedAddress | address | user address |

### removeFrom725StoreList

```solidity
function removeFrom725StoreList(address _allowedAddress) public
```

_removeFrom725StoreList
     Removes store role from an user.
     It can be called by a manager or by the same user, if he already has store role_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _allowedAddress | address | user address |

### AddedToCreateERC20List

```solidity
event AddedToCreateERC20List(address user, address signer, uint256 timestamp, uint256 blockNumber)
```

### RemovedFromCreateERC20List

```solidity
event RemovedFromCreateERC20List(address user, address signer, uint256 timestamp, uint256 blockNumber)
```

### addToCreateERC20List

```solidity
function addToCreateERC20List(address _allowedAddress) public
```

_addToCreateERC20List
     Adds deployERC20 role to an user.
     It can be called only by a manager_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _allowedAddress | address | user address |

### _addToCreateERC20List

```solidity
function _addToCreateERC20List(address _allowedAddress) internal
```

### removeFromCreateERC20List

```solidity
function removeFromCreateERC20List(address _allowedAddress) public
```

_removeFromCreateERC20List
     Removes deployERC20 role from an user.
     It can be called by a manager or by the same user, if he already has deployERC20 role_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _allowedAddress | address | user address |

### AddedToMetadataList

```solidity
event AddedToMetadataList(address user, address signer, uint256 timestamp, uint256 blockNumber)
```

### RemovedFromMetadataList

```solidity
event RemovedFromMetadataList(address user, address signer, uint256 timestamp, uint256 blockNumber)
```

### addToMetadataList

```solidity
function addToMetadataList(address _allowedAddress) public
```

_addToMetadataList
     Adds metadata role to an user.
     It can be called only by a manager_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _allowedAddress | address | user address |

### _addToMetadataList

```solidity
function _addToMetadataList(address _allowedAddress) internal
```

### removeFromMetadataList

```solidity
function removeFromMetadataList(address _allowedAddress) public
```

_removeFromMetadataList
     Removes metadata role from an user.
     It can be called by a manager or by the same user, if he already has metadata role_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _allowedAddress | address | user address |

### AddedManager

```solidity
event AddedManager(address user, address signer, uint256 timestamp, uint256 blockNumber)
```

### RemovedManager

```solidity
event RemovedManager(address user, address signer, uint256 timestamp, uint256 blockNumber)
```

### _addManager

```solidity
function _addManager(address _managerAddress) internal
```

__addManager
     Internal function to add manager role for an addres_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _managerAddress | address | user address |

### _removeManager

```solidity
function _removeManager(address _managerAddress) internal
```

__removeManager
     Internal function to clear the manager role for an addres_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _managerAddress | address | user address |

### CleanedPermissions

```solidity
event CleanedPermissions(address signer, uint256 timestamp, uint256 blockNumber)
```

### _cleanPermissions

```solidity
function _cleanPermissions() internal
```

__cleanPermissions
     Internal function to clear all existing permisions_

### addMultipleUsersToRoles

```solidity
function addMultipleUsersToRoles(address[] addresses, enum ERC721RolesAddress.RolesType[] roles) external
```

_addMultipleUsersToRoles
     Add multiple users to multiple roles_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| addresses | address[] | Array of addresses |
| roles | enum ERC721RolesAddress.RolesType[] | Array of coresponding roles |

### _pushToAuth

```solidity
function _pushToAuth(address user) internal
```

__pushToAuth
     Checks auth array and adds the user address if does not exists_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | address to be checked |

### _SafeRemoveFromAuth

```solidity
function _SafeRemoveFromAuth(address user) internal
```

__SafeRemoveFromAuth
     Checks if user has any roles left, and if not, it will remove it from auth array_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| user | address | address to be checked and removed |

