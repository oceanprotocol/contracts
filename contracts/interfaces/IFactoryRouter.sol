pragma solidity >=0.5.7;


interface IFactoryRouter {
           function deployPool(
        address controller, 
        address[2] calldata tokens, 
        address publisherAddress,
        uint256[] calldata ssParams,
        address basetokenSender,
        uint256[] calldata swapFees,
        address marketFeeCollector
    ) external returns (address);
}