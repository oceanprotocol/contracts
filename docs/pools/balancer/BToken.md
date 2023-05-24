# Solidity API

## BTokenBase

### _balance

```solidity
mapping(address => uint256) _balance
```

### _allowance

```solidity
mapping(address => mapping(address => uint256)) _allowance
```

### _totalSupply

```solidity
uint256 _totalSupply
```

### Approval

```solidity
event Approval(address src, address dst, uint256 amt)
```

### Transfer

```solidity
event Transfer(address src, address dst, uint256 amt)
```

### _mint

```solidity
function _mint(uint256 amt) internal
```

### _burn

```solidity
function _burn(uint256 amt) internal
```

### _move

```solidity
function _move(address src, address dst, uint256 amt) internal
```

### _push

```solidity
function _push(address to, uint256 amt) internal
```

### _pull

```solidity
function _pull(address from, uint256 amt) internal
```

## BToken

### name

```solidity
function name() external view returns (string)
```

### symbol

```solidity
function symbol() external view returns (string)
```

### decimals

```solidity
function decimals() external view returns (uint8)
```

### allowance

```solidity
function allowance(address src, address dst) external view returns (uint256)
```

### balanceOf

```solidity
function balanceOf(address whom) external view returns (uint256)
```

### totalSupply

```solidity
function totalSupply() public view returns (uint256)
```

### approve

```solidity
function approve(address dst, uint256 amt) external returns (bool)
```

### increaseApproval

```solidity
function increaseApproval(address dst, uint256 amt) external returns (bool)
```

### decreaseApproval

```solidity
function decreaseApproval(address dst, uint256 amt) external returns (bool)
```

### transfer

```solidity
function transfer(address dst, uint256 amt) external returns (bool)
```

### transferFrom

```solidity
function transferFrom(address src, address dst, uint256 amt) external returns (bool)
```

