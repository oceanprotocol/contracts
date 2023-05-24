# 🦑 Collection of useful functions:

## [ERC721Factory.sol](https://github.com/oceanprotocol/contracts/blob/v4main_postaudit/contracts/ERC721Factory.sol)

### deployERC721Contract.

#### deploys a new NFT Contract, for now there's only 1 template, \_templateIndex = 1

```Javascript
   /**
     * @dev deployERC721Contract
     *
     * @param name NFT name
     * @param symbol NFT Symbol
     * @param _templateIndex template index we want to use
     * @param additionalERC20Deployer if != address(0), we will add it with ERC20Deployer role
     * @param additionalMetaDataUpdater if != address(0), we will add it with updateMetadata role
     * @param tokenURI tokenURI for NFT metadata
     */

    function deployERC721Contract(
        string memory name,
        string memory symbol,
        uint256 _templateIndex,
        address additionalERC20Deployer,
        address additionalMetaDataUpdater,
        string memory tokenURI
    ) public returns (address token)
```



## [ERC721Template.sol](https://github.com/oceanprotocol/contracts/blob/v4main_postaudit/contracts/templates/ERC721Template.sol)

### createERC20

#### deploys a new ERC20 Contract, templateIndex = 1 for Standard Template, templateIndex = 2 for Enterprise template

```Javascript
   /**
     * @dev createERC20
     *        ONLY user with deployERC20 permission (assigned by Manager) can call it
             Creates a new ERC20 datatoken.
            It also adds initial minting and fee management permissions to custom users.

     * @param _templateIndex ERC20Template index 
     * @param strings refers to an array of strings
     *                      [0] = name
     *                      [1] = symbol
     * @param addresses refers to an array of addresses
     *                     [0]  = minter account who can mint datatokens (can have multiple minters)
     *                     [1]  = feeManager initial feeManager for this DT
     *                     [2]  = publishing Market Address
     *                     [3]  = publishing Market Fee Token
     * @param uints  refers to an array of uints
     *                     [0] = cap_ the total ERC20 cap
     *                     [1] = publishing Market Fee Amount
     * @param bytess  refers to an array of bytes
     *                     Currently not used, useful for future templates
     
     @return ERC20 token address
     */

    function createERC20(
        uint256 _templateIndex,
        string[] calldata strings,
        address[] calldata addresses,
        uint256[] calldata uints,
        bytes[] calldata bytess
    ) external nonReentrant returns (address)
```

### setMetaData

#### sets MetaData for Aquarius

```Javascript
   /**
     * @dev setMetaData
     *
             Creates or update Metadata for Aqua(emit event)
             Also, updates the METADATA_DECRYPTOR key
     * @param _metaDataState metadata state
     * @param _metaDataDecryptorUrl decryptor URL
     * @param _metaDataDecryptorAddress decryptor public key
     * @param flags flags used by Aquarius
     * @param data data used by Aquarius
     * @param _metaDataHash hash of clear data (before the encryption, if any)
     * @param _metadataProofs optional signatures of entitys who validated data (before the encryption, if any)
     */
    function setMetaData(
        uint8 _metaDataState, 
        string calldata _metaDataDecryptorUrl,
        string calldata _metaDataDecryptorAddress, 
        bytes calldata flags,
        bytes calldata data,
        bytes32 _metaDataHash, 
        metaDataProof[] memory _metadataProofs) external
```



## [ERC20Template.sol](https://github.com/oceanprotocol/contracts/blob/v4main_postaudit/contracts/templates/ERC20Template.sol)

### deployPool

#### creates a new pool with combined a Vesting and Staking Contract.

#### This function has many parameters because does many things in once:

- creates a Pool with Staking Contract
- separate a Vesting amount for publisher
- adds initial liquidity

#### Requires basetoken approval before

NOTE:
ssParams[5] in order:

- initial rate in Wei
- basetoken Decimals
- vesting amount in Wei, max 10% of total cap
- vesting blocks
- initial liquidity we want to provide in basetoken (will stake DTs proportionally to the rate provided, pool weight 50-50) 

swapFees[2] in order:

- swapFee (fee for Liquidity provider)
- swapMarketFee (fee for marketplace)

addresses[5] in order:
- side staking contract address
- baseToken address for pool creation(OCEAN or other)
- baseTokenSender user which will provide the baseToken amount for initial liquidity
- publisherAddress user which will be assigned the vested amount
- marketFeeCollector address
- pool template address


    
```Javascript
   /**
     * @dev deployPool
     *      Function to deploy new Pool with 1SS. It also has a vesting schedule.
     *     This function can only be called ONCE and ONLY if no token have been minted yet.
     *      Requires baseToken approval
     * @param ssParams params for the ssContract. 
     *                     [0]  = rate (wei)
     *                     [1]  = baseToken decimals
     *                     [2]  = vesting amount (wei)
     *                     [3]  = vested blocks
     *                     [4]  = initial liquidity in baseToken for pool creation
     * @param swapFees swapFees (swapFee, swapMarketFee), swapOceanFee will be set automatically later
     *                     [0] = swapFee for LP Providers
     *                     [1] = swapFee for marketplace runner
      
      .
     * @param addresses refers to an array of addresses passed by user
     *                     [0]  = side staking contract address
     *                     [1]  = baseToken address for pool creation(OCEAN or other)
     *                     [2]  = baseTokenSender user which will provide the baseToken amount for initial liquidity
     *                     [3]  = publisherAddress user which will be assigned the vested amount
     *                     [4]  = marketFeeCollector marketFeeCollector address
                           [5] = poolTemplateAddress
     */

    function deployPool(
        uint256[] memory ssParams,
        uint256[] memory swapFees,
        address[] memory addresses
    ) external onlyERC20Deployer nonReentrant returns (address pool)
```

### createFixedRate

#### creates a new Fixed price exchange.

#### DT approval from owner can be done AFTER exchange creation to initiate the exchange

#### Requires Basetoken approval for buyer

```Javascript
  /**
     * @dev createFixedRate
     *      Creates a new FixedRateExchange setup.
     * @param fixedPriceAddress fixedPriceAddress
     * @param addresses array of addresses [baseToken,owner,marketFeeCollector]
     * @param uints array of uints [baseTokenDecimals,datatokenDecimals, fixedRate, marketFee, withMint]
     * @return exchangeId
     */
    function createFixedRate(
        address fixedPriceAddress,
        address[] memory addresses,
        uint256[] memory uints
    ) external onlyERC20Deployer nonReentrant returns (bytes32 exchangeId)
```
