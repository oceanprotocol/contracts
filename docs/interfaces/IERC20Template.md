# Solidity API

## IERC20Template

### RolesERC20

```solidity
struct RolesERC20 {
  bool minter;
  bool feeManager;
}
```

### providerFee

```solidity
struct providerFee {
  address providerFeeAddress;
  address providerFeeToken;
  uint256 providerFeeAmount;
  uint8 v;
  bytes32 r;
  bytes32 s;
  uint256 validUntil;
  bytes providerData;
}
```

### consumeMarketFee

```solidity
struct consumeMarketFee {
  address consumeMarketFeeAddress;
  address consumeMarketFeeToken;
  uint256 consumeMarketFeeAmount;
}
```

### initialize

```solidity
function initialize(string[] strings_, address[] addresses_, address[] factoryAddresses_, uint256[] uints_, bytes[] bytes_) external returns (bool)
```

### name

```solidity
function name() external pure returns (string)
```

### symbol

```solidity
function symbol() external pure returns (string)
```

### decimals

```solidity
function decimals() external pure returns (uint8)
```

### totalSupply

```solidity
function totalSupply() external view returns (uint256)
```

### cap

```solidity
function cap() external view returns (uint256)
```

### balanceOf

```solidity
function balanceOf(address owner) external view returns (uint256)
```

### allowance

```solidity
function allowance(address owner, address spender) external view returns (uint256)
```

### approve

```solidity
function approve(address spender, uint256 value) external returns (bool)
```

### transfer

```solidity
function transfer(address to, uint256 value) external returns (bool)
```

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 value) external returns (bool)
```

### mint

```solidity
function mint(address account, uint256 value) external
```

### isMinter

```solidity
function isMinter(address account) external view returns (bool)
```

### DOMAIN_SEPARATOR

```solidity
function DOMAIN_SEPARATOR() external view returns (bytes32)
```

### PERMIT_TYPEHASH

```solidity
function PERMIT_TYPEHASH() external pure returns (bytes32)
```

### nonces

```solidity
function nonces(address owner) external view returns (uint256)
```

### permissions

```solidity
function permissions(address user) external view returns (struct IERC20Template.RolesERC20)
```

### permit

```solidity
function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external
```

### cleanFrom721

```solidity
function cleanFrom721() external
```

### deployPool

```solidity
function deployPool(uint256[] ssParams, uint256[] swapFees, address[] addresses) external returns (address)
```

### createFixedRate

```solidity
function createFixedRate(address fixedPriceAddress, address[] addresses, uint256[] uints) external returns (bytes32)
```

### createDispenser

```solidity
function createDispenser(address _dispenser, uint256 maxTokens, uint256 maxBalance, bool withMint, address allowedSwapper) external
```

### getPublishingMarketFee

```solidity
function getPublishingMarketFee() external view returns (address, address, uint256)
```

### setPublishingMarketFee

```solidity
function setPublishingMarketFee(address _publishMarketFeeAddress, address _publishMarketFeeToken, uint256 _publishMarketFeeAmount) external
```

### startOrder

```solidity
function startOrder(address consumer, uint256 serviceIndex, struct IERC20Template.providerFee _providerFee, struct IERC20Template.consumeMarketFee _consumeMarketFee) external
```

### reuseOrder

```solidity
function reuseOrder(bytes32 orderTxId, struct IERC20Template.providerFee _providerFee) external
```

### burn

```solidity
function burn(uint256 amount) external
```

### burnFrom

```solidity
function burnFrom(address account, uint256 amount) external
```

### getERC721Address

```solidity
function getERC721Address() external view returns (address)
```

### isERC20Deployer

```solidity
function isERC20Deployer(address user) external view returns (bool)
```

### getPools

```solidity
function getPools() external view returns (address[])
```

### fixedRate

```solidity
struct fixedRate {
  address contractAddress;
  bytes32 id;
}
```

### getFixedRates

```solidity
function getFixedRates() external view returns (struct IERC20Template.fixedRate[])
```

### getDispensers

```solidity
function getDispensers() external view returns (address[])
```

### getId

```solidity
function getId() external pure returns (uint8)
```

### getPaymentCollector

```solidity
function getPaymentCollector() external view returns (address)
```

