pragma solidity 0.8.10;

interface IFixedRateExchange {
    function createWithDecimals(
        address datatoken,
        address[] calldata addresses, // [basetoken,owner,marketFeeCollector]
        uint256[] calldata uints // [basetokenDecimals,datatokenDecimals, fixedRate, marketFee]
    ) external returns (bytes32 exchangeId);

    function buyDT(bytes32 exchangeId, uint256 datatokenAmount, uint256 maxBasetokenAmount) external;
    function sellDT(bytes32 exchangeId, uint256 datatokenAmount, uint256 minBasetokenAmount) external;

    function getAllowedSwapper(bytes32 exchangeId) external view returns (address allowedSwapper);
    function getExchange(bytes32 exchangeId)
        external
        view
        returns (
            address exchangeOwner,
            address datatoken,
            uint256 dtDecimals,
            address basetoken,
            uint256 btDecimals,
            uint256 fixedRate,
            bool active,
            uint256 dtSupply,
            uint256 btSupply,
            uint256 dtBalance,
            uint256 btBalance,
            bool withMint
            //address allowedSwapper
        );

    function getFeesInfo(bytes32 exchangeId)
        external
        view
        returns (
            uint256 marketFee,
            address marketFeeCollector,
            uint256 opfFee,
            uint256 marketFeeAvailable,
            uint256 oceanFeeAvailable
        );

    function isActive(bytes32 exchangeId) external view returns (bool);

    function calcBaseInGivenOutDT(bytes32 exchangeId, uint256 datatokenAmount)
        external
        view
        returns (
            uint256 basetokenAmount,
            uint256 basetokenAmountBeforeFee,
            uint256 oceanFeeAmount,
            uint256 marketFeeAmount
        );
    function updateMarketFee(bytes32 exchangeId, uint256 _newMarketFee) external;
    function updateMarketFeeCollector(bytes32 exchangeId, address _newMarketCollector) external;
    function setAllowedSwapper(bytes32 exchangeId, address newAllowedSwapper) external;
}