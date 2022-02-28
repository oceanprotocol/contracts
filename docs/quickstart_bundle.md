# 🦑 Collection of bundle functions:

## All helper functions can be found in [ERC721Factory.sol](https://github.com/oceanprotocol/contracts/blob/v4main_postaudit/contracts/ERC721Factory.sol).

 
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
    ) external nonReentrant returns (address erc721Address, address erc20Address){
        //we are adding ourselfs as a ERC20 Deployer, because we need it in order to deploy the pool
        erc721Address = deployERC721Contract(
            _NftCreateData.name,
            _NftCreateData.symbol,
            _NftCreateData.templateIndex,
            address(this),
            address(0),
            _NftCreateData.tokenURI);
        erc20Address = IERC721Template(erc721Address).createERC20(
            _ErcCreateData.templateIndex,
            _ErcCreateData.strings,
            _ErcCreateData.addresses,
            _ErcCreateData.uints,
            _ErcCreateData.bytess
        );
        // remove our selfs from the erc20DeployerRole
        IERC721Template(erc721Address).removeFromCreateERC20List(address(this));
    }
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
    ) external nonReentrant returns (address erc721Address, address erc20Address, address poolAddress){
        _pullUnderlying(_PoolData.addresses[1],msg.sender,
                    address(this),
                    _PoolData.ssParams[4]);
        //we are adding ourselfs as a ERC20 Deployer, because we need it in order to deploy the pool
        erc721Address = deployERC721Contract(
            _NftCreateData.name,
            _NftCreateData.symbol,
            _NftCreateData.templateIndex,
            address(this),
            address(0),
             _NftCreateData.tokenURI);
        erc20Address = IERC721Template(erc721Address).createERC20(
            _ErcCreateData.templateIndex,
            _ErcCreateData.strings,
            _ErcCreateData.addresses,
            _ErcCreateData.uints,
            _ErcCreateData.bytess
        );
        // allow router to take the liquidity
        IERC20(_PoolData.addresses[1]).safeIncreaseAllowance(router,_PoolData.ssParams[4]);
      
        poolAddress = IERC20Template(erc20Address).deployPool(
            _PoolData.ssParams,
            _PoolData.swapFees,
           _PoolData.addresses
        );
        // remove our selfs from the erc20DeployerRole
        IERC721Template(erc721Address).removeFromCreateERC20List(address(this));
    
    }

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
    ) external nonReentrant returns (address erc721Address, address erc20Address, bytes32 exchangeId){
        //we are adding ourselfs as a ERC20 Deployer, because we need it in order to deploy the fixedrate
        erc721Address = deployERC721Contract(
            _NftCreateData.name,
            _NftCreateData.symbol,
            _NftCreateData.templateIndex,
            address(this),
            address(0),
             _NftCreateData.tokenURI);
        erc20Address = IERC721Template(erc721Address).createERC20(
            _ErcCreateData.templateIndex,
            _ErcCreateData.strings,
            _ErcCreateData.addresses,
            _ErcCreateData.uints,
            _ErcCreateData.bytess
        );
        exchangeId = IERC20Template(erc20Address).createFixedRate(
            _FixedData.fixedPriceAddress,
            _FixedData.addresses,
            _FixedData.uints
            );
        // remove our selfs from the erc20DeployerRole
        IERC721Template(erc721Address).removeFromCreateERC20List(address(this));
    }
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
    ) external nonReentrant {
        // TODO: to avoid DOS attack, we set a limit to maximum order (50 ?)
        require(orders.length <= 50, 'ERC721Factory: Too Many Orders');
        // TO DO.  We can do better here , by groupping publishMarketFeeTokens and consumeFeeTokens and have a single 
        // transfer for each one, instead of doing it per dt..
        for (uint256 i = 0; i < orders.length; i++) {
            (address publishMarketFeeAddress, address publishMarketFeeToken, uint256 publishMarketFeeAmount) 
                = IERC20Template(orders[i].tokenAddress).getPublishingMarketFee();
            
            // check if we have publishFees, if so transfer them to us and approve dttemplate to take them
            if (publishMarketFeeAmount > 0 && publishMarketFeeToken!=address(0) 
            && publishMarketFeeAddress!=address(0)) {
                _pullUnderlying(publishMarketFeeToken,msg.sender,
                    address(this),
                    publishMarketFeeAmount);
                IERC20(publishMarketFeeToken).safeIncreaseAllowance(orders[i].tokenAddress, publishMarketFeeAmount);
            }
            // check if we have consumeMarketFee, if so transfer them to us and approve dttemplate to take them
            if (orders[i]._consumeMarketFee.consumeMarketFeeAmount > 0
            && orders[i]._consumeMarketFee.consumeMarketFeeAddress!=address(0) 
            && orders[i]._consumeMarketFee.consumeMarketFeeToken!=address(0)) {
                _pullUnderlying(orders[i]._consumeMarketFee.consumeMarketFeeToken,msg.sender,
                    address(this),
                    orders[i]._consumeMarketFee.consumeMarketFeeAmount);
                IERC20(orders[i]._consumeMarketFee.consumeMarketFeeToken)
                .safeIncreaseAllowance(orders[i].tokenAddress, orders[i]._consumeMarketFee.consumeMarketFeeAmount);
            }
            // handle provider fees
            if (orders[i]._providerFee.providerFeeAmount > 0 && orders[i]._providerFee.providerFeeToken!=address(0) 
            && orders[i]._providerFee.providerFeeAddress!=address(0)) {
                _pullUnderlying(orders[i]._providerFee.providerFeeToken,msg.sender,
                    address(this),
                    orders[i]._providerFee.providerFeeAmount);
                IERC20(orders[i]._providerFee.providerFeeToken)
                .safeIncreaseAllowance(orders[i].tokenAddress, orders[i]._providerFee.providerFeeAmount);
            }
            // transfer erc20 datatoken from consumer to us
            _pullUnderlying(orders[i].tokenAddress,msg.sender,
                    address(this),
                    1e18);
            IERC20Template(orders[i].tokenAddress).startOrder(
                orders[i].consumer,
                orders[i].serviceIndex,
                orders[i]._providerFee,
                orders[i]._consumeMarketFee
            );
        }
    }
    }
```









  
