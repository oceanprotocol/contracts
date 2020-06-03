pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import './utils/Deployer.sol';
import './utils/Converter.sol';
import './interfaces/IERC20Template.sol';
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
contract Factory is Deployer, Converter {

    address payable private feeManager;
    address private tokenTemplate;
    uint256 private currentTokenCount = 1;
    // cap has max uint256 (2^256 -1)
    uint256 constant private cap = 
    115792089237316195423570985008687907853269984665640564039457584007913129639935;

    event TokenCreated(
        address newTokenAddress, 
        address templateAddress,
        string tokenName
    );
    
    event TokenRegistered(
        address indexed tokenAddress,
        string indexed tokenName,
        string indexed tokenSymbol,
        uint256 tokenCap,
        address RegisteredBy,
        uint256 RegisteredAt,
        string blob
    );
    
    /**
     * @dev constructor
     *      Called on contract deployment. Could not be called with zero address parameters.
     * @param _template refers to the address of a deployed DataToken contract.
     * @param _feeManager refers to the address of a fee manager .
     */
    constructor(
        address _template,
        address payable _feeManager
    ) 
        public 
    {
        require(
            _template != address(0) && _feeManager != address(0),
            'Factory: Invalid TokenFactory initialization'
        );
        tokenTemplate = _template;
        feeManager = _feeManager;
    }

    /**
     * @dev Deploys new DataToken proxy contract.
     *      Template contract address could not be a zero address. 
     * @return address of a new proxy DataToken contract
     */
    function createToken(
        string memory blob
    ) 
        public
        returns (address token)
    {

        token = deploy(tokenTemplate);
        
        require(
            token != address(0),
            'Factory: Failed to perform minimal deploy of a new token'
        );
        
        string memory name = uintToString(currentTokenCount);
        string memory symbol = uintToString(currentTokenCount); 

        IERC20Template tokenInstance = IERC20Template(token);
        tokenInstance.initialize(
            name,
            symbol,
            msg.sender,
            cap,
            blob,
            feeManager
        );

        require(
            tokenInstance.isInitialized(),
            'Factory: Unable to initialize token instance'
        );

        emit TokenCreated(
            token, 
            tokenTemplate,
            name
        );

        emit TokenRegistered(
            token,
            name,
            symbol,
            cap,
            msg.sender,
            block.number,
            blob
        );

        currentTokenCount += 1;
    }
}