pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import './BPool.sol';
import './BConst.sol';
import '../utils/Deployer.sol';

/*
* @title BFactory contract
* @author Ocean Protocol (with code from Balancer Labs)
*
* @dev Ocean implementation of Balancer BPool Factory
*      BFactory deploys BPool proxy contracts.
*      New BPool proxy contracts are links to the template contract's bytecode.
*      Proxy contract functionality is based on Ocean Protocol custom
*        implementation of ERC1167 standard.
*/
contract BFactory is BConst, Deployer {

    address private _bpoolTemplate;

    event BPoolCreated(
        address indexed newBPoolAddress,
        address indexed bpoolTemplateAddress
    );
    
    event BPoolRegistered(
        address bpoolAddress,
        address indexed registeredBy,
        uint256 indexed registeredAt
    );
    
    /* @dev Called on contract deployment. Cannot be called with zero address.
       @param _bpoolTemplate -- address of a deployed BPool contract. */
    constructor(address bpoolTemplate)
        public 
    {
        require(bpoolTemplate != address(0), 'ERR_ADDRESS_0');
        _bpoolTemplate = bpoolTemplate;
    }

    /* @dev Deploys new BPool proxy contract.
       Template contract address could not be a zero address. 
       @return address of a new proxy BPool contract */
    function newBPool()
        public
        returns (address bpool)
    {
        bpool = deploy(_bpoolTemplate);
        require(bpool != address(0), 'ERR_ADDRESS_0');
        BPool bpoolInstance = BPool(bpool);

        bpoolInstance.initialize(
            msg.sender,
            address(this), 
            MIN_FEE, 
            false,
            false
        );
	
        require(bpoolInstance.isInitialized(), 'ERR_INITIALIZE_BPOOL');
        emit BPoolCreated(bpool, _bpoolTemplate);
        emit BPoolRegistered(bpool, msg.sender, block.number);
    }


    /* @dev get the bpool template address
       @return the template address */
    function getBPool()
        external
        view
        returns (address)
    {
        return _bpoolTemplate;
    }
}
