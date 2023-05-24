# Solidity API

## IFixedRateExchange

### createWithDecimals

```solidity
function createWithDecimals(address datatoken, address[] addresses, uint256[] uints) external returns (bytes32 exchangeId)
```

### buyDT

```solidity
function buyDT(bytes32 exchangeId, uint256 datatokenAmount, uint256 maxBaseTokenAmount, address consumeMarketAddress, uint256 consumeMarketSwapFeeAmount) external
```

### sellDT

```solidity
function sellDT(bytes32 exchangeId, uint256 datatokenAmount, uint256 minBaseTokenAmount, address consumeMarketAddress, uint256 consumeMarketSwapFeeAmount) external
```

### getAllowedSwapper

```solidity
function getAllowedSwapper(bytes32 exchangeId) external view returns (address allowedSwapper)
```

### getExchange

```solidity
function getExchange(bytes32 exchangeId) external view returns (address exchangeOwner, address datatoken, uint256 dtDecimals, address baseToken, uint256 btDecimals, uint256 fixedRate, bool active, uint256 dtSupply, uint256 btSupply, uint256 dtBalance, uint256 btBalance, bool withMint)
```

### getFeesInfo

```solidity
function getFeesInfo(bytes32 exchangeId) external view returns (uint256 marketFee, address marketFeeCollector, uint256 opcFee, uint256 marketFeeAvailable, uint256 oceanFeeAvailable)
```

### isActive

```solidity
function isActive(bytes32 exchangeId) external view returns (bool)
```

### calcBaseInGivenOutDT

```solidity
function calcBaseInGivenOutDT(bytes32 exchangeId, uint256 datatokenAmount, uint256 consumeMarketSwapFeeAmount) external view returns (uint256 baseTokenAmount, uint256 oceanFeeAmount, uint256 publishMarketFeeAmount, uint256 consumeMarketFeeAmount)
```

### calcBaseOutGivenInDT

```solidity
function calcBaseOutGivenInDT(bytes32 exchangeId, uint256 datatokenAmount, uint256 consumeMarketSwapFeeAmount) external view returns (uint256 baseTokenAmount, uint256 oceanFeeAmount, uint256 publishMarketFeeAmount, uint256 consumeMarketFeeAmount)
```

### updateMarketFee

```solidity
function updateMarketFee(bytes32 exchangeId, uint256 _newMarketFee) external
```

### updateMarketFeeCollector

```solidity
function updateMarketFeeCollector(bytes32 exchangeId, address _newMarketCollector) external
```

### setAllowedSwapper

```solidity
function setAllowedSwapper(bytes32 exchangeId, address newAllowedSwapper) external
```

### getId

```solidity
function getId() external pure returns (uint8)
```

### collectBT

```solidity
function collectBT(bytes32 exchangeId, uint256 amount) external
```

### collectDT

```solidity
function collectDT(bytes32 exchangeId, uint256 amount) external
```

