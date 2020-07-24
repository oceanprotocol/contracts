pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import './utils/Deployer.sol';
import './utils/Converter.sol';
import './interfaces/IERC20Template.sol';
import './interfaces/IFPLP.sol';

/**
 * @title DTFactory contract
 * @author Ocean Protocol Team
 *
 * @dev Implementation of Ocean DataTokens Factory
 *
 *      DTFactory deploys DataToken proxy contracts.
 *      New DataToken proxy contracts are links to the template contract's bytecode.
 *      Proxy contract functionality is based on Ocean Protocol custom implementation of ERC1167 standard.
 */
contract DTFactory is Deployer, Converter {
    address private tokenTemplate;
    address private fplpTemplate;

    uint256 private currentTokenCount = 1;
    // cap has max uint256 (2^256 -1)
    uint256
    private constant cap = 115792089237316195423570985008687907853269984665640564039457584007913129639935;
    string private constant TOKEN_NAME_PREFIX = 'DT';

    event TokenCreated(
        address indexed newTokenAddress,
        address indexed templateAddress,
        string indexed tokenName
    );

    event TokenRegistered(
        address indexed tokenAddress,
        string tokenName,
        string tokenSymbol,
        uint256 tokenCap,
        address indexed registeredBy,
        uint256 registeredAt,
        string indexed blob
    );

    event FPLPCreated(
        address indexed FPLPAddress,
        address indexed basetoken,
        address indexed datatoken,
        uint256 ratio
    );

    /**
     * @dev constructor
     *      Called on contract deployment. Could not be called with zero address parameters.
     * @param _template refers to the address of a deployed DataToken contract.
     */
    constructor(address _template, address _fplp) public {
        require(
            _template != address(0) && _fplp != address(0),
            'DTFactory: Invalid token factory initialization'
        );
        tokenTemplate = _template;
        fplpTemplate = _fplp;
    }

    /**
     * @dev Deploys new DataToken proxy contract.
     *      Template contract address could not be a zero address.
     * @return address of a new proxy DataToken contract
     */
    function createToken(string memory blob) public returns (address token) {
        token = deploy(tokenTemplate);

        require(
            token != address(0),
            'DTFactory: Failed to perform minimal deploy of a new token'
        );

        string memory name = concatenateStrings(
            TOKEN_NAME_PREFIX,
            uintToString(currentTokenCount)
        );
        string memory symbol = name;

        IERC20Template tokenInstance = IERC20Template(token);
        tokenInstance.initialize(name, symbol, msg.sender, cap, blob);

        require(
            tokenInstance.isInitialized(),
            'DTFactory: Unable to initialize token instance'
        );

        emit TokenCreated(token, tokenTemplate, name);

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
    function getCurrentTokenIndex() external view returns (uint256) {
        return currentTokenCount;
    }

    /**
     * @dev get the token template address
     * @return the template address
     */
    function getTokenTemplate() external view returns (address) {
        return tokenTemplate;
    }

    /**
     * @dev Deploys new FPLP proxy contract.
     * @param _lpAddress address that is providing liquidity (usually datatoken minter)
     * @param _basetoken base token address
     * @param _datatoken data token address
     * @param _ratio exchange rate (IE: How many basetokens are required to get a DataToken)
     * @return address of a new proxy DataToken contract
     */
    function createFPLP(
        address _lpAddress,
        address _basetoken,
        address _datatoken,
        uint256 _ratio
    ) public returns (address FPLPAddress) {
        require(_lpAddress != address(0), 'Factory: Invalid LP,  zero address');
        require(
            _basetoken != address(0),
            'Factory: Invalid basetoken,  zero address'
        );
        require(
            _datatoken != address(0),
            'Factory: Invalid datatoken,  zero address'
        );
        require(
            _basetoken != _datatoken,
            'Factory: Invalid datatoken,  equals basetoken'
        );
        require(_ratio > 0, 'Factory: Invalid ratio value');

        FPLPAddress = deploy(fplpTemplate);

        require(
            FPLPAddress != address(0),
            'Factory: Failed to perform minimal deploy of a new FPLP'
        );

        IFPLP fplpInstance = IFPLP(FPLPAddress);
        fplpInstance.initialize(_lpAddress, _basetoken, _datatoken, _ratio);

        require(
            fplpInstance.isInitialized(),
            'Factory: Unable to initialize fplp instance'
        );

        emit FPLPCreated(FPLPAddress, _basetoken, _datatoken, _ratio);
    }
}
