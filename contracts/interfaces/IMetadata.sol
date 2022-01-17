// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

interface IMetadata {
    function create(
        address datatoken,
        bytes calldata flags,
        bytes calldata data
    ) external;

    function update(
        address datatoken,
        bytes calldata flags,
        bytes calldata data
    ) external;
}