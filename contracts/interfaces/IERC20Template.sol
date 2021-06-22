pragma solidity >=0.5.0;


interface IERC20Template {
    function initialize(
        string calldata name,
        string calldata symbol,
        address erc721Address,
        uint256 capERC20,
        address collector,
        address minter
    ) external returns (bool);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function PERMIT_TYPEHASH() external pure returns (bytes32);
    function nonces(address owner) external view returns (uint);

    function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s) external;
}
