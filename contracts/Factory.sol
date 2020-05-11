pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import './utils/Deployer.sol';

/**
* @title Factory contract
* @dev Contract for creation of Ocean Data Tokens
*/
contract Factory is Deployer {
    
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
     * @notice constructor
     * @param _template data token template address
     */
    constructor (
        address _template
        // address _registry
    ) 
        public 
    {
        require(
            _template != address(0), //&&
           // _registry != address(0),
            'Invalid TokenFactory initialization'
        );
        tokenTemplate = _template;
        // create tokenRegistry instance 
    }
    
    /**
     * @notice Create Data token contract proxy
     * @param _name Data token name
     * @param _symbol Data token symbol
     * @param _minter minter address
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
        
        //init Token
        bytes memory _initPayload = abi.encodeWithSignature(
                                                            'initialize(string,string,address)',
                                                            _name,
                                                            _symbol,
                                                            _minter
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