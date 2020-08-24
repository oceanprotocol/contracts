pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
* @title DDO
*  
* @dev DDO stands for Decentralized Document. It allows publishers
*      to publish their dataset metadata in decentralized way.
*      It follows the Ocean DID Document standard: 
*      https://github.com/oceanprotocol/OEPs/blob/master/7/v0.2/README.md
*/
contract DDO {

    mapping(bytes32 => address) public didOwners;

    event DDOCreated(
        bytes32 indexed did,
        bytes flags,
        bytes data,
        uint256 createdAt,
        address createdBy
    );
    event DDOUpdated(
        bytes32 indexed did,
        bytes flags,
        bytes data,
        uint256 updatedAt,
        address updatedBy
    );
    event  DDOOwnershipTransferred(
        bytes32 did,
        address owner
    );

    modifier onlyDIDOwner(bytes32 did)
    {
        require(
            didOwners[did] == msg.sender,
            'DDO: Invalid DID Owner or DID does not exist'
        );
        _;
    }
    constructor() public {}

    /**
     * @dev create
     *      creates/publishes new DDO document on-chain. 
     * @param did refers to decentralized identifier
     * @param flags special flags associated with DID
     * @param data referes to the actual metadata
     */
    function create(
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
            data,
            block.number,
            didOwners[did]
        );
    }

    /**
     * @dev update
     *      allows only did owners to update the DDO/metadata content
     * @param did refers to decentralized identifier
     * @param flags special flags associated with DID
     * @param data referes to the actual metadata
     */
    function update(
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
            data,
            block.number,
            msg.sender
        );
    }

    /**
     * @dev transferOwnership
     *      allows only did owners to transfer did ownership
     * @param did refers to decentralized identifier
     * @param owner the new owner address
     */
    function transferOwnership(
        bytes32 did,
        address owner
    )
        external
        onlyDIDOwner(did)
    {
        require(
            owner != msg.sender &&
            owner != address(0)
        );
        didOwners[did] = owner;
        emit DDOOwnershipTransferred(
            did,
            owner
        );
    }
}