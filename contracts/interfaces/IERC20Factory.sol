pragma solidity >=0.5.0;

interface IERC20Factory {
    function initialize(
        string calldata _name,
        string calldata _symbol,
        address _minter,
        uint256 _cap,
        string calldata blob,
        address collector
    ) external returns (bool);

    function mint(address account, uint256 value) external;

    function minter() external view returns (address);

    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function decimals() external view returns (uint8);

    function cap() external view returns (uint256);

    function isMinter(address account) external view returns (bool);

    function isInitialized() external view returns (bool);

    function allowance(address owner, address spender)
        external
        view
        returns (uint256);

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address to, uint256 value) external returns (bool);

    function proposeMinter(address newMinter) external;

    function approveMinter() external;

    function createToken(
        string calldata nameERC20,
        string calldata symbolERC20,
        uint256 capERC20,
        uint256 templateIndex,
        address minter
    ) external returns (address token);

    function addToERC721Registry(address ERC721address) external;

    function erc721List(address ERC721address) external returns (address);
}
