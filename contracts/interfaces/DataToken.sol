pragma solidity >=0.5.0;

interface DataToken {
    function initialize(
        string calldata name,
        string calldata symbol,
        address minterAddress,
        address publisherAddress,
        uint256 cap,
        string calldata blob,
        address feeCollector
    ) external returns (bool);

    function mint(address account, uint256 value) external;
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function cap() external view returns (uint256);
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
    function minter() external view returns(address);    
    function isMinter(address account) external view returns (bool);
    function changeMinter(address newMinter) external;
    function publisher() external view returns(address);    
    function isPublisher(address account) external view returns (bool);
    function changePublisher(address newMinter) external;
    function totalSupply() external view returns (uint256);
    
}
