pragma solidity >=0.5.0;

interface IDataTokenTemplate {
    function initialize(
        string calldata name,
        string calldata symbol,
        address minter,
        uint256 cap,
        string calldata blob,
        address payable feeManager
    ) external returns(bool);    
    function mint(address account, uint256 value) 
    external payable;
    function approveAndLock(
        address spender,
        uint256 value
    ) external returns(bool);
    function unlockAndTransfer( 
        address from,
        address to,
        uint256 amount, 
        uint256 lockedTotal
    ) external returns(bool);
    function pause() external;
    function unpause() external;
    function setMinter(address minter) external;
    function name() external view returns(string memory);
    function symbol() external view returns(string memory);
    function blob() external view returns(string memory);
    function decimals() external view returns(uint256);
    function cap() external view returns (uint256);
    function isMinter(address account) external view returns(bool);
    function isInitialized() external view returns(bool);
    function isPaused() external view returns(bool);
}