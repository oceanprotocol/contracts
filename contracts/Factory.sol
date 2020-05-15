pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import './utils/Deployer.sol';

/**
* @title Factory contract
* @author Ocean Protocol Team
*
* @dev Implementation of Ocean DataTokens Factory
*
*      Factory deploys DataToken proxy contracts.
*      New DataToken proxy contracts are links to the template contract's bytecode. 
*      Proxy contract functionality is based on Ocean Protocol custom implementation of ERC1167 standard.
*/
contract Factory is Deployer {

    address public feeManager;
    address public tokenTemplate;
    address public currentTokenAddress;
    
    event TokenCreated(
        address indexed newTokenAddress, 
        address indexed templateAddress,
        string indexed name
    );
    
    event TokenRemoved(
        address indexed tokenAddress,
        address indexed templateAddress,
        address indexed removedBy
    );
    
    /**
     * @dev constructor
     *      Called on contract creation. Could not be called with zero address parameters.
     * @param _template refers to the address of a deployed DataToken contract.
     * @param _feeManager refers to the address of a fee manager .
     */
    constructor (
        address _template,
        address _feeManager
        // address _registry
    ) 
        public 
    {
        require(
            _template != address(0) && _feeManager != address(0),
            // _registry != address(0),
            'Invalid TokenFactory initialization'
        );
        tokenTemplate = _template;
        feeManager = _feeManager;
        // create tokenRegistry instance 
    }

    /**
     * @dev Deploys new DataToken proxy contract.
     *      Template contract address could not be a zero address. 
     * @param _name refers to a new DataToken name.
     * @param _symbol refers to a new DataToken symbol.
     * @param _minter refers to an address that has minter rights.
     * @return address of a new proxy DataToken contract
     */
    function createToken(
        string memory _name, 
        string memory _symbol,
        address _minter
    ) 
        public
        returns (address token)
    {
        token = deploy(tokenTemplate);
        
        require(
            token != address(0),
            'Failed to perform minimal deploy of a new token'
        );
        
        //initialize DataToken with new parameters
        bytes memory _initPayload = abi.encodeWithSignature(
                                                            'initialize(string,string,address,address)',
                                                            _name,
                                                            _symbol,
                                                            _minter,
                                                            feeManager
        );

        token.call(_initPayload);

        //TODO: store Token in Token Registry
        currentTokenAddress = token;
        //TODO: fix ownership and access control
        // set Token Owner to msg.sender
        emit TokenCreated(
            token, 
            tokenTemplate,
            _name
        );
    }
}