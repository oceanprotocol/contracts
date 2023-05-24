# Solidity API

## IFactoryRouter

### deployPool

```solidity
function deployPool(address[2] tokens, uint256[] ssParams, uint256[] swapFees, address[] addresses) external returns (address)
```

### deployFixedRate

```solidity
function deployFixedRate(address fixedPriceAddress, address[] addresses, uint256[] uints) external returns (bytes32 exchangeId)
```

### getOPCFee

```solidity
function getOPCFee(address baseToken) external view returns (uint256)
```

### getOPCFees

```solidity
function getOPCFees() external view returns (uint256, uint256)
```

### getOPCConsumeFee

```solidity
function getOPCConsumeFee() external view returns (uint256)
```

### getOPCProviderFee

```solidity
function getOPCProviderFee() external view returns (uint256)
```

### getMinVestingPeriod

```solidity
function getMinVestingPeriod() external view returns (uint256)
```

### deployDispenser

```solidity
function deployDispenser(address _dispenser, address datatoken, uint256 maxTokens, uint256 maxBalance, address owner, address allowedSwapper) external
```

### isApprovedToken

```solidity
function isApprovedToken(address) external view returns (bool)
```

### getApprovedTokens

```solidity
function getApprovedTokens() external view returns (address[])
```

### isSSContract

```solidity
function isSSContract(address) external view returns (bool)
```

### getSSContracts

```solidity
function getSSContracts() external view returns (address[])
```

### isFixedRateContract

```solidity
function isFixedRateContract(address) external view returns (bool)
```

### getFixedRatesContracts

```solidity
function getFixedRatesContracts() external view returns (address[])
```

### isDispenserContract

```solidity
function isDispenserContract(address) external view returns (bool)
```

### getDispensersContracts

```solidity
function getDispensersContracts() external view returns (address[])
```

### isPoolTemplate

```solidity
function isPoolTemplate(address) external view returns (bool)
```

### getPoolTemplates

```solidity
function getPoolTemplates() external view returns (address[])
```

### Stakes

```solidity
struct Stakes {
  address poolAddress;
  uint256 tokenAmountIn;
  uint256 minPoolAmountOut;
}
```

### stakeBatch

```solidity
function stakeBatch(struct IFactoryRouter.Stakes[]) external
```

### operationType

```solidity
enum operationType {
  SwapExactIn,
  SwapExactOut,
  FixedRate,
  Dispenser
}
```

### Operations

```solidity
struct Operations {
  bytes32 exchangeIds;
  address source;
  enum IFactoryRouter.operationType operation;
  address tokenIn;
  uint256 amountsIn;
  address tokenOut;
  uint256 amountsOut;
  uint256 maxPrice;
  uint256 swapMarketFee;
  address marketFeeAddress;
}
```

### buyDTBatch

```solidity
function buyDTBatch(struct IFactoryRouter.Operations[]) external
```

### updateOPCCollector

```solidity
function updateOPCCollector(address _opcCollector) external
```

### getOPCCollector

```solidity
function getOPCCollector() external view returns (address)
```

