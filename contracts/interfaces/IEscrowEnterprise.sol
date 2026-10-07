pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
 * @title IEscrowEnterprise
 * @dev ERC-165 capability interface for the ENTERPRISE escrow flavour, which (unlike the community
 *      `Escrow`) restricts which tokens are usable and charges a configurable enterprise fee via its
 *      `IEnterpriseFeeCollector`. These read-only passthroughs let an integrator check token
 *      eligibility and preview the fee BEFORE calling `createLock` (which otherwise reverts on a
 *      disallowed token or a fee >= amount). Discover with
 *      `supportsInterface(type(IEscrowEnterprise).interfaceId)`; only the enterprise escrow advertises it.
 *      Use `escrowKind()` for the community-vs-enterprise label itself.
 *
 *      When the escrow has no fee collector configured (`feeCollector() == address(0)`) there is no gate:
 *      `isTokenAllowed` returns true for any token and `previewFee` returns 0.
 */
interface IEscrowEnterprise {
    /// @notice the IEnterpriseFeeCollector this escrow uses (== opcCollector); address(0) means no gate.
    function feeCollector() external view returns (address);

    /// @notice whether `token` is usable for locks here — mirrors the createLock token gate exactly
    ///         (true when no fee collector is set).
    function isTokenAllowed(address token) external view returns (bool);

    /// @notice the enterprise fee that would be charged on `amount` of `token` (0 when no collector is
    ///         set). createLock requires this to be strictly less than `amount`.
    function previewFee(address token, uint256 amount) external view returns (uint256);
}
