pragma solidity 0.8.10;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

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
        uint256[] calldata uints
    ) external returns (bytes32 exchangeId);

    function getOPFFee(address baseToken) external view returns (uint256);
    function getMinVestingPeriod() external view returns (uint256);
    function deployDispenser(
        address _dispenser,
        address datatoken,
        uint256 maxTokens,
        uint256 maxBalance,
        address owner,
        address allowedSwapper
    ) external;

    function isOceanToken(address) external view returns(bool);
    function getOceanTokens() external view returns(address[] memory);
    function isSSContract(address) external view returns(bool);
    function getSSContracts() external view returns(address[] memory);
    function isFixedRateContract(address) external view returns(bool);
    function getFixedRatesContracts() external view returns(address[] memory);
    function isDispenserContract(address) external view returns(bool);
    function getDispensersContracts() external view returns(address[] memory);
     function isPoolTemplate(address) external view returns(bool);
    function getPoolTemplates() external view returns(address[] memory);
}
