pragma solidity >=0.6.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/IMetadata.sol";
import "../interfaces/IERC20Factory.sol";

contract ERC721Template is ERC721, AccessControl {
    address private paymentCollector;
    address private ipHolder;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant METADATA_ROLE = keccak256("METADATA_ROLE");

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

    constructor(
        string memory name,
        string memory symbol,
        address admin,
        address metadata,
        address erc20Factory,
        bytes memory _data,
        bytes memory flags
    ) public ERC721(name, symbol) {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MINTER_ROLE, admin);
        //  _metadata = metadata;
        // _initialize(admin, name, symbol,metadata,erc20Factory,_data,flags);
    }

    function initialize(
        address admin,
        string calldata name,
        string calldata symbol,
        address metadata,
        address erc20Factory,
        bytes calldata _data,
        bytes calldata flags
    ) external onlyNotInitialized returns (bool) {
        return
            _initialize(
                admin,
                name,
                symbol,
                metadata,
                erc20Factory,
                _data,
                flags
            );
    }

    function _initialize(
        address admin,
        string memory name,
        string memory symbol,
        address metadata,
        address erc20Factory,
        bytes memory _data,
        bytes memory flags
    ) private returns (bool) {
        require(
            admin != address(0),
            "ERC721Template:: Invalid minter,  zero address"
        );
        require(
            metadata != address(0),
            "ERC721Template:: Metadata address cannot be zero"
        );
        _metadata = metadata;
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(MINTER_ROLE, admin);
        _setupRole(METADATA_ROLE, admin);
        paymentCollector = admin;
        ipHolder = admin;
        _name = name;
        _symbol = symbol;
        _erc20Factory = erc20Factory;
        initialized = true;
        _createMetadata(flags, _data);
        return initialized;
    }

    function mint(address account) external {
        require(
            hasRole(MINTER_ROLE, msg.sender),
            "ERC721Template NOT MINTER_ROLE"
        );
        tokenId += 1;
        _mint(account, tokenId);
    }

    function _createMetadata(bytes memory flags, bytes memory data) internal {
        // require(hasRole(METADATA_ROLE, msg.sender), "NOT METADATA_ROLE");
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
            hasRole(METADATA_ROLE, msg.sender),
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
            hasRole(MINTER_ROLE, msg.sender),
            "ERC721Template: NOT MINTER_ROLE"
        );

        address token =
            IERC20Factory(_erc20Factory).createToken(
                name,
                symbol,
                cap,
                msg.sender,
                templateIndex
            ); // already checked when creating a new ERC20 in ERC20Factory, could be removerd

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

    // NEEDED FOR IMPERSONATING THIS CONTRACT(need eth to send txs). WILL BE REMOVED
    receive() external payable {}
}
