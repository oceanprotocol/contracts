# 🦑 Collection of useful functions:

## ERC721Factory.sol

### deployERC721Contract.   
#### deploys a new NFT Contract, for now there's only 1 template, _templateIndex = 1

```Javascript
  /**
     * @dev deployERC721Contract
     *      
     * @param name NFT name
     * @param symbol NFT Symbol
     * @param _data data used by Aquarius
     * @param _flags flags used by Aquarius
     * @param _templateIndex template index we want to use
     */

    function deployERC721Contract(
        string memory name,
        string memory symbol,
        bytes memory _data,
        bytes memory _flags,
        uint256 _templateIndex
    ) public returns (address token)
```

## ERC721Template.sol

### createERC20
#### deploys a new ERC20 Contract, for now there's only 1 template, templateIndex = 1

```Javascript
  /**
     * @dev createERC20
     *        ONLY user with deployERC20 permission (assigned by Manager) can call it
             Creates a new ERC20 datatoken.
            It also adds initial minting and fee management permissions to custom users.

    * @param name_ token name
    * @param symbol_ token symbol
    * @param cap the maximum total supply
    * @param templateIndex template index to deploy
    * @param minter minter address to be set as initial minter 
    * @param feeManager feeManager address to be set as initial feeManager (who can set who gets the DTs consumed)
     
     @return ERC20 token address
     */

    function createERC20(
        string calldata name_,
        string calldata symbol_,
        uint256 cap,
        uint256 templateIndex,
        address minter,
        address feeManager
    ) external returns (address)
```

### updateMetadata   
#### updates metadata both for Aqua and the store

```Javascript
   /**
     * @dev updateMetadata
     *        ONLY user with updateMetadata permission (assigned by Manager) can call it
             Updates Metadata for Aqua(emit event on the Metadata contract)
             It also updates the same data argument into the ERC725 standard (key-value store).
             The key is prefixed at METADATA_KEY = keccak256("METADATA_KEY");
     * @param flags flags used by Aquarius
     * @param data data used by Aquarius
    
     
     */

    function updateMetadata(bytes calldata flags, bytes calldata data)
        external
```

### wrapV3DT   
#### used for V3 DT integration. 

```Javascript
       /**
     * @dev wrapV3DT
            Requires to call proposeMinter BEFORE on the v3DT, the proposed minter MUST be the NFT contract address
     *      Only NFT Owner can call this function.
     *      This function 'wraps' any v3 datatoken, NFTOwner has to be the actual minter(v3) 
            After wrapping, the minter() in the v3 datatoken is going to be this contract. To mint new tokens we now need to use mintV3DT
     * @param datatoken datatoken address we want to wrap
     * @param newMinter new minter address after wrapping
     */

    function wrapV3DT(address datatoken, address newMinter)
        external
        onlyNFTOwner
```


## ERC20Template.sol

### deployPool
#### creates a new pool with combined a Vesting and Staking Contract.
#### This function has many parameters because does many things in once:
- creates a Pool with Staking Contract
- separate a Vesting amount for publisher
- adds initial liquidity 

#### Requires basetoken approval before

NOTE: 
ssParams[5] in order:
- initial rate converted to Wei
- basetokenDecimals
- vesting amount in Wei, max 10% of total cap
- vesting blocks
- initial liquidity we want to provide in basetoken (will stake DTs proportionally to the rate provided, pool weight 50-50)   [

swapFees[2] in order:
- swapFee (fee for Liquidity provider)
- swapMarketFee (fee for marketplace)


```Javascript
    /**
     * @dev deployPool
     *      Function to deploy new Pool with 1SS. It also has a vesting schedule.
            This function can only be called ONCE and ONLY if no token have been minted yet.
     * @param controller ssContract address
     * @param basetokenAddress basetoken for pool (OCEAN or other)
     * @param ssParams params for the ssContract. 
     * @param basetokenSender user which will provide the basetoken amount for initial liquidity 
     * @param swapFees swapFees (swapFee, swapMarketFee), swapOceanFee will be set automatically later
       @param marketFeeCollector marketFeeCollector address
       @param publisherAddress user which will be assigned the vested amount.
     */

    function deployPool(
        address controller,
        address basetokenAddress,
        uint256[] memory ssParams,
        address basetokenSender,
        uint256[2] memory swapFees,
        address marketFeeCollector,
        address publisherAddress
    ) external onlyERC20Deployer 
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
     * @param basetokenAddress basetoken for exchange (OCEAN or other)
     * @param basetokenDecimals basetoken decimals
     * @param fixedRate rate
     * @param owner exchangeOwner
       @param marketFee market Fee 
       @param marketFeeCollector market fee collector address

       @return exchangeId
     */

    function createFixedRate(
        address fixedPriceAddress,
        address basetokenAddress,
        uint8 basetokenDecimals,
        uint256 fixedRate,
        address owner,
        uint256 marketFee,
        address marketFeeCollector
    ) external onlyERC20Deployer returns (bytes32 exchangeId)
```