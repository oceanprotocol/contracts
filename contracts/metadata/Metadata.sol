pragma solidity >=0.6.0;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "../interfaces/IERC721Template.sol";
import "../interfaces/IERC20Factory.sol";

/**
 * @title Metadata
 *
 * @dev Metadata stands for Decentralized Document. It allows publishers
 *      to publish their dataset metadata in decentralized way.
 *      It follows the Ocean DID Document standard:
 *      https://github.com/oceanprotocol/OEPs/blob/master/7/v0.2/README.md
 */
contract Metadata {
    address public erc20Factory;

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


    constructor(address _erc20Factory) {
        erc20Factory = _erc20Factory;
    }
    
    modifier onlyDataTokenMinter(address dataToken) {
        require(
            IERC20Factory(erc20Factory).erc721List(msg.sender) == msg.sender,
            "Metadata:NOT ORIGINAL TEMPLATE"
        );
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

    // MISSING ONLYOWNER OR SOME KIND OF RESTRICION, COULD BE REMOVED IF WE DON"T WANT TO UPDATE IT(HARDCODED IN THE CONTRACT)
    function setERC20Factory(address _erc20Factory) public {
        erc20Factory = _erc20Factory;
    }
}
