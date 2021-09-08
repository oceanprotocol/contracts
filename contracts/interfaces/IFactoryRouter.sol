pragma solidity >=0.5.7;


interface IFactoryRouter {
           function deployPool(
        address controller, 
        address[2] calldata tokens, 
        address publisherAddress,
        uint256[] calldata ssParams,
        address basetokenSender,
        uint256[2] calldata swapFees,
        address marketFeeCollector
    ) external returns (address);

    function deployFixedRate(
        address basetokenAddress,
        uint8 basetokenDecimals,
        uint256 fixedRate,
        address owner,
        uint256 marketFee,
        address marketFeeCollector
    ) external returns (bytes32 exchangeId);
}