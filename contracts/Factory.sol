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

    address private tokenTemplate;
    uint256 private currentTokenCount = 1;
    // cap has max uint256 (2^256 -1)
    uint256 constant private cap = 
    115792089237316195423570985008687907853269984665640564039457584007913129639935;
    string constant private TOKEN_NAME_PREFIX = 'DT';

    event TokenCreated(
        address indexed newTokenAddress, 
        address indexed templateAddress,
        string indexed tokenName
    );
    
    event TokenRegistered(
        address tokenAddress,
        string tokenName,
        string tokenSymbol,
        uint256 tokenCap,
        address indexed RegisteredBy,
        uint256 indexed RegisteredAt,
        string indexed blob
    );
    
    /**
     * @dev constructor
     *      Called on contract deployment. Could not be called with zero address parameters.
     * @param _template refers to the address of a deployed DataToken contract.
     */
    constructor(
        address _template
    ) 
        public 
    {
        require(
            _template != address(0),
            'Factory: Invalid TokenFactory initialization'
        );
        tokenTemplate = _template;
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
        
        string memory name = concatenateStrings(
            TOKEN_NAME_PREFIX, 
            uintToString(currentTokenCount)
        );
        string memory symbol = name; 

        IERC20Template tokenInstance = IERC20Template(token);
        tokenInstance.initialize(
            name,
            symbol,
            msg.sender,
            cap,
            blob
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

    /**
     * @dev get the current token index. 
     * @return the current token count
     */
    function getCurrentTokenIndex()
        external
        view
        returns (uint256)
    {
        return currentTokenCount;
    }

    /**
     * @dev get the token template address
     * @return the template address
     */
    function getTokenTemplate()
        external
        view
        returns (address)
    {
        return tokenTemplate;
    }
}