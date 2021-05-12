pragma solidity >=0.6.0;
import "../utils/ERC725/ERC725Account.sol";
import "../utils/ERC721/ERC721.sol";
//import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../utils/ERC721Roles.sol";
//import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/IMetadata.sol";
import "../interfaces/IERC20Factory.sol";
import "hardhat/console.sol";

contract ERC725Template is ERC721('Template','TemplateSymbol') , ERC725Account(address(0)), ERC721Roles {


    string private _name;
    string private _symbol;
    uint256 private tokenId = 1;
    bool private initialized;
    address public _metadata;
    address private _erc20Factory;

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

   
    function initialize(
        address owner,
        string calldata name,
        string calldata symbol,
        address metadata,
        address erc20Factory,
        bytes calldata _data,
        bytes calldata _flags
    ) external onlyNotInitialized returns (bool) {
        return
            _initialize(
                owner,
                name,
                symbol,
                metadata,
                erc20Factory,
                _data,
                _flags
            );
    }

    function _initialize(
        address owner,
        string memory name,
        string memory symbol,
        address metadata,
        address erc20Factory,
        bytes memory _data,
        bytes memory _flags
    ) private returns (bool) {
        require(
            owner != address(0),
            "ERC721Template:: Invalid minter,  zero address"
        );
        require(
            metadata != address(0),
            "ERC721Template:: Metadata address cannot be zero"
        );

        _metadata = metadata;
       
        _name = name;
        _symbol = symbol;
        _erc20Factory = erc20Factory;
        initialized = true;
        _createMetadata(_flags, _data);
        _safeMint(owner, 1);
        ERC725(owner);

        return initialized;
    }

    function _createMetadata(bytes memory flags, bytes memory data) internal {
        require(_metadata != address(0), "Invalid Metadata address");
        require(
            IERC20Factory(_erc20Factory).erc721List(address(this)) ==
                address(this),
            "ERC721Template: NOT ORIGINAL TEMPLATE"
        );
        IMetadata(_metadata).create(address(this), flags, data);
    }

    function updateMetadata(bytes calldata flags, bytes calldata data)
        external
    {
        require(
            isAllowedToUpdateMetadata[msg.sender] == true,
            "ERC721Template: NOT METADATA_ROLE"
        );
        IMetadata(_metadata).update(address(this), flags, data);
    }

    function createERC20(
        string calldata name,
        string calldata symbol,
        uint256 cap,
        uint256 templateIndex
    ) external returns (address) {
        require(
            isAllowedToCreateERC20[msg.sender] == true,
            "ERC721Template: NOT MINTER_ROLE"
        );

        address token =
            IERC20Factory(_erc20Factory).createToken(
                name,
                symbol,
                cap,
                templateIndex
            );

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

    function addManager( address _managerAddress) external onlyNFTOwner {
       require(isManager[_managerAddress] == false, 'ERC721Template: ALREADY MANAGER');
        _addManager(_managerAddress);
    }

    function removeManager(address _managerAddress) external onlyNFTOwner {
        require(isManager[_managerAddress] == true, 'ERC721Template: MANAGER DOES NOT EXIST');
        _removeManager(_managerAddress);
    }


    // Useful when trasferring the NFT, we can remove it if not required.

     function cleanLists() external onlyNFTOwner {
        _cleanLists();
    }


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
