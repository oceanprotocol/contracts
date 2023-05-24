# Solidity API

## IFactory

### createToken

```solidity
function createToken(uint256 _templateIndex, string[] strings, address[] addresses, uint256[] uints, bytes[] bytess) external returns (address token)
```

### erc721List

```solidity
function erc721List(address ERC721address) external returns (address)
```

### erc20List

```solidity
function erc20List(address erc20dt) external view returns (bool)
```

### NftCreateData

```solidity
struct NftCreateData {
  string name;
  string symbol;
  uint256 templateIndex;
  string tokenURI;
  bool transferable;
  address owner;
}
```

### ErcCreateData

```solidity
struct ErcCreateData {
  uint256 templateIndex;
  string[] strings;
  address[] addresses;
  uint256[] uints;
  bytes[] bytess;
}
```

### PoolData

```solidity
struct PoolData {
  uint256[] ssParams;
  uint256[] swapFees;
  address[] addresses;
}
```

### FixedData

```solidity
struct FixedData {
  address fixedPriceAddress;
  address[] addresses;
  uint256[] uints;
}
```

### DispenserData

```solidity
struct DispenserData {
  address dispenserAddress;
  uint256 maxTokens;
  uint256 maxBalance;
  bool withMint;
  address allowedSwapper;
}
```

### createNftWithErc20

```solidity
function createNftWithErc20(struct IFactory.NftCreateData _NftCreateData, struct IFactory.ErcCreateData _ErcCreateData) external returns (address, address)
```

### createNftWithErc20WithPool

```solidity
function createNftWithErc20WithPool(struct IFactory.NftCreateData _NftCreateData, struct IFactory.ErcCreateData _ErcCreateData, struct IFactory.PoolData _PoolData) external returns (address, address, address)
```

### createNftWithErc20WithFixedRate

```solidity
function createNftWithErc20WithFixedRate(struct IFactory.NftCreateData _NftCreateData, struct IFactory.ErcCreateData _ErcCreateData, struct IFactory.FixedData _FixedData) external returns (address, address, bytes32)
```

### createNftWithErc20WithDispenser

```solidity
function createNftWithErc20WithDispenser(struct IFactory.NftCreateData _NftCreateData, struct IFactory.ErcCreateData _ErcCreateData, struct IFactory.DispenserData _DispenserData) external returns (address, address)
```

