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
//import "hardhat/console.sol";

contract ERC725Template is ERC721('Template','TemplateSymbol'), ERC721RolesAddress, ERC725Ocean {

    bytes32 public METADATA_KEY = keccak256("METADATA_KEY");
    string private _name;
    string private _symbol;
    uint256 private tokenId = 1;
    bool private initialized;
    address public _metadata;
    address private _erc20Factory;

    mapping (address => bool) private deployedERC20;

    mapping(address => bool ) private v3DT;

    event ERC20Created(address indexed erc20Address);

    modifier onlyNotInitialized() {
        require(
            !initialized,
            "ERC721Template: token instance already initialized"
        );
        _;
    }

    modifier onlyNFTOwner() {
        require(msg.sender == ownerOf(1), "ERC721Template: not NFTOwner");
        _;
    }

    // constructor(
    //     string memory name,
    //     string memory symbol
    // ) public ERC721(name, symbol) {}

    function initialize(
        address owner,
        string calldata name_,
        string calldata symbol_,
        address metadata,
        address erc20Factory,
        bytes calldata _data,
        bytes calldata _flags
    ) external onlyNotInitialized returns (bool) {
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
    ) private returns (bool) {
        require(
            owner != address(0),
            "ERC725Template:: Invalid minter,  zero address"
        );
        require(
            metadata != address(0),
            "ERC725Template:: Metadata address cannot be zero"
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

// WE COULD ADD A CALL TO SETDATA TO REGISTER THIS METADATA(BOTH create and update) WITH A SPECIFIC KEY VALUE, FOR CONSISTENCY    
    function _createMetadata(bytes memory flags, bytes calldata data) internal {
        require(_metadata != address(0), "Invalid Metadata address");
        require(
            IERC20Factory(_erc20Factory).erc721List(address(this)) ==
                address(this),
            "ERC725Template: NOT ORIGINAL TEMPLATE"
        );
        IMetadata(_metadata).create(address(this), flags, data);
        // Add metadata to key store with default key
        setData(METADATA_KEY, data);
    }

    function updateMetadata(bytes calldata flags, bytes calldata data)
        external
    {
        Roles memory user = permissions[msg.sender];
        require(
            user.updateMetadata == true,
            "ERC725Template: NOT METADATA_ROLE"
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
        Roles memory user = permissions[msg.sender];
        require(
            user.deployERC20 == true,
            "ERC725Template: NOT MINTER_ROLE"
        );

        address token =
            IERC20Factory(_erc20Factory).createToken(
                name_,
                symbol_,
                cap,
                templateIndex
            );

        //FOR TEST PURPOSE BUT COULD BE COMPLETED OR REMOVED
        deployedERC20[token] = true;

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

    function addManager( address _managerAddress) external onlyNFTOwner {
       
     //  require(isManager[_managerAddress] == false, 'ERC725Template: ALREADY MANAGER');
        _addManager(_managerAddress);
    }

    function removeManager(address _managerAddress) external onlyNFTOwner {
    //    require(isManager[_managerAddress] == true, 'ERC725Template: MANAGER DOES NOT EXIST');
        _removeManager(_managerAddress);
    }



    function executeCall(uint256 _operation, address _to, uint256 _value, bytes calldata _data) external payable onlyManager {
        execute(_operation,_to,_value,_data);
    }

    function setNewData(bytes32 _key, bytes calldata _value) external {
        Roles memory user = permissions[msg.sender];
        require(user.store == true, "ERC725Template: NOT STORE UPDATER");
        setData(_key,_value);
    }

    function setDataERC20(bytes32 _key, bytes calldata _value) external {
        require(deployedERC20[msg.sender] == true, 'ERC725Template: NOT ERC20 Contract');
        setData(_key,_value);
    }
    
    // Useful when trasferring the NFT, we can remove it if not required.

     function cleanPermissions() external onlyNFTOwner {
        _cleanPermissions();
    }

    // V3 MIGRATION

    function wrapV3DT(address datatoken, address newMinter) external onlyNFTOwner{
        require(IV3ERC20(datatoken).minter() == msg.sender, 'ERC725Template: NOT ERC20 V3 datatoken owner');
        v3DT[datatoken] = true;
        (bool success, bytes memory result) = datatoken.delegatecall(abi.encodeWithSignature("proposeMinter(address)", address(this) ));
        require(success == true, 'ERC725Template: PROPOSE MINTER FAILED');
        IV3ERC20(datatoken).approveMinter();
        IV3ERC20(datatoken).proposeMinter(newMinter);

        // TODO: NOW THE Propose minter has to accept 
    }

    // function setV3Minter(address datatoken, address newMinter) external onlyNFTOwner {
    //     require(v3DT[datatoken] == true, "ERC725Template: V3 DATATOKEN NOT WRAPPED");
    //     IV3ERC20(datatoken).proposeMinter(newMinter);
    // }

    // function addValuesWithDelegateCall(address calculator, uint256 a, uint256 b) public returns (uint256) {
    //     (bool success, bytes memory result) = calculator.delegatecall(abi.encodeWithSignature("add(uint256,uint256)", a, b));
    //     emit AddedValuesByDelegateCall(a, b, success);
    //     return abi.decode(result, (uint256));
    // }
    // NEEDED FOR IMPERSONATING THIS CONTRACT(need eth to send txs). WILL BE REMOVED
    receive() external payable {}

    // FOR TEST PURPOSE TOGETHER WITH FlattenERC721.sol, both will be removed
    function mint(address account) external {
        // require(
        //     hasRole(MINTER_ROLE, msg.sender),
        //     "ERC721Template NOT MINTER_ROLE"
        // );
        // tokenId += 1;
        _safeMint(account, 2);
    }

    
}
