# 🦑 Collection of useful funtions:

## ERC721Factory.sol

### deployERC721Contract.   deploys a new NFT Contract, for now there's only 1 template, _templateIndex = 1

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

### createERC20.   deploys a new ERC20 Contract, for now there's only 1 template, templateIndex = 1

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
    * @param feeManager feeManager address to be set as initial feeManager (can set who gets the DT consumed)
     
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