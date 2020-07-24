pragma solidity >=0.5.0;

interface IFPLP {
    function initialize(
        address lpAddress,
        address basetoken,
        address datatoken,
        uint256 ratio
    ) external returns (bool);

    function isInitialized() external returns (bool);

    function buyDataTokens(uint256 dtAmount) external returns (bool);

    function getRatio() external returns (uint256);

    function getTokens() external returns (address[] memory);

    function getDTReserve() external returns (uint256);
}
