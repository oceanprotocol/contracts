pragma solidity >=0.6.0;

import "../utils/ERC721/ERC721.sol";
import "../utils/ERC725/ERC725Ocean.sol";

//import "../FlattenERC721.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "../interfaces/IV3ERC20.sol";
//import "@openzeppelin/contracts/utils/introspection/ERC165Storage.sol";
import "../interfaces/IMetadata.sol";
import "../interfaces/IERC20Factory.sol";
import "../utils/ERC721RolesAddress.sol";
import "../utils/V3Integration.sol";
//import "hardhat/console.sol";

contract ERC721Template is ERC721('Template','TemplateSymbol'), ERC721RolesAddress, ERC725Ocean, V3Integration {

    bytes32 public METADATA_KEY = keccak256("METADATA_KEY");
    string private _name;
    string private _symbol;
    uint256 private tokenId = 1;
    bool private initialized;
    address public _metadata;
    address private _erc20Factory;

    mapping (address => bool) private deployedERC20;

    //mapping(address => bool ) public v3DT;

    event ERC20Created(address indexed erc20Address);

    function _checkNFTOwner(address sender) view internal {
        require(sender == ownerOf(1), "ERC721Template: not NFTOwner");
    }

    function initialize(
        address owner,
        string calldata name_,
        string calldata symbol_,
        address metadata,
        address erc20Factory,
        bytes calldata _data,
        bytes calldata _flags
    ) external returns (bool) {
        require(
            !initialized,
            "ERC721Template: token instance already initialized"
        );
        return
            _initialize(
                owner,
                name_,
                symbol_,
                metadata,
                erc20Factory,
                _data,
                _flags
            );
    }

    function _initialize(
        address owner,
        string memory name_,
        string memory symbol_,
        address metadata,
        address erc20Factory,
        bytes calldata _data,
        bytes memory _flags
    ) internal returns (bool) {
        require(
            owner != address(0),
            "ERC721Template:: Invalid minter,  zero address"
        );
        require(
            metadata != address(0),
            "ERC721Template:: Metadata address cannot be zero"
        );

        _metadata = metadata;
       
        _name = name_;
        _symbol = symbol_;
        _erc20Factory = erc20Factory;
        initialized = true;
        _createMetadata(_flags, _data);
        _safeMint(owner, 1);
        _addManager(owner);
        return initialized;
    }

 
    function _createMetadata(bytes memory flags, bytes calldata data) internal {
        // require(_metadata != address(0), "Invalid Metadata address");
        require(
            IERC20Factory(_erc20Factory).erc721List(address(this)) ==
                address(this),
            "ERC721Template: NOT ORIGINAL TEMPLATE"
        );
        IMetadata(_metadata).create(address(this), flags, data);
        // Add metadata to key store with default key
        setData(METADATA_KEY, data);
    }

    function updateMetadata(bytes calldata flags, bytes calldata data)
        external
    {
        Roles memory user =  _getPermissions(msg.sender);
        require(
            user.updateMetadata == true,
            "ERC721Template: NOT METADATA_ROLE"
        );
        IMetadata(_metadata).update(address(this), flags, data);
        setData(METADATA_KEY, data);
    }

    function createERC20(
        string calldata name_,
        string calldata symbol_,
        uint256 cap,
        uint256 templateIndex
    ) external returns (address) {
        Roles memory user = _getPermissions(msg.sender);
        require(
            user.deployERC20 == true,
            "ERC721Template: NOT MINTER_ROLE"
        );

        address token =
            IERC20Factory(_erc20Factory).createToken(
                name_,
                symbol_,
                cap,
                templateIndex
            );

        
        deployedERC20[token] = true;

        //FOR TEST PURPOSE BUT COULD BE COMPLETED OR REMOVED
        emit ERC20Created(token);

        return token;
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

    function isInitialized() public view returns (bool) {
        return initialized;
    }

    function addManager( address _managerAddress) external {
        _checkNFTOwner(msg.sender);
        _addManager(_managerAddress);
    }

    function removeManager(address _managerAddress) external {
        _checkNFTOwner(msg.sender);
        _removeManager(_managerAddress);
    }

    function executeCall(uint256 _operation, address _to, uint256 _value, bytes calldata _data) external payable {
        _checkManager(msg.sender);
        execute(_operation,_to,_value,_data);
    }

    function setNewData(bytes32 _key, bytes calldata _value) external {
        Roles memory user = _getPermissions(msg.sender);
        require(user.store == true, "ERC721Template: NOT STORE UPDATER");
        setData(_key,_value);
    }

    function setDataERC20(bytes32 _key, bytes calldata _value) public {
        require(deployedERC20[msg.sender] == true, 'ERC721Template: NOT ERC20 Contract');
        setData(_key,_value);
    }
    
    function setDataV3(address datatoken, bytes calldata _value, bytes calldata flags,
        bytes calldata data) external  {
        Roles memory user = _getPermissions(msg.sender);
        require(user.deployERC20 == true, "ERC721Template: NOT erc20 deployer");
        _checkV3DT(datatoken);
        
        bytes32 key = keccak256(abi.encodePacked(address(datatoken))); // could be any other key, used a simple configuration
        setDataERC20(key, _value); // into the new standard 725Y
        IMetadata(_metadata).update(datatoken, flags, data); // Metadata standard for Aqua (V4 Metadata)
        // IMetadata(_metadataV3).update(datatoken, flags, data); // Old Metadata for Aqua (V3 Metadata). We should deprecate this and not support it anymore
        // instead we should force V3 migration to start using the new V4 Metadata contract.
    }

    // Useful when trasferring the NFT, we can remove it if not required.

     function cleanPermissions() external {
        _checkNFTOwner(msg.sender);
        _cleanPermissions();
    }

    // // V3 MIGRATION

    function wrapV3DT(address datatoken, address newMinter) external{
      _checkNFTOwner(msg.sender);
        _wrap(datatoken);
       _addV3Minter(newMinter);
        
     
        
    }

    function mintV3DT(address datatoken, address to, uint256 value) external {
       Roles memory user = permissions[msg.sender];
       require(user.v3Minter == true, "ERC721Template: NOT v3 MINTER");
       _checkV3DT(datatoken);
        IV3ERC20(datatoken).mint(to,value);
        
    }

    function addV3Minter(address newMinter) external {
        _checkManager(msg.sender);
        _addV3Minter(newMinter);
        
    }

    function removeV3Minter(address minter) external {
        _checkManager(msg.sender);
        _removeV3Minter(minter);
    }

    
    // NEEDED FOR IMPERSONATING THIS CONTRACT(need eth to send txs). WILL BE REMOVED
    receive() external payable {}

    // FOR TEST PURPOSE TOGETHER WITH FlattenERC721.sol, both will be removed
    // function mint(address account) external {
    //     // require(
    //     //     hasRole(MINTER_ROLE, msg.sender),
    //     //     "ERC721Template NOT MINTER_ROLE"
    //     // );
    //     // tokenId += 1;
    //     _safeMint(account, 2);
    // }

    
}
