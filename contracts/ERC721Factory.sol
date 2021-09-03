pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "./utils/Deployer.sol";
import "./interfaces/IERC721Template.sol";
import "./interfaces/IFactory.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20Template.sol";

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
    address private communityFeeCollector;
    uint256 private currentNFTCount;
    address private erc20Factory;
    address private metadata;
    uint256 private nftTemplateCount;

    struct Template {
        address templateAddress;
        bool isActive;
    }

    mapping(uint256 => Template) public nftTemplateList;

    mapping(uint256 => Template) public templateList;

    mapping(address => address) public erc721List;

    mapping(address => bool) public erc20List;

    // MAPPING BECAUSE OF MULTIPLE TYPES OF StakingContracts (FRE,DUTCH)
    mapping(address => bool) private ssContracts;

    event NFTCreated(
        address indexed newTokenAddress,
        address indexed templateAddress,
        string indexed tokenName,
        address admin
    );

    // event TokenRegistered(
    //     address indexed tokenAddress,
    //     string tokenName,
    //     string tokenSymbol,
    //     uint256 tokenCap,
    //     address indexed registeredBy,
    //     string indexed blob
    // );

    /**
     * @dev constructor
     *      Called on contract deployment. Could not be called with zero address parameters.
     * @param _template refers to the address of a deployed DataToken contract.
     * @param _collector refers to the community fee collector address
     */
    constructor(
        address _template721,
        address _template,
        address _collector,
        address _router,
        address _metadata
    ) {
        require(
            _template != address(0) &&
                _collector != address(0) &&
                _template721 != address(0) &&
                _metadata != address(0),
            "ERC721DTFactory: Invalid template token/community fee collector address"
        );
        add721TokenTemplate(_template721);
        addTokenTemplate(_template);
        router = _router;
        communityFeeCollector = _collector;
        metadata = _metadata;
    }

    function deployERC721Contract(
        string memory name,
        string memory symbol,
        bytes memory _data,
        bytes memory _flags,
        uint256 _templateIndex
    ) public returns (address token) {
        require(
            _templateIndex <= nftTemplateCount && _templateIndex != 0,
            "ERC721DTFactory: Template index doesnt exist"
        );
        Template memory tokenTemplate = nftTemplateList[_templateIndex];

        require(
            tokenTemplate.isActive == true,
            "ERC721DTFactory: ERC721Token Template disabled"
        );

        token = deploy(tokenTemplate.templateAddress);

        require(
            token != address(0),
            "ERC721DTFactory: Failed to perform minimal deploy of a new token"
        );
        //IERC20Factory(erc20Factory).addToERC721Registry(token);
        erc721List[token] = token;

        IERC721Template tokenInstance = IERC721Template(token);
        require(
            tokenInstance.initialize(
                msg.sender,
                name,
                symbol,
                metadata,
                address(this),
                _data,
                _flags
            ),
            "ERC721DTFactory: Unable to initialize token instance"
        );

        emit NFTCreated(token, tokenTemplate.templateAddress, name, msg.sender);
        // emit TokenRegistered(
        //     token,
        //     name,
        //     symbol,
        //
        //     msg.sender,
        // );
        currentNFTCount += 1;
    }

    /**
     * @dev get the current token count.
     * @return the current token count
     */
    function getCurrentNFTCount() external view returns (uint256) {
        return currentNFTCount;
    }

    /**
     * @dev get the token template address
     * @return the template struct
     */
    function getNFTTemplate(uint256 _index)
        external
        view
        returns (Template memory)
    {
        Template memory template = nftTemplateList[_index];
        return template;
    }

    // when we add a new token template is going to be activated by default (we could restrict that or give an option to choose)
    function add721TokenTemplate(address _templateAddress)
        public
        onlyOwner
        returns (uint256)
    {
        require(
            _templateAddress != address(0),
            "ERC721DTFactory: ERC721 template address(0) NOT ALLOWED"
        );
        require(isContract(_templateAddress), "ERC721Factory: NOT CONTRACT");
        nftTemplateCount += 1;
        Template memory template = Template(_templateAddress, true);
        nftTemplateList[nftTemplateCount] = template;
        return nftTemplateCount;
    }

    // function to activate a disabled token.
    function reactivate721TokenTemplate(uint256 _index) external onlyOwner {
        require(
            _index <= nftTemplateCount && _index != 0,
            "ERC721DTFactory: Template index doesnt exist"
        );
        Template storage template = nftTemplateList[_index];
        template.isActive = true;
    }

    function disable721TokenTemplate(uint256 _index) external onlyOwner {
        require(
            _index <= nftTemplateCount && _index != 0,
            "ERC721DTFactory: Template index doesnt exist"
        );
        Template storage template = nftTemplateList[_index];
        template.isActive = false;
    }

    function getCurrentNFTTemplateCount() external view returns (uint256) {
        return nftTemplateCount;
    }

    /**
     * @dev Returns true if `account` is a contract.
     *
     * [IMPORTANT]
     * ====
     * It is unsafe to assume that an address for which this function returns
     * false is an externally-owned account (EOA) and not a contract.
     *
     * Among others, `isContract` will return false for the following
     * types of addresses:
     *
     *  - an externally-owned account
     *  - a contract in construction
     *  - an address where a contract will be created
     *  - an address where a contract lived, but was destroyed
     * ====
     */
    function isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize, which returns 0 for contracts in
        // construction, since the code is only stored at the end of the
        // constructor execution.

        uint256 size;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            size := extcodesize(account)
        }
        return size > 0;
    }

    uint256 private currentTokenCount = 0;

    address public erc721Factory;
    uint256 public templateCount;
    address public router;

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
        uint256 _templateIndex,
        address minter,
        address feeManager
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

        erc20List[token] = true;

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
                msg.sender,
                cap,
                communityFeeCollector,
                minter,
                router,
                feeManager
            ),
            "ERC20Factory: Unable to initialize token instance"
        );
        emit TokenCreated(token, tokenTemplate.templateAddress, name);
        emit TokenRegistered(token, name, symbol, cap, msg.sender);

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
        require(
            _index <= templateCount && _index != 0,
            "ERC20Factory: Template index doesnt exist"
        );
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
        require(isContract(_templateAddress), "ERC20Factory: NOT CONTRACT");
        templateCount += 1;
        Template memory template = Template(_templateAddress, true);
        templateList[templateCount] = template;
        return templateCount;
    }

    function disableTokenTemplate(uint256 _index) external onlyOwner {
        Template storage template = templateList[_index];
        template.isActive = false;
    }

    // function to activate a disabled token.
    function reactivateTokenTemplate(uint256 _index) external onlyOwner {
        require(
            _index <= templateCount && _index != 0,
            "ERC20DTFactory: Template index doesnt exist"
        );
        Template storage template = templateList[_index];
        template.isActive = true;
    }

    // if templateCount is public we could remove it, or set templateCount to private
    function getCurrentTemplateCount() external view returns (uint256) {
        return templateCount;
    }
}
