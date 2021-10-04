pragma solidity >=0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import './BPool.sol';
import './BConst.sol';
//import './BaseSplitCodeFactory.sol';
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
contract BFactory is BConst, Deployer {

    address public bpoolTemplate;
    address public opfCollector;

    mapping(address => bool) internal poolTemplates;
  

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
    constructor(address _bpoolTemplate, address _opfCollector, address[] memory _preCreatedPools)  public 
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
    /** 
     * @dev Deploys new BPool proxy contract.
       Template contract address could not be a zero address. 

     * @param tokens [datatokenAddress, basetokenAddress]
     * publisherAddress user which will be assigned the vested amount.
     * @param ssParams params for the ssContract. 
     * @param swapFees swapFees (swapFee, swapMarketFee,swapOceanFee), swapOceanFee will be set automatically later
       marketFeeCollector marketFeeCollector address
       
      @return address of a new proxy BPool contract 
     */
       
    function newBPool(
       // address controller, 
        address[2] memory tokens,
      //  address publisherAddress, 
        uint256[] memory ssParams,
        uint256[] memory swapFees,
     //   address marketFeeCollector,
        address[] memory addresses  //[controller,basetokenAddress,basetokenSender,publisherAddress, marketFeeCollector]
        )
        internal 
        returns (address bpool)
    {
        
        address[2] memory feeCollectors = [addresses[4],opfCollector];

        // TODO: add bpoolTemplate selection when refactoring

        bpool = deploy(bpoolTemplate);
        //address bpool = _create("");

        require(
            bpool != address(0), 
            'BFactory: invalid bpool zero address'
        );
        BPool bpoolInstance = BPool(bpool);	

        require(
            bpoolInstance.initialize(
                addresses[0],  // ss is the pool controller
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
        IssFixedRate(addresses[0]).newDataTokenCreated(  
        tokens[0],
        tokens[1],
        bpool,
        addresses[3],//publisherAddress
        ssParams);
        
        return bpool;
       

    }

     function _addPoolTemplate(address poolTemplate) internal {
        poolTemplates[poolTemplate] = true;
    }

    function _removePoolTemplate(address poolTemplate) internal {
        poolTemplates[poolTemplate] = false;
    }
}