pragma solidity >=0.5.0;

interface IERC20Template {
    function initialize(
        string calldata name,
        string calldata symbol,
        address minterAddress,
        uint256 capERC20,
        address collector
    ) external returns (bool);
}
