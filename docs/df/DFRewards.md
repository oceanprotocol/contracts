# Solidity API

## DFRewards

### balances

```solidity
mapping(address => mapping(address => uint256)) balances
```

### allocated

```solidity
mapping(address => uint256) allocated
```

### live_strategies

```solidity
address[] live_strategies
```

### allocate

```solidity
function allocate(address[] _tos, uint256[] _values, address tokenAddress) external returns (bool)
```

### claimable

```solidity
function claimable(address _to, address tokenAddress) public view returns (uint256)
```

### _claim

```solidity
function _claim(address _to, address tokenAddress, address _receiver) internal returns (uint256)
```

### claimFor

```solidity
function claimFor(address _to, address tokenAddress) public returns (uint256)
```

### claimForStrat

```solidity
function claimForStrat(address _to, address tokenAddress) public returns (uint256)
```

### withdrawERCToken

```solidity
function withdrawERCToken(uint256 amount, address _token) external
```

### isStrategy

```solidity
function isStrategy(address _strategy) public view returns (bool)
```

_isStrategy
     Returns true if strategy exists in the list
 @param _strategy address Strategy address to be checked_

### addStrategy

```solidity
function addStrategy(address _strategy) external
```

_addStrategy
     Adds a new strategy
 @param _strategy address Strategy address to be added_

### retireStrategy

```solidity
function retireStrategy(address _strategy) external
```

_retireStrategy
     Removes an existng strategy
 @param _strategy address Strategy address to be removed_

### fallback

```solidity
fallback() external
```

