pragma solidity >=0.5.7;


interface IFactoryRouter {
   function deployPool(
        address[2] calldata tokens, // [datatokenAddress, basetokenAddress]
        uint256[] calldata ssParams,
        uint256[] calldata swapFees,
        address[] calldata addresses

    ) external returns (address);

   function deployFixedRate(
        address fixedPriceAddress,
        address[] calldata addresses,
        uint[] calldata uints

    ) external returns (bytes32 exchangeId);

    function getOPFFee(address baseToken) external view returns (uint256);
}