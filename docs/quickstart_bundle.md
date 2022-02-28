# 🦑 Collection of bundled functions:

## All helper functions can be found in [ERC721Factory.sol](https://github.com/oceanprotocol/contracts/blob/v4main_postaudit/contracts/ERC721Factory.sol).

 
### createNftWithErc20

#### deploys a new NFT Contract, then a new ERC20 datatoken

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

#### deploys a new NFT Contract, then a new ERC20 datatoken and a pool with SideStaking and Vesting contract

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

#### deploys a new NFT Contract, then a new ERC20 datatoken and a Fixed Rate Exchange


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


### createNftWithErc20WithDispenser

#### deploys a new NFT Contract, then a new ERC20 datatoken and a Dispenser contract.

```Javascript
    /**
     * @dev createNftWithErc20WithDispenser
     *      Creates a new NFT, then a ERC20, then a Dispenser, all in one call
     *      Use this carefully
     * @param _NftCreateData input data for NFT Creation
     * @param _ErcCreateData input data for ERC20 Creation
     * @param _DispenserData input data for Dispenser Creation
     */
    function createNftWithErc20WithDispenser(
        NftCreateData calldata _NftCreateData,
        ErcCreateData calldata _ErcCreateData,
        DispenserData calldata _DispenserData
    ) external nonReentrant returns (address erc721Address, address erc20Address){
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
        IERC20Template(erc20Address).createDispenser(
            _DispenserData.dispenserAddress,
            _DispenserData.maxTokens,
            _DispenserData.maxBalance,
            _DispenserData.withMint,
            _DispenserData.allowedSwapper
            );
        // remove our selfs from the erc20DeployerRole
        IERC721Template(erc721Address).removeFromCreateERC20List(address(this));
    }
```

