pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0


contract DDO {

    mapping(bytes32 => address) didOwners;

    event DDOCreated(
        bytes32 indexed did,
        bytes flags,
        bytes data
    );
    event DDOUpdated(
        bytes32 indexed did,
        bytes flags,
        bytes data
    );

    modifier onlyDIDOwner(bytes32 did)
    {
        require(
            didOwners[did] == msg.sender,
            'DDO: Invalid DID Owner'
        );
        _;
    }
    constructor() public {}

    function newDDO(
        bytes32 did,
        bytes calldata flags,
        bytes calldata data
    ) 
        external
    {
        require(
            didOwners[did] == address(0),
            'DDO: DID already exists'
        );
        didOwners[did] = msg.sender;
        emit DDOCreated(
            did,
            flags,
            data
        );
    }

    function updateDDO(
        bytes32 did,
        bytes calldata flags,
        bytes calldata data
    ) 
        external
        onlyDIDOwner(did)
    {
        emit DDOUpdated(
            did,
            flags,
            data
        );
    }
}