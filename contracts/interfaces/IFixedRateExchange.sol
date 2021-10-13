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
    ) external returns (bytes32 exchangeId);

    function createWithDecimals(
        address dataToken,
        address[] calldata addresses, // [baseToken,owner,marketFeeCollector]
        uint256[] calldata uints // [baseTokenDecimals,dataTokenDecimals, fixedRate, marketFee]
    ) external returns (bytes32 exchangeId);

    function buyDT(bytes32 exchangeId, uint256 dataTokenAmount) external;
    
    function getExchange(bytes32 exchangeId)
        external
        view
        returns (
            address exchangeOwner,
            address dataToken,
            uint256 dtDecimals,
            address baseToken,
            uint256 btDecimals,
            uint256 fixedRate,
            bool active,
            uint256 dtSupply,
            uint256 btSupply,
            uint256 dtBalance,
            uint256 btBalance
        );

    function calcBaseInGivenOutDT(bytes32 exchangeId, uint256 dataTokenAmount)
        external
        view
        returns (
            uint256 baseTokenAmount,
            uint256 baseTokenAmountBeforeFee,
            uint256 oceanFeeAmount,
            uint256 marketFeeAmount
        );
}
