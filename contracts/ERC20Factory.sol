pragma solidity >=0.6.0;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "./utils/Deployer.sol";
import "./interfaces/IERC20Template.sol";
import "./interfaces/IERC721Template.sol";

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
contract ERC20Factory is Deployer {
    address[] public tokenTemplate;
    address private communityFeeCollector;
    uint256 private currentTokenCount = 1;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    address public erc721Factory;
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
        string indexed blob
    );

    /**
     * @dev constructor
     *      Called on contract deployment. Could not be called with zero address parameters.
     * @param _template refers to the address of a deployed DataToken contract.
     * @param _collector refers to the community fee collector address
     */
    constructor(address _template, address _collector) public {
        require(
            _template != address(0) && _collector != address(0),
            "DTFactory: Invalid template token/community fee collector address"
        );
        tokenTemplate.push(_template);
        
        //tokenTemplate = _template;
        communityFeeCollector = _collector;
    }

    /**
     * @dev Deploys new DataToken proxy contract.
     *      Template contract address could not be a zero address.
     * @param blob any string that hold data/metadata for the new token
     * @param name token name
     * @param symbol token symbol
     * @param cap the maximum total supply
     * @return token address of a new proxy DataToken contract
     */
    function createToken(
        string memory blob,
        string memory name,
        string memory symbol,
        uint256 cap,
        address from,
        uint256 templateIndex
    ) public returns (address token) {
        require(_isContract(msg.sender), "NOT CONTRACT");
        require(cap != 0, "DTFactory: zero cap is not allowed");
        
        token = deploy(getTokenTemplateAddress(templateIndex));

        require(
            token != address(0),
            "DTFactory: Failed to perform minimal deploy of a new token"
        );
        IERC20Template tokenInstance = IERC20Template(token);
        
        require(erc721List[msg.sender] == msg.sender, 'ONLY ERC721 INSTANCE FROM ERC721FACTORY');
        
        IERC721Template erc721Instance = IERC721Template(msg.sender);

        // require(
        //     erc721Instance.hasRole(MINTER_ROLE, from),
        //     "NOT MINTER_ROLE, not allowed to create"
        // );

        require(
            tokenInstance.initialize(
                name,
                symbol,
                from,
                cap,
                blob,
                communityFeeCollector
            ),
            "DTFactory: Unable to initialize token instance"
        );
        emit TokenCreated(token, tokenTemplate[0], name);
        emit TokenRegistered(token, name, symbol, cap, from, blob);
        currentTokenCount += 1;
    }

    /**
     * @dev get the current token count.
     * @return the current token count
     */
    function getCurrentTokenCount() external view returns (uint256) {
        return currentTokenCount;
    }

    /**
     * @dev get the token template address
     
     */
    function getTokenTemplateAddress(uint256 templateIndex)
        public
        view
        returns (address)
    {
        if (templateIndex >= tokenTemplate.length) {
            return address(0);
        } else return tokenTemplate[templateIndex];
    }

    function addTokenTemplate(address templateAddress)
        external
        returns (uint256 index)
    {
        require(
            templateAddress != address(0),
            "Template address cannot be zero address"
        );
        index = tokenTemplate.length;
        tokenTemplate.push(templateAddress);
    }

    function getTokenTemplateIndex(address templateAddress)
        public
        view
        returns (uint256)
    {
        uint256 index = 999999; // could be any value big enough to avoid misunderstanding

        for (uint256 i = 0; i < tokenTemplate.length; i++) {
            if (tokenTemplate[i] == templateAddress) {
                index = i;
            }
        }
        return index;
    }

    /**
     * @dev Internal function if address is contract
     */
    function _isContract(address address_) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(address_)
        }
        return size > 0;
    }

    mapping(address => address ) public erc721List;

    modifier onlyERC721Factory {   
        require(erc721Factory == msg.sender, 'ONLY ERC721FACTORY CONTRACT');
        _;
    }

    function addToERC721Registry(address ERC721address) external onlyERC721Factory {
        erc721List[ERC721address] = ERC721address;
    }
    // MISSING ONLYOWNER OR SOME KIND OF RESTRICION, COULD BE REMOVED IF WE DON"T WANT TO UPDATE IT(HARDCODED IN THE CONTRACT)
    function setERC721Factory(address _erc721FactoryAddress ) public {
            erc721Factory = _erc721FactoryAddress;
    }
}
