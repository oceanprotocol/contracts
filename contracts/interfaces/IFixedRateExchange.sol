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
        address baseToken,
        address dataToken,
        uint8 _btDecimals,
        uint8 _dtDecimals,
        uint256 fixedRate,
        address owner,
        uint256 marketFee,
        address marketFeeCollector
    ) external returns(bytes32 exchangeId);
}
