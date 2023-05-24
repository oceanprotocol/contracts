# Solidity API

## veAllocate

### AllocationSet

```solidity
event AllocationSet(address sender, address nft, uint256 chainId, uint256 amount)
```

### AllocationSetMultiple

```solidity
event AllocationSetMultiple(address sender, address[] nft, uint256[] chainId, uint256[] amount)
```

### getveAllocation

```solidity
function getveAllocation(address user, address nft, uint256 chainid) external view returns (uint256)
```

### getTotalAllocation

```solidity
function getTotalAllocation(address user) public view returns (uint256)
```

### setAllocation

```solidity
function setAllocation(uint256 amount, address nft, uint256 chainId) external
```

### setBatchAllocation

```solidity
function setBatchAllocation(uint256[] amount, address[] nft, uint256[] chainId) external
```

