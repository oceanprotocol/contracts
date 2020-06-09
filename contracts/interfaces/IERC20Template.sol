pragma solidity >=0.5.0;

interface IERC20Template {
    function initialize(
        string calldata name,
        string calldata symbol,
        address minter,
        uint256 cap,
        string calldata blob
    ) external returns(bool);    
    function mint(address account, uint256 value) 
    external payable;
    function pause() external;
    function unpause() external;
    function setMinter(address minter) external;
    function name() external view returns(string memory);
    function symbol() external view returns(string memory);
    function decimals() external view returns(uint256);
    function cap() external view returns (uint256);
    function isMinter(address account) external view returns(bool);
    function isInitialized() external view returns(bool);
    function isPaused() external view returns(bool);
}