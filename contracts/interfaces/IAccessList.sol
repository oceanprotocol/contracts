pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

// AccessList membership gate (matches ERC20Template4's pattern): a non-zero balance == member.
interface IAccessListContract {
    function balanceOf(address owner) external view returns (uint256);
}
