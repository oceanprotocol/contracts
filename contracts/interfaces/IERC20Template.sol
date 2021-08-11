pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

interface IERC20Template {
      struct RolesERC20 {
        bool minter;
        bool feeManager; 
    }

     function initialize(
        string calldata name_,
        string calldata symbol_,
        address erc721Address,
        uint256 cap_,
        address communityFeeCollector,
        address minter
    ) external returns (bool);
    
    function name() external pure returns (string memory);
    function symbol() external pure returns (string memory);
    function decimals() external pure returns (uint8);
    function totalSupply() external view returns (uint);
    function cap() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint);
    function allowance(address owner, address spender) external view returns (uint);

    function approve(address spender, uint value) external returns (bool);
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(address from, address to, uint value) external returns (bool);
    function mint(address account, uint256 value) external;
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function PERMIT_TYPEHASH() external pure returns (bytes32);
    function nonces(address owner) external view returns (uint);
    function permissions(address user) external view returns(RolesERC20 memory);
    function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s) external;
    function cleanFrom721() external;
}
