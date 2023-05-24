# Solidity API

## IveOCEAN

### deposit_for

```solidity
function deposit_for(address _address, uint256 _amount) external
```

## DFStrategyV1

### dfrewards

```solidity
contract IDFRewards dfrewards
```

### id

```solidity
uint8 id
```

### constructor

```solidity
constructor(address _dfrewards) public
```

### claimMultiple

```solidity
function claimMultiple(address _to, address[] tokenAddresses) public
```

### claim

```solidity
function claim(address[] tokenAddresses) external returns (bool)
```

### claimables

```solidity
function claimables(address _to, address[] tokenAddresses) external view returns (uint256[] result)
```

