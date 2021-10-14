pragma solidity >=0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "../../interfaces/IERC20Template.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "hardhat/console.sol";

/**
 * @title FixedRateExchange CONTRACT modified to be used as a Dispenser (rate = 0 and no base token transfer)
 * @dev Dispenser is a fixed rate exchange Contract with rate = 0
 *
 */

// TODO: add maximum number of DT per user or per transaction, in any case set a limit.

contract Dispenser {
    using SafeMath for uint256;
    uint256 private constant BASE = 10**18;

    address public router;
    address public opfCollector;

    struct Exchange {
        bool active;
        address exchangeOwner;
        address dataToken;
        uint256 dtDecimals;
    }

    // maps an exchangeId to an exchange
    mapping(bytes32 => Exchange) private exchanges;
    bytes32[] private exchangeIds;

    modifier onlyActiveExchange(bytes32 exchangeId) {
        require(
            //exchanges[exchangeId].fixedRate != 0 &&
            exchanges[exchangeId].active == true,
            "Dispenser: Exchange does not exist!"
        );
        _;
    }

    modifier onlyExchangeOwner(bytes32 exchangeId) {
        require(
            exchanges[exchangeId].exchangeOwner == msg.sender,
            "Dispenser: invalid exchange owner"
        );
        _;
    }

    modifier onlyRouter() {
        require(msg.sender == router, "Dispenser: only router");
        _;
    }

    event ExchangeCreated(
        bytes32 indexed exchangeId,
        address indexed dataToken,
        address exchangeOwner
    );

    event ExchangeActivated(
        bytes32 indexed exchangeId,
        address indexed exchangeOwner
    );

    event ExchangeDeactivated(
        bytes32 indexed exchangeId,
        address indexed exchangeOwner
    );

    event TokenDispensed(
        bytes32 indexed exchangeId,
        address indexed by,
        uint256 dataTokenSwappedAmount
    );

    constructor(address _router) {
        require(_router != address(0), "Dispenser: Wrong Router address");
        router = _router;
       
    }

    /**
     * @dev create
     *      creates new exchange pairs between base token
     *      (ocean token) and data tokens.
     baseToken refers to a ocean token contract address
     * @param dataToken refers to a data token contract address
     */
    function createWithDecimals(
        address dataToken,
        address[] memory addresses, // [owner]
        uint256[] memory uints // [dataTokenDecimals]
    ) external onlyRouter returns (bytes32 exchangeId) {
        require(addresses[0] != address(0), "Dispenser: OWNER REQUIRED");
        require(
            dataToken != address(0),
            "Dispenser: Invalid datatoken,  zero address"
        );

        exchangeId = generateExchangeId(dataToken, addresses[0]);
        require(
            exchanges[exchangeId].active == false,
            "Dispenser: Exchange already exists!"
        );

        exchanges[exchangeId] = Exchange({
            active: true,
            exchangeOwner: addresses[0],
            dataToken: dataToken,
            dtDecimals: uints[0]
        });

        exchangeIds.push(exchangeId);

        emit ExchangeCreated(exchangeId, dataToken, addresses[0]);

        emit ExchangeActivated(exchangeId, addresses[0]);
    }

    /**
     * @dev generateExchangeId
     *      creates unique exchange identifier for two token pairs.
     * @param dataToken refers to a data token contract address
     * @param exchangeOwner exchange owner address
     */
    function generateExchangeId(address dataToken, address exchangeOwner)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(dataToken, exchangeOwner));
    }

    /**
     * @dev get DT
     * @param exchangeId a unique exchange idnetifier
     * @param dataTokenAmount the amount of data tokens to be exchanged
     */
    function getDT(bytes32 exchangeId, uint256 dataTokenAmount)
        external
        onlyActiveExchange(exchangeId)
    {
        require(dataTokenAmount != 0, "Dispenser: zero data token amount");
        // TODO: add a maximum amount per user or per transaction
        //require(dataTokenAmount < 10**20); // 100 tokens

        require(
            IERC20Template(exchanges[exchangeId].dataToken).transferFrom(
                exchanges[exchangeId].exchangeOwner,
                msg.sender,
                dataTokenAmount
            ),
            "Dispenser: transferFrom failed in the dataToken contract"
        );

        emit TokenDispensed(exchangeId, msg.sender, dataTokenAmount);
    }

    /**
     * @dev getNumberOfExchanges
     *      gets the total number of registered exchanges
     * @return total number of registered exchange IDs
     */
    function getNumberOfExchanges() external view returns (uint256) {
        return exchangeIds.length;
    }

    /**
     * @dev toggleExchangeState
     *      toggles the active state of an existing exchange
     * @param exchangeId a unique exchange idnetifier
     */
    function toggleExchangeState(bytes32 exchangeId)
        external
        onlyExchangeOwner(exchangeId)
    {
        if (exchanges[exchangeId].active) {
            exchanges[exchangeId].active = false;
            emit ExchangeDeactivated(exchangeId, msg.sender);
        } else {
            exchanges[exchangeId].active = true;
            emit ExchangeActivated(exchangeId, msg.sender);
        }
    }

    /**
     * @dev getSupply
     *      gets the current supply of datatokens in an fixed
     *      rate exchagne
     * @param  exchangeId the exchange ID
     * @return supply
     */
    function getDTSupply(bytes32 exchangeId)
        public
        view
        returns (uint256 supply)
    {
        if (exchanges[exchangeId].active == false) supply = 0;
        else {
            uint256 balance = IERC20Template(exchanges[exchangeId].dataToken)
                .balanceOf(exchanges[exchangeId].exchangeOwner);
            uint256 allowance = IERC20Template(exchanges[exchangeId].dataToken)
                .allowance(exchanges[exchangeId].exchangeOwner, address(this));
            if (balance < allowance)
                supply = balance;
            else supply = allowance;
        }
    }

    // /**
    //  * @dev getExchange
    //  *      gets all the exchange details
    //  * @param exchangeId a unique exchange idnetifier
    //  * @return all the exchange details including  the exchange Owner
    //  *         the dataToken contract address, the base token address, the
    //  *         fixed rate, whether the exchange is active and the supply or the
    //  *         the current data token liquidity.
    //  */
    function getExchange(bytes32 exchangeId)
        external
        view
        returns (
            address exchangeOwner,
            address dataToken,
            uint256 dtDecimals,
            bool active,
            uint256 dtSupply
        )
    {
        Exchange memory exchange = exchanges[exchangeId];
        exchangeOwner = exchange.exchangeOwner;
        dataToken = exchange.dataToken;
        dtDecimals = exchange.dtDecimals;
        active = exchange.active;
        dtSupply = getDTSupply(exchangeId);
    }

    /**
     * @dev getExchanges
     *      gets all the exchanges list
     * @return a list of all registered exchange Ids
     */
    function getExchanges() external view returns (bytes32[] memory) {
        return exchangeIds;
    }

    /**
     * @dev isActive
     *      checks whether exchange is active
     * @param exchangeId a unique exchange idnetifier
     * @return true if exchange is true, otherwise returns false
     */
    function isActive(bytes32 exchangeId) external view returns (bool) {
        return exchanges[exchangeId].active;
    }
}
