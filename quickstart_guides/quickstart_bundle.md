# 🦑 Collection of bundle functions:

## All helper functions can be found in [ERC721Factory.sol](https://github.com/oceanprotocol/contracts/blob/v4main_postaudit/contracts/ERC721Factory.sol)

 
### createNftWithErc20

#### Deploys a new NFT Contract, then a new ERC20 datatoken

```Javascript
     /**
     * @dev createNftWithErc20
     *      Creates a new NFT, then a ERC20,all in one call
     * @param _NftCreateData input data for nft creation
     * @param _ErcCreateData input data for erc20 creation
     
     */
    function createNftWithErc20(
        NftCreateData calldata _NftCreateData,
        ErcCreateData calldata _ErcCreateData
    ) external nonReentrant returns (address erc721Address, address erc20Address)
   
```




### createNftWithErc20WithPool

#### Deploys a new NFT Contract, then a new ERC20 datatoken and a pool with SideStaking and Vesting contract

#### Requires basetoken approval before

```Javascript
   /**
     * @dev createNftWithErc20WithPool
     *      Creates a new NFT, then a ERC20, then a Pool, all in one call
     *      Use this carefully, because if Pool creation fails, you are still going to pay a lot of gas
     * @param _NftCreateData input data for NFT Creation
     * @param _ErcCreateData input data for ERC20 Creation
     * @param _PoolData input data for Pool Creation
     */
    function createNftWithErc20WithPool(
        NftCreateData calldata _NftCreateData,
        ErcCreateData calldata _ErcCreateData,
        PoolData calldata _PoolData
    ) external returns (address erc721Address, address erc20Address, address poolAddress)

```

### createNftWithErc20WithFixedRate

#### Deploys a new NFT Contract, then a new ERC20 datatoken and a Fixed Rate Exchange


```Javascript
     /**
     * @dev createNftWithErc20WithFixedRate
     *      Creates a new NFT, then a ERC20, then a FixedRateExchange, all in one call
     *      Use this carefully, because if Fixed Rate creation fails, you are still going to pay a lot of gas
     * @param _NftCreateData input data for NFT Creation
     * @param _ErcCreateData input data for ERC20 Creation
     * @param _FixedData input data for FixedRate Creation
     */
    function createNftWithErc20WithFixedRate(
        NftCreateData calldata _NftCreateData,
        ErcCreateData calldata _ErcCreateData,
        FixedData calldata _FixedData
    ) external returns (address erc721Address, address erc20Address, bytes32 exchangeId)
```


### startMultipleTokenOrder

#### Allow to start multiple token orders in 1 call.

#### Requires several approvals depending on the orders

```Javascript
     /**
     * @dev startMultipleTokenOrder
     *      Used as a proxy to order multiple services
     *      Users can have inifinite approvals for fees for factory instead of having one approval/ erc20 contract
     *      Requires previous approval of all :
     *          - consumeFeeTokens
     *          - publishMarketFeeTokens
     *          - erc20 datatokens
     *          - providerFees
     * @param orders an array of struct tokenOrder
     */
    function startMultipleTokenOrder(
        tokenOrder[] memory orders
    ) external 
    
```









  
