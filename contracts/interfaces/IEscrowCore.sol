pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
 * @title IEscrowCore
 * @dev ERC-165 capability MARKER for the Ocean escrow's base surface at the v2 (major) signatures:
 *      `createLock`/`reLock` carry `jobType` + `subsidyProviders` (like `claimLock`), and `authorize`
 *      carries an `expiryTimestamp`. A contract advertises support via
 *      `supportsInterface(type(IEscrowCore).interfaceId)`; discovery callers treat a failed/absent
 *      staticcall as "legacy, assume base-only", never a revert.
 *
 *      This interface is consumed for its `interfaceId` and as documentation of the surface; the escrow
 *      declares support in `supportsInterface` without necessarily inheriting it. Keep it FROZEN once
 *      shipped — new capabilities get their own `IEscrow*` marker, never a change here.
 */
interface IEscrowCore {
    function deposit(address token, uint256 amount) external;

    function withdraw(address[] calldata token, uint256[] calldata amount) external;

    function authorize(
        address token,
        address payee,
        uint256 maxLockedAmount,
        uint256 maxLockSeconds,
        uint256 maxLockCounts,
        uint256 expiryTimestamp
    ) external;

    function createLock(
        uint256 jobId,
        address token,
        address payer,
        uint256 amount,
        uint256 expiry,
        uint256 jobType,
        address[] calldata subsidyProviders
    ) external;

    function reLock(
        uint256 jobId,
        address token,
        address payer,
        uint256 amount,
        uint256 expiry,
        uint256 jobType,
        address[] calldata subsidyProviders
    ) external;

    function claimLock(
        uint256 jobId,
        address token,
        address payer,
        uint256 amount,
        bytes calldata proof,
        uint256 jobType,
        address[] calldata subsidyProviders
    ) external;

    function cancelExpiredLock(
        uint256 jobId,
        address token,
        address payer,
        address payee
    ) external;
}
