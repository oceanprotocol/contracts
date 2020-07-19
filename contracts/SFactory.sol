pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import './utils/Deployer.sol';
import './utils/Converter.sol';
import './balancer/SPool.sol';
import './balancer/BConst.sol';

/*
* @title SFactory contract
* @author Ocean Protocol (with code from Balancer Labs)
*
* @dev Ocean implementation of Balancer SPool Factory
*      SFactory deploys SPool proxy contracts.
*      New SPool proxy contracts are links to the template contract's bytecode. 
*      Proxy contract functionality is based on Ocean Protocol custom
*        implementation of ERC1167 standard.
*/

contract SFactory is BConst, Deployer, Converter {

    address private _spoolTemplate;

    event SPoolCreated(
        address indexed newSPoolAddress, 
        address indexed spoolTemplateAddress
    );
    
    event SPoolRegistered(
        address spoolAddress,
        address indexed registeredBy,
        uint256 indexed registeredAt
    );
    
    /* @dev Called on contract deployment. Cannot be called with zero address.
       @param _spoolTemplate -- address of a deployed SPool contract. */
    constructor(address spoolTemplate) 
        public 
    {
        require(spoolTemplate != address(0), 'ERR_ADDRESS_0');
        _spoolTemplate = spoolTemplate;
    }

    /* @dev Deploys new SPool proxy contract.
       Template contract address could not be a zero address. 
       @return address of a new proxy SPool contract */
    function newSPool() 
        public
        returns (address spool)
    {
        spool = deploy(_spoolTemplate);
        require(spool != address(0), 'ERR_ADDRESS_0');
        
        // replace SPool with interface
        SPool spoolInstance = SPool(spool);

        spoolInstance.initialize(
            msg.sender,
            address(this), 
            MIN_FEE, 
            false,
            false
        );
	
        require(spoolInstance.isInitialized(), 'ERR_INITIALIZE_SPOOL');
        emit SPoolCreated(spool, _spoolTemplate);
        emit SPoolRegistered(spool, msg.sender, block.number);
    }


    /* @dev get the spool template address
       @return the template address */
    function getSPool()
        external
        view
        returns (address)
    {
        return _spoolTemplate;
    }
}
