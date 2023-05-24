# Solidity API

## FactoryRouter

### routerOwner

```solidity
address routerOwner
```

### factory

```solidity
address factory
```

### fixedRate

```solidity
address fixedRate
```

### minVestingPeriodInBlocks

```solidity
uint256 minVestingPeriodInBlocks
```

### swapOceanFee

```solidity
uint256 swapOceanFee
```

### swapNonOceanFee

```solidity
uint256 swapNonOceanFee
```

### consumeFee

```solidity
uint256 consumeFee
```

### providerFee

```solidity
uint256 providerFee
```

### approvedTokens

```solidity
address[] approvedTokens
```

### ssContracts

```solidity
address[] ssContracts
```

### fixedrates

```solidity
address[] fixedrates
```

### dispensers

```solidity
address[] dispensers
```

### NewPool

```solidity
event NewPool(address poolAddress, bool isOcean)
```

### VestingPeriodChanges

```solidity
event VestingPeriodChanges(address caller, uint256 minVestingPeriodInBlocks)
```

### RouterChanged

```solidity
event RouterChanged(address caller, address newRouter)
```

### FactoryContractChanged

```solidity
event FactoryContractChanged(address caller, address contractAddress)
```

### TokenAdded

```solidity
event TokenAdded(address caller, address token)
```

### TokenRemoved

```solidity
event TokenRemoved(address caller, address token)
```

### SSContractAdded

```solidity
event SSContractAdded(address caller, address contractAddress)
```

### SSContractRemoved

```solidity
event SSContractRemoved(address caller, address contractAddress)
```

### FixedRateContractAdded

```solidity
event FixedRateContractAdded(address caller, address contractAddress)
```

### FixedRateContractRemoved

```solidity
event FixedRateContractRemoved(address caller, address contractAddress)
```

### DispenserContractAdded

```solidity
event DispenserContractAdded(address caller, address contractAddress)
```

### DispenserContractRemoved

```solidity
event DispenserContractRemoved(address caller, address contractAddress)
```

### OPCFeeChanged

```solidity
event OPCFeeChanged(address caller, uint256 newSwapOceanFee, uint256 newSwapNonOceanFee, uint256 newConsumeFee, uint256 newProviderFee)
```

### onlyRouterOwner

```solidity
modifier onlyRouterOwner()
```

### OPCCollectorChanged

```solidity
event OPCCollectorChanged(address caller, address _newOpcCollector)
```

### constructor

```solidity
constructor(address _routerOwner, address _oceanToken, address _bpoolTemplate, address _opcCollector, address[] _preCreatedPools) public
```

### changeRouterOwner

```solidity
function changeRouterOwner(address _routerOwner) external
```

### addApprovedToken

```solidity
function addApprovedToken(address tokenAddress) external
```

_addApprovedToken
     Adds a token to the list of tokens with reduced fees
 @param tokenAddress address Token to be added_

### _addApprovedToken

```solidity
function _addApprovedToken(address tokenAddress) internal
```

### removeApprovedToken

```solidity
function removeApprovedToken(address tokenAddress) external
```

_removeApprovedToken
     Removes a token if exists from the list of tokens with reduced fees
 @param tokenAddress address Token to be removed_

### isApprovedToken

```solidity
function isApprovedToken(address tokenAddress) public view returns (bool)
```

_isApprovedToken
     Returns true if token exists in the list of tokens with reduced fees
 @param tokenAddress address Token to be checked_

### getApprovedTokens

```solidity
function getApprovedTokens() public view returns (address[])
```

_getApprovedTokens
     Returns the list of tokens with reduced fees_

### addSSContract

```solidity
function addSSContract(address _ssContract) external
```

_addSSContract
     Adds a token to the list of ssContracts
 @param _ssContract address Contract to be added_

### removeSSContract

```solidity
function removeSSContract(address _ssContract) external
```

_removeSSContract
     Removes a token if exists from the list of ssContracts
 @param _ssContract address Contract to be removed_

### isSSContract

```solidity
function isSSContract(address _ssContract) public view returns (bool)
```

_isSSContract
     Returns true if token exists in the list of ssContracts
 @param _ssContract  address Contract to be checked_

### getSSContracts

```solidity
function getSSContracts() public view returns (address[])
```

_getSSContracts
     Returns the list of ssContracts_

### addFactory

```solidity
function addFactory(address _factory) external
```

### addFixedRateContract

```solidity
function addFixedRateContract(address _fixedRate) external
```

_addFixedRateContract
     Adds an address to the list of fixed rate contracts
 @param _fixedRate address Contract to be added_

### removeFixedRateContract

```solidity
function removeFixedRateContract(address _fixedRate) external
```

_removeFixedRateContract
     Removes an address from the list of fixed rate contracts
 @param _fixedRate address Contract to be removed_

### isFixedRateContract

```solidity
function isFixedRateContract(address _fixedRate) public view returns (bool)
```

_isFixedRateContract
     Removes true if address exists in the list of fixed rate contracts
 @param _fixedRate address Contract to be checked_

### getFixedRatesContracts

```solidity
function getFixedRatesContracts() public view returns (address[])
```

_getFixedRatesContracts
     Returns the list of fixed rate contracts_

### addDispenserContract

```solidity
function addDispenserContract(address _dispenser) external
```

_addDispenserContract
     Adds an address to the list of dispensers
 @param _dispenser address Contract to be added_

### removeDispenserContract

```solidity
function removeDispenserContract(address _dispenser) external
```

_removeDispenserContract
     Removes an address from the list of dispensers
 @param _dispenser address Contract to be removed_

### isDispenserContract

```solidity
function isDispenserContract(address _dispenser) public view returns (bool)
```

_isDispenserContract
     Returns true if address exists in the list of dispensers
 @param _dispenser  address Contract to be checked_

### getDispensersContracts

```solidity
function getDispensersContracts() public view returns (address[])
```

_getDispensersContracts
     Returns the list of fixed rate contracts_

### getOPCFee

```solidity
function getOPCFee(address baseToken) public view returns (uint256)
```

_getOPCFee
     Gets OP Community Fees for a particular token_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| baseToken | address | address token to be checked |

### getOPCFees

```solidity
function getOPCFees() public view returns (uint256, uint256)
```

_getOPCFees
     Gets OP Community Fees for approved tokens and non approved tokens_

### getOPCConsumeFee

```solidity
function getOPCConsumeFee() public view returns (uint256)
```

_getConsumeFee
     Gets OP Community Fee cuts for consume fees_

### getOPCProviderFee

```solidity
function getOPCProviderFee() public view returns (uint256)
```

_getOPCProviderFee
     Gets OP Community Fee cuts for provider fees_

### updateOPCFee

```solidity
function updateOPCFee(uint256 _newSwapOceanFee, uint256 _newSwapNonOceanFee, uint256 _newConsumeFee, uint256 _newProviderFee) external
```

_updateOPCFee
     Updates OP Community Fees_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newSwapOceanFee | uint256 | Amount charged for swapping with ocean approved tokens |
| _newSwapNonOceanFee | uint256 | Amount charged for swapping with non ocean approved tokens |
| _newConsumeFee | uint256 | Amount charged from consumeFees |
| _newProviderFee | uint256 | Amount charged for providerFees |

### getMinVestingPeriod

```solidity
function getMinVestingPeriod() public view returns (uint256)
```

### updateMinVestingPeriod

```solidity
function updateMinVestingPeriod(uint256 _newPeriod) external
```

### deployPool

```solidity
function deployPool(address[2] tokens, uint256[] ssParams, uint256[] swapFees, address[] addresses) external returns (address)
```

_Deploys a new `OceanPool` on Ocean Friendly Fork modified for 1SS.
     This function cannot be called directly, but ONLY through the ERC20DT contract from a ERC20DEployer role

      ssContract address
     tokens [datatokenAddress, baseTokenAddress]
     publisherAddress user which will be assigned the vested amount._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokens | address[2] | precreated parameter |
| ssParams | uint256[] | params for the ssContract.                      [0]  = rate (wei)                     [1]  = baseToken decimals                     [2]  = vesting amount (wei)                     [3]  = vested blocks                     [4]  = initial liquidity in baseToken for pool creation |
| swapFees | uint256[] | swapFees (swapFee, swapMarketFee), swapOceanFee will be set automatically later                     [0] = swapFee for LP Providers                     [1] = swapFee for marketplace runner              . |
| addresses | address[] | refers to an array of addresses passed by user                     [0]  = side staking contract address                     [1]  = baseToken address for pool creation(OCEAN or other)                     [2]  = baseTokenSender user which will provide the baseToken amount for initial liquidity                     [3]  = publisherAddress user which will be assigned the vested amount                     [4]  = marketFeeCollector marketFeeCollector address                            [5]  = poolTemplateAddress                 @return pool address |

### _getLength

```solidity
function _getLength(contract IERC20[] array) internal pure returns (uint256)
```

### deployFixedRate

```solidity
function deployFixedRate(address fixedPriceAddress, address[] addresses, uint256[] uints) external returns (bytes32 exchangeId)
```

_deployFixedRate
     Creates a new FixedRateExchange setup.
As for deployPool, this function cannot be called directly,
but ONLY through the ERC20DT contract from a ERC20DEployer role_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| fixedPriceAddress | address | fixedPriceAddress |
| addresses | address[] | array of addresses [baseToken,owner,marketFeeCollector] |
| uints | uint256[] | array of uints [baseTokenDecimals,datatokenDecimals, fixedRate, marketFee, withMint]        @return exchangeId |

### deployDispenser

```solidity
function deployDispenser(address _dispenser, address datatoken, uint256 maxTokens, uint256 maxBalance, address owner, address allowedSwapper) external
```

_deployDispenser
     Activates a new Dispenser
As for deployPool, this function cannot be called directly,
but ONLY through the ERC20DT contract from a ERC20DEployer role_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _dispenser | address | dispenser contract address |
| datatoken | address | refers to datatoken address. |
| maxTokens | uint256 | - max tokens to dispense |
| maxBalance | uint256 | - max balance of requester. |
| owner | address | - owner |
| allowedSwapper | address | - if !=0, only this address can request DTs |

### addPoolTemplate

```solidity
function addPoolTemplate(address poolTemplate) external
```

_addPoolTemplate
     Adds an address to the list of pools templates
 @param poolTemplate address Contract to be added_

### removePoolTemplate

```solidity
function removePoolTemplate(address poolTemplate) external
```

_removePoolTemplate
     Removes an address from the list of pool templates
 @param poolTemplate address Contract to be removed_

### buyDTBatch

```solidity
function buyDTBatch(struct IFactoryRouter.Operations[] _operations) external
```

### stakeBatch

```solidity
function stakeBatch(struct IFactoryRouter.Stakes[] _stakes) external
```

### _pullUnderlying

```solidity
function _pullUnderlying(address erc20, address from, address to, uint256 amount) internal
```

### getPoolTemplates

```solidity
function getPoolTemplates() public view returns (address[])
```

### isPoolTemplate

```solidity
function isPoolTemplate(address poolTemplate) public view returns (bool)
```

### updateOPCCollector

```solidity
function updateOPCCollector(address _opcCollector) external
```

### getOPCCollector

```solidity
function getOPCCollector() public view returns (address)
```

