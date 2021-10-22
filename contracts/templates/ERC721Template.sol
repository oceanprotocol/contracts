pragma solidity >=0.6.0;

import "../utils/ERC721/ERC721.sol";
import "../utils/ERC725/ERC725Ocean.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "../interfaces/IV3ERC20.sol";
import "../interfaces/IFactory.sol";
import "../interfaces/IERC20Template.sol";
import "../utils/ERC721RolesAddress.sol";


contract ERC721Template is
    ERC721("Template", "TemplateSymbol"),
    ERC721RolesAddress,
    ERC725Ocean
{
    
    string private _name;
    string private _symbol;
    //uint256 private tokenId = 1;
    bool private initialized;
    bool public hasMetaData;
    string public metaDataDecryptorUrl;
    string public metaDataDecryptorAddress;
    uint8 public metaDataState;
    address private _tokenFactory;
    address[] private deployedERC20List;
    address public ssContract;

    mapping(address => bool) private deployedERC20;

    //stored here only for ABI reasons
    event TokenCreated(
        address indexed newTokenAddress,
        address indexed templateAddress,
        string indexed tokenName
    );
    event MetadataCreated(
        address indexed createdBy,
        uint8 state,
        string decryptorUrl,
        bytes flags,
        bytes data,
        bytes metaDataHash,
        uint256 timestamp,
        uint256 blockNumber
    );
    event MetadataUpdated(
        address indexed updatedBy,
        uint8 state,
        string decryptorUrl,
        bytes flags,
        bytes data,
        bytes metaDataHash,
        uint256 timestamp,
        uint256 blockNumber
    );
    modifier onlyNFTOwner() {
        require(msg.sender == ownerOf(1), "ERC721Template: not NFTOwner");
        _;
    }

    /**
     * @dev initialize
     *      Calls private _initialize function. Only if contract is not initialized.
            This function mints an NFT (tokenId=1) to the owner and add owner as Manager Role
     * @param owner NFT Owner
     * @param name_ NFT name
     * @param symbol_ NFT Symbol
     * @param tokenFactory NFT factory address
     
     @return boolean
     */

    function initialize(
        address owner,
        string calldata name_,
        string calldata symbol_,
        address tokenFactory,
        address additionalERC20Deployer,
        string memory baseURI
    ) external returns (bool) {
        require(
            !initialized,
            "ERC721Template: token instance already initialized"
        );
        bool initResult = 
            _initialize(
                owner,
                name_,
                symbol_,
                tokenFactory,
                baseURI
            );
        if(initResult && additionalERC20Deployer != address(0))
            _addToCreateERC20List(additionalERC20Deployer);
        return(initResult);
    }

    /**
     * @dev _initialize
     *      Calls private _initialize function. Only if contract is not initialized.
     *       This function mints an NFT (tokenId=1) to the owner
     *       and add owner as Manager Role (Roles admin)
     * @param owner NFT Owner
     * @param name_ NFT name
     * @param symbol_ NFT Symbol
     * @param tokenFactory NFT factory address
     
     @return boolean
     */

    function _initialize(
        address owner,
        string memory name_,
        string memory symbol_,
        address tokenFactory,
        string memory baseURI
    ) internal returns (bool) {
        require(
            owner != address(0),
            "ERC721Template:: Invalid minter,  zero address"
        );
        
        _name = name_;
        _symbol = symbol_;
        _tokenFactory = tokenFactory;
        defaultBaseURI = baseURI;
        initialized = true;
        _safeMint(owner, 1);
        _addManager(owner);

        // we add the nft owner to all other roles (so that doesn't need to make multiple transactions)
        Roles storage user = permissions[owner];
        user.updateMetadata = true;
        user.deployERC20 = true;
        user.store = true;
        // no need to push to auth since it has been already added in _addManager()
        return initialized;
    }

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
     */
    function setMetaData(uint8 _metaDataState, string calldata _metaDataDecryptorUrl
        , string calldata _metaDataDecryptorAddress, bytes calldata flags, 
        bytes calldata data,bytes calldata _metaDataHash) external {
        require(
            permissions[msg.sender].updateMetadata == true,
            "ERC721Template: NOT METADATA_ROLE"
        );
        metaDataState = _metaDataState;
        metaDataDecryptorUrl = _metaDataDecryptorUrl;
        metaDataDecryptorAddress = _metaDataDecryptorAddress;
        if(hasMetaData == false){
            emit MetadataCreated(msg.sender, _metaDataState, _metaDataDecryptorUrl,
            flags, data, _metaDataHash, 
            /* solium-disable-next-line */
            block.timestamp,
            block.number);
            hasMetaData = true;
        }
        else
            emit MetadataUpdated(msg.sender, metaDataState, _metaDataDecryptorUrl,
            flags, data, _metaDataHash,
            /* solium-disable-next-line */
            block.timestamp,
            block.number);
    }

    /**
     * @dev getMetaData
     *      Returns metaDataState, metaDataDecryptorUrl, metaDataDecryptorAddress
     */
    function getMetaData() external view returns (string memory, string memory, uint8, bool){
        return (metaDataDecryptorUrl, metaDataDecryptorAddress, metaDataState, hasMetaData);
    } 


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
     *                     Currently not used, usefull for future templates
     
     @return ERC20 token address
     */

    function createERC20(
        uint256 _templateIndex,
        string[] calldata strings,
        address[] calldata addresses,
        uint256[] calldata uints,
        bytes[] calldata bytess
    ) external returns (address ) {
        require(
            permissions[msg.sender].deployERC20 == true,
            "ERC721Template: NOT ERC20DEPLOYER_ROLE"
        );

        address token = IFactory(_tokenFactory).createToken(
            _templateIndex,
            strings,
            addresses,
            uints,
            bytess
        );

        deployedERC20[token] = true;

        deployedERC20List.push(token);
        return token;
    }

    /**
     * @dev isERC20Deployer
     * @return true if the account has ERC20 Deploy role
     */
    function isERC20Deployer(address account) public view returns (bool) {
        return permissions[account].deployERC20;
    }
    
    /**
     * @dev name
     *      It returns the token name.
     * @return DataToken name.
     */
    function name() public view override returns (string memory) {
        return _name;
    }

    /**
     * @dev symbol
     *      It returns the token symbol.
     * @return DataToken symbol.
     */
    function symbol() public view override returns (string memory) {
        return _symbol;
    }

      /**
     * @dev isInitialized
     *      It checks whether the contract is initialized.
     * @return true if the contract is initialized.
     */

    function isInitialized() public view returns (bool) {
        return initialized;
    }

    /**
     * @dev addManager
     *      Only NFT Owner can add a new manager (Roles admin)
     *      There can be multiple minters
     * @param _managerAddress new manager address
     */

    function addManager(address _managerAddress) external onlyNFTOwner {
        _addManager(_managerAddress);
    }

    /**
     * @dev removeManager
     *      Only NFT Owner can remove a manager (Roles admin)
     *      There can be multiple minters
     * @param _managerAddress new manager address
     */


    function removeManager(address _managerAddress) external onlyNFTOwner {
        _removeManager(_managerAddress);
    }

     /**
     * @notice Executes any other smart contract. 
                Is only callable by the Manager.
     *
     *
     * @param _operation the operation to execute: CALL = 0; DELEGATECALL = 1; CREATE2 = 2; CREATE = 3;
     * @param _to the smart contract or address to interact with. 
     *          `_to` will be unused if a contract is created (operation 2 and 3)
     * @param _value the value of ETH to transfer
     * @param _data the call data, or the contract data to deploy
    **/

    function executeCall(
        uint256 _operation,
        address _to,
        uint256 _value,
        bytes calldata _data
    ) external payable onlyManager {
        execute(_operation, _to, _value, _data);
    }


      /**
     * @dev setNewData
     *       ONLY user with store permission (assigned by Manager) can call it
            This function allows to set any arbitrary key-value into the 725 standard
     *      There can be multiple store updaters
     * @param _key key (see 725 for standard (keccak256)) 
        Data keys, should be the keccak256 hash of a type name.
        e.g. keccak256('ERCXXXMyNewKeyType') is 0x6935a24ea384927f250ee0b954ed498cd9203fc5d2bf95c735e52e6ca675e047

     * @param _value data to store at that key
     */


    function setNewData(bytes32 _key, bytes calldata _value) external {
        require(
            permissions[msg.sender].store == true,
            "ERC721Template: NOT STORE UPDATER"
        );
        setData(_key, _value);
    }

       /**
     * @dev setDataERC20
     *      ONLY callable FROM the ERC20Template and BY the corresponding ERC20Deployer
            This function allows to store data with a preset key (keccak256(ERC20Address)) into NFT 725 Store
     * @param _key keccak256(ERC20Address) see setData into ERC20Template.sol
     * @param _value data to store at that key
     */


    function setDataERC20(bytes32 _key, bytes calldata _value) public {
        require(
            deployedERC20[msg.sender] == true,
            "ERC721Template: NOT ERC20 Contract"
        );
        setData(_key, _value);
    }


    /**
     * @dev cleanPermissions
     *      Only NFT Owner  can call it.
     *      This function allows to remove all ROLES at erc721 level: 
     *              Managers, ERC20Deployer, MetadataUpdater, StoreUpdater
     *      Permissions at erc20 level stay.
     *       Even NFT Owner has to readd himself as Manager
     */
    
    function cleanPermissions() external onlyNFTOwner {
        _cleanPermissions();
    }


    // // // V3 MIGRATION

    // /**
    //  * @dev setDataV3
    //  *      ONLY v3Minter role can call it
    //         This function allows to store data with a preset key
    //          (keccak256(ERC20Address)) into NFT 725 Store, same as setDataERC20 but for v3 DT       
    //  * @param datatoken datatoken addresss
    //  * @param _value data to store at the above key
    //  */

    // // TODO: check if we actually need the value and data or can be the same
    // function setDataV3(
    //     address datatoken,
    //     bytes calldata _value
    // ) external {
    //     require(
    //         permissions[msg.sender].v3Minter == true,
    //         "ERC721Template: NOT v3Minter"
    //     );
    //     _checkV3DT(datatoken);
    //     // could be any other key, used a simple configuration
    //     bytes32 key = keccak256(abi.encodePacked(address(datatoken))); 
    //     setData(key, _value); // into the new standard 725Y
       
    // }

    //  /**
    //  * @dev wrapV3DT
    //  *      Requires to call proposeMinter BEFORE, the proposed minter MUST be the NFT contract address
    //  *      Only NFT Owner can call it.
    //  *      This function 'wraps' any v3 datatoken, NFTOwner has to be the actual minter(v3) 
    //  *      After wrapping, the minter() in the v3 datatoken is going to be this contract.
    //  *      To mint new tokens we now need to use mintV3DT
    //  * @param datatoken datatoken address we want to wrap
    //  * @param newMinter new minter address after wrapping
    //  */

    // function wrapV3DT(address datatoken, address newMinter)
    //     external
    //     onlyNFTOwner
    // {
    //     _wrap(datatoken);
    //     _addV3Minter(newMinter);
    // }

    //  /**
    //  * @dev mintV3DT
    //  *      Only user with v3Minter permission can call it.
    //  *      This function mints new v3 datatoken if cap is not reached yet.
     
    //  * @param datatoken datatoken address 
    //  * @param to address will receive DTs
    //  * @param value DT amount to mint   
    //  */

    // function mintV3DT(
    //     address datatoken,
    //     address to,
    //     uint256 value
    // ) external {
    //     require(
    //         permissions[msg.sender].v3Minter == true,
    //         "ERC721Template: NOT v3 MINTER"
    //     );
    //     _checkV3DT(datatoken);
    //     IV3ERC20(datatoken).mint(to, value);
    // }

    //    /**
    //  * @dev addV3Minter
    //  *      Only Manager (Roles Admin) can call it.
    //  *      This function adds a new V3 minter (will work for all v3 DT wrapped into this contract).
    //  * @param newMinter new minter address
  
    //  */

    // function addV3Minter(address newMinter) external onlyManager {
    //     _addV3Minter(newMinter);
    // }

    //   /**
    //  * @dev removeV3Minter
    //  *      Only Manager (Roles Admin) can call it.
    //  *      This function removes a V3 minter.

    //  * @param minter address to revoke
  
    //  */
    // function removeV3Minter(address minter) external onlyManager {
    //     _removeV3Minter(minter);
    // }

     /**
     * @dev transferFrom 
     *      Used for transferring the NFT, can be used by an approved relayer
            Even if we only have 1 tokenId, we leave it open as arguments for being a standard ERC721
            @param from nft owner
            @param to nft receiver
            @param tokenId tokenId (1)
     */

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external {
        require(tokenId == 1, "ERC721Template: Cannot transfer this tokenId");
        _cleanERC20Permissions(getAddressLength(deployedERC20List));
        _cleanPermissions();
        _transferFrom(from, to, tokenId);
        _addManager(to);
          // we add the nft owner to all other roles (so that doesn't need to make multiple transactions)
        Roles storage user = permissions[to];
        user.updateMetadata = true;
        user.deployERC20 = true;
        user.store = true;
        // no need to push to auth since it has been already added in _addManager()
    }

    /**
     * @dev safeTransferFrom 
     *      Used for transferring the NFT, can be used by an approved relayer
            Even if we only have 1 tokenId, we leave it open as arguments for being a standard ERC721
            @param from nft owner
            @param to nft receiver
            @param tokenId tokenId (1)
     */

    function safeTransferFrom(address from, address to,uint256 tokenId) external {
        require(tokenId == 1, "ERC721Template: Cannot transfer this tokenId");
        _cleanERC20Permissions(getAddressLength(deployedERC20List));
        _cleanPermissions();
        safeTransferFrom(from, to, tokenId, "");
        _addManager(to);
        // we add the nft owner to all other roles (so that doesn't need to make multiple transactions)
        Roles storage user = permissions[to];
        user.updateMetadata = true;
        user.deployERC20 = true;
        user.store = true;
        // no need to push to auth since it has been already added in _addManager()
    }

      /**
     * @dev getAddressLength
     *      It returns the array lentgh
            @param array address array we want to get length
     * @return length
     */


    function getAddressLength(address[] memory array)
        private
        pure
        returns (uint256)
    {
        return array.length;
    }

      /**
     * @dev _cleanERC20Permissions
     *      Internal function used to clean permissions at ERC20 level when transferring the NFT
            @param length lentgh of the deployedERC20List 
     */

    function _cleanERC20Permissions(uint256 length) internal {
        for (uint256 i = 0; i < length; i++) {
            IERC20Template(deployedERC20List[i]).cleanFrom721();
        }
    }


     /**
     * @dev fallback function
     *      this is a default fallback function in which receives
     *      the collected ether.
     */
    fallback() external payable {}

    /**
     * @dev withdrawETH
     *      transfers all the accumlated ether the ownerOf
     */
    function withdrawETH() 
        external 
        payable
    {
        payable(ownerOf(1)).transfer(address(this).balance);
    }

    function getTokensList() external view returns (address[] memory) {
        return deployedERC20List;
    }
    
    function isDeployed(address datatoken) external view returns (bool) {
        return deployedERC20[datatoken];
    }

    function setBaseURI(string memory _baseURI) external onlyNFTOwner {
            defaultBaseURI = _baseURI;
    }
}
