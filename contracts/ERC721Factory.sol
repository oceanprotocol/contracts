pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import './utils/Deployer.sol';
import './interfaces/IERC721Template.sol';
import './interfaces/IERC20Factory.sol';
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
contract ERC721Factory is Deployer, Ownable {
    address private tokenTemplate;
    address private communityFeeCollector;
    uint256 private currentTokenCount = 1;
    address private erc20Factory;
    uint public templateCount;
    
    struct Template {
        address templateAddress;
        bool isActive;
    }

    

    mapping(uint => Template) public templateList;

    event TokenCreated(
        address indexed newTokenAddress,
        address indexed templateAddress,
        string indexed tokenName,
        address admin
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
    constructor(
        address _template,
        address _collector,
        address _erc20Factory
    ) public {
        require(
            _template != address(0) &&
            _collector != address(0) && _erc20Factory != address(0),
            'ERC721DTFactory: Invalid template token/community fee collector address'
        );
        tokenTemplate = _template;
        communityFeeCollector = _collector;
        erc20Factory = _erc20Factory;
    }

 
    function createERC721Token(
        string memory name,
        string memory symbol,
        address admin,
        address metadata,
        bytes memory _data,
        bytes memory flags
    )
        public
        returns (address token)
    {
        require(
            admin != address(0),
            'ERC721DTFactory: zero address admin not allowed'
        );

        token = deploy(tokenTemplate);

        require(
            token != address(0),
            'ERC721DTFactory: Failed to perform minimal deploy of a new token'
        );
        IERC20Factory(erc20Factory).addToERC721Registry(token);

        IERC721Template tokenInstance = IERC721Template(token);
        require(
            tokenInstance.initialize(
                admin,
                name,
                symbol,
                metadata,
                erc20Factory,
                _data,
                flags
            ),
            'DTFactory: Unable to initialize token instance'
        );
        
        emit TokenCreated(token, tokenTemplate, name,admin);
        // emit TokenRegistered(
        //     token,
        //     name,
        //     symbol,
        //
        //     msg.sender,
        // );
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
     * @return the template address
     */
    function getTokenTemplate(uint _index) external view returns (Template memory) {
        Template memory template = templateList[_index];
        return template;
    }


    function addTokenTemplate(address _templateAddress) external onlyOwner returns (uint){
           templateCount += 1;
           Template memory template = Template(_templateAddress,true);
           templateList[templateCount] = template;
           return templateCount;
    }

    function disableTokenTemplate(uint _index) external onlyOwner {
        Template storage template = templateList[_index];
        template.isActive = false;
    }

    function getCurrentTemplateCount() external view returns (uint256) {
        return templateCount;
    }
    receive() external payable{

    }
}
