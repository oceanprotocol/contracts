pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

interface IEnterpriseFeeCollector {
    function calculateFee(
        address baseTokenAddress,
        uint256 amount
    ) external view returns (uint256);
    function isTokenAllowed(address tokenAddress) 
        external 
        view 
        returns (bool);
}