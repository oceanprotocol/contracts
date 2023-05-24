# Solidity API

## OceanToken

_Implementation of the Ocean Token._

### DECIMALS

```solidity
uint8 DECIMALS
```

### CAP

```solidity
uint256 CAP
```

### TOTALSUPPLY

```solidity
uint256 TOTALSUPPLY
```

### constructor

```solidity
constructor(address contractOwner) public
```

_OceanToken constructor_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| contractOwner | address | refers to the owner of the contract |

### mint

```solidity
function mint(address to, uint256 amount) external
```

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

