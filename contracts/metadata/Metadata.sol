pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import '../interfaces/IERC20Template.sol';


/**
* @title Metadata
*  
* @dev Metadata stands for Decentralized Document. It allows publishers
*      to publish their dataset metadata in decentralized way.
*      It follows the Ocean DID Document standard: 
*      https://github.com/oceanprotocol/OEPs/blob/master/7/v0.2/README.md
*/
contract Metadata {

    event MetadataCreated(
        address indexed dataToken,
        bytes flags,
        bytes data,
        uint256 createdAt,
        address createdBy
    );
    event MetadataUpdated(
        address indexed dataToken,
        bytes flags,
        bytes data,
        uint256 updatedAt,
        address updatedBy
    );

    modifier onlyDataTokenMinter(address dataToken)
    {
        IERC20Template token = IERC20Template(dataToken);
        require(
            token.minter() == msg.sender,
            'DDO: Invalid DataToken Minter'
        );
        _;
    }

    constructor() public {}

    /**
     * @dev create
     *      creates/publishes new metadata/DDO document on-chain. 
     * @param dataToken refers to data token address
     * @param flags special flags associated with DID
     * @param data referes to the actual metadata
     */
    function create(
        address dataToken,
        bytes calldata flags,
        bytes calldata data
    ) 
        external
        onlyDataTokenMinter(dataToken)
    {
        emit MetadataCreated(
            dataToken,
            flags,
            data,
            block.number,
            msg.sender
        );
    }

    /**
     * @dev update
     *      allows only datatoken minter(s) to update the DDO/metadata content
     * @param dataToken refers to data token address
     * @param flags special flags associated with DID
     * @param data referes to the actual metadata
     */
    function update(
        address dataToken,
        bytes calldata flags,
        bytes calldata data
    ) 
        external
        onlyDataTokenMinter(dataToken)
    {
        emit MetadataUpdated(
            dataToken,
            flags,
            data,
            block.number,
            msg.sender
        );
    }
}