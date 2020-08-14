pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0


contract DDO {

    mapping(bytes32 => address) didOwners;

    event DDOCreated(
        bytes indexed did,
        address indexed owner,
        bytes flags,
        bytes data
    );

    event DDOUpdated(
        bytes indexed did,
        address indexed owner,
        bytes flags,
        bytes data
    );

    constructor() public {}
    
    function create (
        bytes calldata did,
        bytes calldata flags,
        bytes calldata data
    ) 
        external
    {
        bytes32 didHash = keccak256(
            abi.encodePacked(
                did
            )
        );
        require(
            didOwners[didHash] == address(0),
            'DDO: DID already exists'
        );
        didOwners[didHash] = msg.sender;
        emit DDOCreated(did, msg.sender, flags, data);
    }

    function update(
        bytes calldata did,
        bytes calldata flags,
        bytes calldata data
    ) 
        external
    {
        bytes32 didHash = keccak256(
            abi.encodePacked(
                did
            )
        );
        require(
            didOwners[didHash] == msg.sender,
            'DDO: invalid DID owner'
        );
        emit DDOUpdated(did, msg.sender, flags, data);
    }
}