pragma solidity >=0.6.0;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "../interfaces/IERC721Template.sol";
import "../interfaces/IFactory.sol";

/**
 * @title Metadata
 *
 * @dev Metadata stands for Decentralized Document. It allows publishers
 *      to publish their dataset metadata in decentralized way.
 *      It follows the Ocean DID Document standard:
 *      https://github.com/oceanprotocol/OEPs/blob/master/7/v0.2/README.md
 */
contract Metadata {
    address public tokenFactory;

    address public factoryUpdater;

    event MetadataCreated(
        address indexed dataToken,
        address indexed createdBy,
        bytes flags,
        bytes data
    );
    event MetadataUpdated(
        address indexed dataToken,
        address indexed updatedBy,
        bytes flags,
        bytes data
    );


    constructor() {
        factoryUpdater = msg.sender;
     }
    
    modifier onlyDataTokenMinter(address dataToken) {
        require(
            IFactory(tokenFactory).erc721List(msg.sender) == msg.sender,
            "Metadata:NOT ORIGINAL TEMPLATE"
        );
        _;
    }

    modifier onlyFactoryUpdater() {
        require(factoryUpdater == msg.sender, 'Metadata: only Factory Updater');
        _;
    }

    /**
     * @dev create
     *      creates/publishes new metadata/DDO document on-chain.
     * @param dataToken refers to data token address
     * @param flags special flags associated with metadata
     * @param data referes to the actual metadata
     */
    function create(
        address dataToken,
        bytes calldata flags,
        bytes calldata data
    ) external onlyDataTokenMinter(dataToken) {
        emit MetadataCreated(dataToken, msg.sender, flags, data);
    }

    /**
     * @dev update
     *      allows only datatoken minter(s) to update the DDO/metadata content
     * @param dataToken refers to data token address
     * @param flags special flags associated with metadata
     * @param data referes to the actual metadata
     */
    function update(
        address dataToken,
        bytes calldata flags,
        bytes calldata data
    ) external onlyDataTokenMinter(dataToken) {
        emit MetadataUpdated(dataToken, msg.sender, flags, data);
    }

     /**
     * @dev addTokenFactory
            
     *        only Factory Updater can set it ONCE.
     * @param _tokenFactory factory address
    
     */

    function addTokenFactory(address _tokenFactory) external onlyFactoryUpdater {
        require(tokenFactory == address(0), 'Metadata: Factory already set');
        require(_tokenFactory != address(0), 'Metadata: Factory cannot be address zero');
        tokenFactory = _tokenFactory;
    }
}
