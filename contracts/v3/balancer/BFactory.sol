pragma solidity >=0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import './BPool.sol';
import './BConst.sol';
import './BaseSplitCodeFactory.sol';
import '../../utils/Deployer.sol';
import '../../interfaces/IssFixedRate.sol';
import '../../interfaces/IERC20.sol';
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
contract BFactory is BConst, Deployer, BaseSplitCodeFactory {

    address public bpoolTemplate;
    address public opfCollector;

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
    constructor(address _bpoolTemplate, address _opfCollector, address[] memory _preCreatedPools) BaseSplitCodeFactory(type(BPool).creationCode)
        public 
    {
        require(
            _bpoolTemplate != address(0), 
            'BFactory: invalid bpool template zero address'
        );
        require(
            _opfCollector != address(0), 
            'BFactory: zero address'
        );
        bpoolTemplate = _bpoolTemplate;
        opfCollector = _opfCollector;

        if(_preCreatedPools.length > 0){
            for(uint256 i = 0; i < _preCreatedPools.length; i++){
                emit BPoolCreated(_preCreatedPools[i], msg.sender,address(0),address(0),address(0),address(0));
            }
        }
    }

    /* @dev Deploys new BPool proxy contract.
       Template contract address could not be a zero address. 
       @return address of a new proxy BPool contract */
    function newBPool(address controller, 
        address[2] memory tokens, 
     //   address basetokenAddress, 
        address publisherAddress, 
        uint256[] memory ssParams,
        uint256[] memory swapFees,
        address marketFeeCollector)
        internal 
        returns (address bpool)
    {
        
        address[2] memory feeCollectors = [marketFeeCollector,opfCollector];
       
       // bpool = deploy(bpoolTemplate);
        address bpool = _create("");

        require(
            bpool != address(0), 
            'BFactory: invalid bpool zero address'
        );
        BPool bpoolInstance = BPool(bpool);	

        require(
            bpoolInstance.initialize(
                controller,  // ss is the pool controller
                address(this), 
                swapFees,
                false,
                false,
                tokens,
                feeCollectors
            ),
            'ERR_INITIALIZE_BPOOL'
        );
        
      //  emit BPoolCreated(bpool, msg.sender,datatokenAddress,basetokenAddress,bpoolTemplate,controller);
        
        // requires approval first from basetokenSender
        
        IssFixedRate(controller).newDataTokenCreated(  
        tokens[0],
        tokens[1],
        bpool,
        publisherAddress,
        ssParams);
        
        return bpool;
       

    }
}