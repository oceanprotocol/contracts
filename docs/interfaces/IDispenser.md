# Solidity API

## IDispenser

### status

```solidity
function status(address datatoken) external view returns (bool active, address owner, bool isMinter, uint256 maxTokens, uint256 maxBalance, uint256 balance, address allowedSwapper)
```

### create

```solidity
function create(address datatoken, uint256 maxTokens, uint256 maxBalance, address owner, address allowedSwapper) external
```

### activate

```solidity
function activate(address datatoken, uint256 maxTokens, uint256 maxBalance) external
```

### deactivate

```solidity
function deactivate(address datatoken) external
```

### dispense

```solidity
function dispense(address datatoken, uint256 amount, address destination) external payable
```

### ownerWithdraw

```solidity
function ownerWithdraw(address datatoken) external
```

### setAllowedSwapper

```solidity
function setAllowedSwapper(address datatoken, address newAllowedSwapper) external
```

### getId

```solidity
function getId() external pure returns (uint8)
```

