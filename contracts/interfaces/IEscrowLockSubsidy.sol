pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
 * @title IEscrowLockSubsidy
 * @dev ERC-165 capability MARKER for the escrow's lock-time ("pre-funded") sponsorship surface. Present
 *      only on deployments that ship the feature; discover via
 *      `supportsInterface(type(IEscrowLockSubsidy).interfaceId)`. Consumed for its `interfaceId` and as
 *      documentation; keep FROZEN once shipped.
 */
interface IEscrowLockSubsidy {
    /// emitted once per provider that pre-funds part of a lock (at createLock / reLock-grow).
    event LockSponsored(
        address indexed payer,
        address indexed payee,
        uint256 jobId,
        address token,
        address provider,
        uint256 amount
    );

    /// emitted once per provider when unused sponsored tokens are returned (partial claim / expiry /
    /// reLock-shrink). `reclaimable == true` means the push failed and the amount was credited to the
    /// provider's reclaimable bucket instead of transferred.
    event SponsorRefunded(
        address indexed payer,
        address indexed payee,
        uint256 jobId,
        address token,
        address provider,
        uint256 amount,
        bool reclaimable
    );

    /// @notice A provider withdraws tokens parked in its reclaimable bucket (a refund whose push failed).
    function sweepReclaimable(address token) external;

    /// @notice Total sponsored tokens of `token` currently held in the non-withdrawable bucket.
    function getSponsoredTotal(address token) external view returns (uint256);

    /// @notice Amount of `token` parked for `provider` after a failed refund push.
    function getReclaimable(address provider, address token) external view returns (uint256);

    /// @notice The sponsorship backing a lock, keyed by (payee, payer, jobId).
    /// @return total sum currently sponsored for the lock.
    /// @return providers the contributing providers.
    /// @return amounts each provider's current contribution (parallel to `providers`).
    function getSponsorship(
        address payee,
        address payer,
        uint256 jobId
    ) external view returns (uint256 total, address[] memory providers, uint256[] memory amounts);
}
