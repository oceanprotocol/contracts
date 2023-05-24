# Solidity API

## IDFRewards

### Allocated

```solidity
event Allocated(address[] tos, uint256[] values, address tokenAddress)
```

### Claimed

```solidity
event Claimed(address to, uint256 value, address tokenAddress)
```

### StrategyAdded

```solidity
event StrategyAdded(address strategy)
```

### StrategyRetired

```solidity
event StrategyRetired(address strategy)
```

### claimable

```solidity
function claimable(address _to, address tokenAddress) external view returns (uint256)
```

### claimFor

```solidity
function claimFor(address _to, address tokenAddress) external returns (uint256)
```

### withdrawERCToken

```solidity
function withdrawERCToken(uint256 amount, address _token) external
```

### claimForStrat

```solidity
function claimForStrat(address _to, address tokenAddress) external returns (uint256)
```

