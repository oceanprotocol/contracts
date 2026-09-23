pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
 * @title MockAccessList
 * @dev Trivial allowlist for tests: `balanceOf` returns 1 for a member, 0 otherwise. Matches the
 *      `IAccessListContract{ balanceOf }` membership gate used by OPFSubsidyProvider (the real
 *      AccessList is a factory/clone on ^0.8.26 and heavier to wire in unit tests).
 */
contract MockAccessList {
    mapping(address => bool) public isMember;

    function setMember(address account, bool member) external {
        isMember[account] = member;
    }

    function balanceOf(address account) external view returns (uint256) {
        return isMember[account] ? 1 : 0;
    }
}
