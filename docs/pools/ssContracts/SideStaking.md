# Solidity API

## SideStaking

_SideStaking is a contract that monitors stakings in pools, 
        adding or removing dt when only baseToken liquidity is added or removed
     Called by the pool contract
     Every ss newDatatokenCreated function has a ssParams array, 
        which for this contract has the following structure: 
                    [0]  = rate (wei)
                    [1]  = baseToken decimals
                    [2]  = vesting amount (wei)
                    [3]  = vested blocks
                    [4]  = initial liquidity in baseToken for pool creation_

### router

```solidity
address router
```

### VestingCreated

```solidity
event VestingCreated(address datatokenAddress, address publisherAddress, uint256 vestingEndBlock, uint256 totalVestingAmount)
```

### Vesting

```solidity
event Vesting(address datatokenAddress, address publisherAddress, address caller, uint256 amountVested)
```

### Record

```solidity
struct Record {
  bool bound;
  address baseTokenAddress;
  address poolAddress;
  bool poolFinalized;
  uint256 datatokenBalance;
  uint256 datatokenCap;
  uint256 baseTokenBalance;
  uint256 lastPrice;
  uint256 rate;
  address publisherAddress;
  uint256 blockDeployed;
  uint256 vestingEndBlock;
  uint256 vestingAmount;
  uint256 vestingLastBlock;
  uint256 vestingAmountSoFar;
}
```

### onlyRouter

```solidity
modifier onlyRouter()
```

### onlyOwner

```solidity
modifier onlyOwner(address datatoken)
```

### constructor

```solidity
constructor(address _router) public
```

_constructor
     Called on contract deployment._

### getId

```solidity
function getId() public pure returns (uint8)
```

_getId
     Return template id in case we need different ABIs.
     If you construct your own template, please make sure to change the hardcoded value_

### newDatatokenCreated

```solidity
function newDatatokenCreated(address datatokenAddress, address baseTokenAddress, address poolAddress, address publisherAddress, uint256[] ssParams) external returns (bool)
```

_newDatatokenCreated
     Called when new Datatoken is deployed by the DatatokenFactory_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |
| baseTokenAddress | address | - |
| poolAddress | address | - poolAddress |
| publisherAddress | address | - publisherAddress |
| ssParams | uint256[] | - ss Params, see below |

### getDatatokenCirculatingSupply

```solidity
function getDatatokenCirculatingSupply(address datatokenAddress) external view returns (uint256)
```

Returns  (total vesting amount + token released from the contract when adding liquidity)

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |

### getDatatokenCurrentCirculatingSupply

```solidity
function getDatatokenCurrentCirculatingSupply(address datatokenAddress) external view returns (uint256)
```

Returns actual dts in circulation (vested token withdrawn from the contract +
         token released from the contract when adding liquidity)

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |

### getPublisherAddress

```solidity
function getPublisherAddress(address datatokenAddress) external view returns (address)
```

Returns publisher address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |

### getBaseTokenAddress

```solidity
function getBaseTokenAddress(address datatokenAddress) external view returns (address)
```

Returns baseToken address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |

### getPoolAddress

```solidity
function getPoolAddress(address datatokenAddress) external view returns (address)
```

Returns pool address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |

### getBaseTokenBalance

```solidity
function getBaseTokenBalance(address datatokenAddress) external view returns (uint256)
```

Returns baseToken balance in the contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |

### getDatatokenBalance

```solidity
function getDatatokenBalance(address datatokenAddress) external view returns (uint256)
```

Returns datatoken balance in the contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |

### getvestingEndBlock

```solidity
function getvestingEndBlock(address datatokenAddress) external view returns (uint256)
```

Returns last vesting block

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |

### getvestingAmount

```solidity
function getvestingAmount(address datatokenAddress) public view returns (uint256)
```

Returns total vesting amount

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |

### getvestingLastBlock

```solidity
function getvestingLastBlock(address datatokenAddress) external view returns (uint256)
```

Returns last block when some vesting tokens were collected

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |

### getvestingAmountSoFar

```solidity
function getvestingAmountSoFar(address datatokenAddress) public view returns (uint256)
```

Returns amount of vested tokens that have been withdrawn from the contract so far

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |

### canStake

```solidity
function canStake(address datatokenAddress, uint256 amount) public view returns (bool)
```

### Stake

```solidity
function Stake(address datatokenAddress, uint256 amount) external
```

### canUnStake

```solidity
function canUnStake(address datatokenAddress, uint256 lptIn) public view returns (bool)
```

### UnStake

```solidity
function UnStake(address datatokenAddress, uint256 dtAmountIn, uint256 poolAmountOut) external
```

### _notifyFinalize

```solidity
function _notifyFinalize(address datatokenAddress, uint256 decimals) internal
```

### getAvailableVesting

```solidity
function getAvailableVesting(address) public pure returns (uint256)
```

Get available vesting now
param datatokenAddress - datatokenAddress

### getVesting

```solidity
function getVesting(address datatokenAddress) external
```

Send available vested tokens to the publisher address, can be called by anyone

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |

### setPoolSwapFee

```solidity
function setPoolSwapFee(address datatokenAddress, address poolAddress, uint256 swapFee) external
```

Change pool fee

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| datatokenAddress | address | - datatokenAddress |
| poolAddress | address | - poolAddress |
| swapFee | uint256 | - new fee |

