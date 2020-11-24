pragma solidity 0.5.7;
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

    address public bpoolTemplate;

    event BPoolCreated(
        address indexed newBPoolAddress,
        address indexed registeredBy,
        address indexed datatokenAddress,
        address basetokenAddress,
        address bpoolTemplateAddress,
        address ssAddress
    );
    
    
    /* @dev Called on contract deployment. Cannot be called with zero address.
       @param _bpoolTemplate -- address of a deployed BPool contract. 
       @param _preCreatedPools list of pre-created pools. It can be only used in case of migration from an old factory contract.
    */
    constructor(address _bpoolTemplate, address[] memory _preCreatedPools)
        public 
    {
        require(
            _bpoolTemplate != address(0), 
            'BFactory: invalid bpool template zero address'
        );
        bpoolTemplate = _bpoolTemplate;
        if(_preCreatedPools.length > 0){
            for(uint256 i = 0; i < _preCreatedPools.length; i++){
                emit BPoolCreated(_preCreatedPools[i], msg.sender,address(0),address(0),address(0),address(0));
            }
        }
    }

    /* @dev Deploys new BPool proxy contract.
       Template contract address could not be a zero address. 
       @return address of a new proxy BPool contract */
    function newBPool(address datatokenAddress,address basetokenAddress, address ssAddress,uint256 burnInEndBlock)
        external
        returns (address bpool)
    {
        bpool = deploy(bpoolTemplate);
        require(
            bpool != address(0), 
            'BFactory: invalid bpool zero address'
        );
        BPool bpoolInstance = BPool(bpool);	
        require(
            bpoolInstance.initialize(
                ssAddress,  // ss is the pool controller
                address(this), 
                MIN_FEE, 
                false,
                false,
                datatokenAddress,
                basetokenAddress,
                burnInEndBlock
            ),
            'ERR_INITIALIZE_BPOOL'
        );
        
        emit BPoolCreated(bpool, msg.sender,datatokenAddress,basetokenAddress,bpoolTemplate,ssAddress);
    }
}
