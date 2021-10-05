pragma solidity >=0.5.7;


interface IFactoryRouter {
   function deployPool(
       // address controller,
        address[2] calldata tokens, // [datatokenAddress, basetokenAddress]
       // address publisherAddress,
        uint256[] calldata ssParams,
      //  address basetokenSender,
        uint256[] calldata swapFees,
       // address marketFeeCollector,

        address[] calldata addresses

    ) external returns (address);

   function deployFixedRate(
        address fixedPriceAddress,
        address[] calldata addresses,
        uint[] calldata units

    ) external returns (bytes32 exchangeId);

    function getOPFFee(address baseToken) external view returns (uint256);
}