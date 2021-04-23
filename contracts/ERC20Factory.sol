pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "./utils/Deployer.sol";
import "./interfaces/IERC20Template.sol";
import "./interfaces/IERC721Template.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

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
contract ERC20Factory is Deployer, Ownable {
    address private communityFeeCollector;
    uint256 private currentTokenCount = 1;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    address public erc721Factory;

    uint256 public templateCount;

    struct Template {
        address templateAddress;
        bool isActive;
    }

    mapping(uint256 => Template) public templateList;

    mapping(address => address) public erc721List;

    modifier onlyERC721Factory {
        require(erc721Factory == msg.sender, "ONLY ERC721FACTORY CONTRACT");
        _;
    }

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
        address indexed registeredBy
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
        addTokenTemplate(_template);

        //tokenTemplate = _template;
        communityFeeCollector = _collector;
    }

    /**
     * @dev Deploys new DataToken proxy contract.
     *      Template contract address could not be a zero address.

     * @param name token name
     * @param symbol token symbol
     * @param cap the maximum total supply
     * @return token address of a new proxy DataToken contract
     */
    function createToken(
        string memory name,
        string memory symbol,
        uint256 cap,
        address from,
        uint256 _templateIndex
    ) public returns (address token) {
        require(cap != 0, "ERC20Factory: zero cap is not allowed");
        require(
            _templateIndex <= templateCount && _templateIndex != 0,
            "ERC20Factory: Template index doesnt exist"
        );
        Template memory tokenTemplate = templateList[_templateIndex];

        require(
            tokenTemplate.isActive == true,
            "ERC20Factory: ERC721Token Template disabled"
        );

        token = deploy(tokenTemplate.templateAddress);

        require(
            token != address(0),
            "ERC20Factory: Failed to perform minimal deploy of a new token"
        );
        IERC20Template tokenInstance = IERC20Template(token);

        require(
            erc721List[msg.sender] == msg.sender,
            "ERC20Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
        );

        require(
            tokenInstance.initialize(
                name,
                symbol,
                from,
                cap,
                communityFeeCollector
            ),
            "ERC20Factory: Unable to initialize token instance"
        );
        emit TokenCreated(token, tokenTemplate.templateAddress, name);
        emit TokenRegistered(token, name, symbol, cap, from);
        currentTokenCount += 1;
    }

    /**
     * @dev get the current token count.
     * @return the current token count
     */
    function getCurrentTokenCount() external view returns (uint256) {
        return currentTokenCount;
    }

    function getTokenTemplate(uint256 _index)
        external
        view
        returns (Template memory)
    {
        Template memory template = templateList[_index];
        return template;
    }

    function addTokenTemplate(address _templateAddress)
        public
        onlyOwner
        returns (uint256)
    {
        require(
            _templateAddress != address(0),
            "ERC20Factory: ERC721 template address(0) NOT ALLOWED"
        );
        templateCount += 1;
        Template memory template = Template(_templateAddress, true);
        templateList[templateCount] = template;
        return templateCount;
    }

    function disableTokenTemplate(uint256 _index) external onlyOwner {
        Template storage template = templateList[_index];
        template.isActive = false;
    }

    // if templateCount is public we could remove it, or set templateCount to private
    function getCurrentTemplateCount() external view returns (uint256) {
        return templateCount;
    }

    function addToERC721Registry(address ERC721address)
        external
        onlyERC721Factory
    {
        erc721List[ERC721address] = ERC721address;
    }

    // MISSING ONLYOWNER OR SOME KIND OF RESTRICION, COULD BE REMOVED IF WE DON"T WANT TO UPDATE IT(HARDCODED IN THE CONTRACT)
    function setERC721Factory(address _erc721FactoryAddress) public {
        erc721Factory = _erc721FactoryAddress;
    }
}
