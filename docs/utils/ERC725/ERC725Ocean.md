# Solidity API

## ERC725Ocean

_Implementation of a contract module which provides the ability to call arbitrary functions at any other smart contract and itself,
including using `delegatecall`, as well creating contracts using `create` and `create2`.
This is the basis for a smart contract based account system, but could also be used as a proxy account system.

`execute` MUST only be called by the owner of the contract set via ERC173.

 @author Fabian Vogelsteller <fabian@lukso.network>_

### _INTERFACE_ID_ERC725X

```solidity
bytes4 _INTERFACE_ID_ERC725X
```

### OPERATION_CALL

```solidity
uint256 OPERATION_CALL
```

### OPERATION_DELEGATECALL

```solidity
uint256 OPERATION_DELEGATECALL
```

### OPERATION_CREATE2

```solidity
uint256 OPERATION_CREATE2
```

### OPERATION_CREATE

```solidity
uint256 OPERATION_CREATE
```

### _INTERFACE_ID_ERC725Y

```solidity
bytes4 _INTERFACE_ID_ERC725Y
```

### store

```solidity
mapping(bytes32 => bytes) store
```

### constructor

```solidity
constructor() public
```

### execute

```solidity
function execute(uint256 _operation, address _to, uint256 _value, bytes _data) internal
```

Executes any other smart contract. Is only callable by the owner.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _operation | uint256 | the operation to execute: CALL = 0; DELEGATECALL = 1; CREATE2 = 2; CREATE = 3; |
| _to | address | the smart contract or address to interact with. `_to` will be unused if a contract is created (operation 2 and 3) |
| _value | uint256 | the value of ETH to transfer |
| _data | bytes | the call data, or the contract data to deploy |

### executeCall

```solidity
function executeCall(address to, uint256 value, bytes data, uint256 txGas) internal returns (bool success)
```

### executeDelegateCall

```solidity
function executeDelegateCall(address to, bytes data, uint256 txGas) internal returns (bool success)
```

### performCreate

```solidity
function performCreate(uint256 value, bytes deploymentData) internal returns (address newContract)
```

### getData

```solidity
function getData(bytes32 _key) public view virtual returns (bytes _value)
```

Gets data at a given `key`

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _key | bytes32 | the key which value to retrieve |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| _value | bytes | The data stored at the key |

### setData

```solidity
function setData(bytes32 _key, bytes _value) internal virtual
```

Sets data at a given `key`

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _key | bytes32 | the key which value to retrieve |
| _value | bytes | the bytes to set. |

