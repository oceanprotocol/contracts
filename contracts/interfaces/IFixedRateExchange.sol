pragma solidity >=0.5.7;

interface IFixedRateExchange {
    function create(
        address baseToken,
        address dataToken,
        uint256 fixedRate,
        address owner,
        uint256 marketFee,
        address marketFeeCollector,
        uint256 opfFee
    ) external returns(bytes32 exchangeId);

    function createWithDecimals(
        address dataToken,
        address[] calldata addresses, // [baseToken,owner,marketFeeCollector]
        uint256[] calldata units // [baseTokenDecimals,dataTokenDecimals, fixedRate, marketFee]
    ) external returns (bytes32 exchangeId);
}
