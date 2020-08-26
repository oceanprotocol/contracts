pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import './BPool.sol';
import './BConst.sol';
import '../utils/Deployer.sol';
import '../utils/Converter.sol';

/*
* @title SFactory contract
* @author Ocean Protocol (with code from Balancer Labs)
*
* @dev Ocean implementation of Balancer BPool Factory
*      SFactory deploys BPool proxy contracts.
*      New BPool proxy contracts are links to the template contract's bytecode.
*      Proxy contract functionality is based on Ocean Protocol custom
*        implementation of ERC1167 standard.
*/

contract SFactory is BConst, Deployer, Converter {

    address private _spoolTemplate;

    event BPoolCreated(
        address indexed newBPoolAddress,
        address indexed spoolTemplateAddress
    );
    
    event BPoolRegistered(
        address spoolAddress,
        address indexed registeredBy,
        uint256 indexed registeredAt
    );
    
    /* @dev Called on contract deployment. Cannot be called with zero address.
       @param _spoolTemplate -- address of a deployed BPool contract. */
    constructor(address spoolTemplate) 
        public 
    {
        require(spoolTemplate != address(0), 'ERR_ADDRESS_0');
        _spoolTemplate = spoolTemplate;
    }

    /* @dev Deploys new BPool proxy contract.
       Template contract address could not be a zero address. 
       @return address of a new proxy BPool contract */
    function newBPool()
        public
        returns (address spool)
    {
        spool = deploy(_spoolTemplate);
        require(spool != address(0), 'ERR_ADDRESS_0');
        
        // replace BPool with interface
        BPool spoolInstance = BPool(spool);

        spoolInstance.initialize(
            msg.sender,
            address(this), 
            MIN_FEE, 
            false,
            false
        );
	
        require(spoolInstance.isInitialized(), 'ERR_INITIALIZE_SPOOL');
        emit BPoolCreated(spool, _spoolTemplate);
        emit BPoolRegistered(spool, msg.sender, block.number);
    }


    /* @dev get the spool template address
       @return the template address */
    function getBPool()
        external
        view
        returns (address)
    {
        return _spoolTemplate;
    }
}
