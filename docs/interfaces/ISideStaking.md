# Solidity API

## ISideStaking

### newDatatokenCreated

```solidity
function newDatatokenCreated(address datatokenAddress, address baseTokenAddress, address poolAddress, address publisherAddress, uint256[] ssParams) external returns (bool)
```

### getDatatokenCirculatingSupply

```solidity
function getDatatokenCirculatingSupply(address datatokenAddress) external view returns (uint256)
```

### getPublisherAddress

```solidity
function getPublisherAddress(address datatokenAddress) external view returns (address)
```

### getBaseTokenAddress

```solidity
function getBaseTokenAddress(address datatokenAddress) external view returns (address)
```

### getPoolAddress

```solidity
function getPoolAddress(address datatokenAddress) external view returns (address)
```

### getBaseTokenBalance

```solidity
function getBaseTokenBalance(address datatokenAddress) external view returns (uint256)
```

### getDatatokenBalance

```solidity
function getDatatokenBalance(address datatokenAddress) external view returns (uint256)
```

### getvestingEndBlock

```solidity
function getvestingEndBlock(address datatokenAddress) external view returns (uint256)
```

### getvestingAmount

```solidity
function getvestingAmount(address datatokenAddress) external view returns (uint256)
```

### getvestingLastBlock

```solidity
function getvestingLastBlock(address datatokenAddress) external view returns (uint256)
```

### getvestingAmountSoFar

```solidity
function getvestingAmountSoFar(address datatokenAddress) external view returns (uint256)
```

### canStake

```solidity
function canStake(address datatokenAddress, uint256 amount) external view returns (bool)
```

### Stake

```solidity
function Stake(address datatokenAddress, uint256 amount) external
```

### canUnStake

```solidity
function canUnStake(address datatokenAddress, uint256 amount) external view returns (bool)
```

### UnStake

```solidity
function UnStake(address datatokenAddress, uint256 amount, uint256 poolAmountIn) external
```

### getId

```solidity
function getId() external pure returns (uint8)
```

