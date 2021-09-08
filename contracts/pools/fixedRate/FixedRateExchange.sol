pragma solidity >=0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "../../interfaces/IERC20Template.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "hardhat/console.sol";

/**
 * @title FixedRateExchange
 * @dev FixedRateExchange is a fixed rate exchange Contract
 *      Marketplaces uses this contract to allow consumers
 *      exchanging datatokens with ocean token using a fixed
 *      exchange rate.
 */



contract FixedRateExchange {
    using SafeMath for uint256;
    uint256 private constant BASE = 10**18;

    address public router;
    address public opfCollector;

    struct Exchange {
        bool active;
        address exchangeOwner;
        address dataToken;
        address baseToken;
        uint256 fixedRate;
        uint8 dtDecimals;
        uint8 btDecimals;
        uint256 dtBalance;
        uint256 btBalance;
        uint256 marketFee;
        address marketFeeCollector;
        uint256 opfFee;
        uint256 marketFeeAvailable;
        uint256 oceanFeeAvailable;
    }

    // maps an exchangeId to an exchange
    mapping(bytes32 => Exchange) private exchanges;
    bytes32[] private exchangeIds;

    modifier onlyActiveExchange(bytes32 exchangeId) {
        require(
            exchanges[exchangeId].fixedRate != 0 &&
                exchanges[exchangeId].active == true,
            "FixedRateExchange: Exchange does not exist!"
        );
        _;
    }

    modifier onlyExchangeOwner(bytes32 exchangeId) {
        require(
            exchanges[exchangeId].exchangeOwner == msg.sender,
            "FixedRateExchange: invalid exchange owner"
        );
        _;
    }

    modifier onlyRouter() {
        require(msg.sender == router, "FixedRateExchange: only router");
        _;
    }

    event ExchangeCreated(
        bytes32 indexed exchangeId,
        address indexed baseToken,
        address indexed dataToken,
        address exchangeOwner,
        uint256 fixedRate
    );

    event ExchangeRateChanged(
        bytes32 indexed exchangeId,
        address indexed exchangeOwner,
        uint256 newRate
    );

    event ExchangeActivated(
        bytes32 indexed exchangeId,
        address indexed exchangeOwner
    );

    event ExchangeDeactivated(
        bytes32 indexed exchangeId,
        address indexed exchangeOwner
    );

    event Swapped(
        bytes32 indexed exchangeId,
        address indexed by,
        uint256 baseTokenSwappedAmount,
        uint256 dataTokenSwappedAmount,
        address tokenOutAddress,
        uint256 marketFeeAmount,
        uint256 oceanFeeAmount
    );

    event TokenCollected(
        bytes32 indexed exchangeId,
        address indexed to,
        address indexed token,
        uint256 amount
    );

    event OceanFeeCollected(
        bytes32 indexed exchangeId,
        address indexed feeToken,
        uint256 feeAmount
    );
    event MarketFeeCollected(
        bytes32 indexed exchangeId,
        address indexed feeToken,
        uint256 feeAmount
    );

    constructor(address _router, address _opfCollector) {
        require(_router != address(0), "FixedRateExchange: Wrong Router address");
        require(_opfCollector != address(0), "FixedRateExchange: Wrong OPF address");
        router = _router;
        opfCollector = _opfCollector;
    }

  

    /**
     * @dev create
     *      creates new exchange pairs between base token
     *      (ocean token) and data tokens.
     * @param baseToken refers to a ocean token contract address
     * @param dataToken refers to a data token contract address
     * @param fixedRate refers to the exact fixed exchange rate in wei
     */
    function createWithDecimals(
        address baseToken,
        address dataToken,
        uint8 _btDecimals,
        uint8 _dtDecimals,
        uint256 fixedRate,
        address owner,
        uint256 marketFee,
        address marketFeeCollector,
        uint256 opfFee
    ) external onlyRouter returns (bytes32 exchangeId) {
        require(
            baseToken != address(0),
            "FixedRateExchange: Invalid basetoken,  zero address"
        );
        require(
            dataToken != address(0),
            "FixedRateExchange: Invalid datatoken,  zero address"
        );
        require(
            baseToken != dataToken,
            "FixedRateExchange: Invalid datatoken,  equals basetoken"
        );
        require(
            fixedRate != 0,
            "FixedRateExchange: Invalid exchange rate value"
        );
        exchangeId = generateExchangeId(baseToken, dataToken, owner);
        require(
            exchanges[exchangeId].fixedRate == 0,
            "FixedRateExchange: Exchange already exists!"
        );
        exchanges[exchangeId] = Exchange({
            active: true,
            exchangeOwner: owner,
            dataToken: dataToken,
            baseToken: baseToken,
            fixedRate: fixedRate,
            dtDecimals: _dtDecimals,
            btDecimals: _btDecimals,
            dtBalance: 0,
            btBalance: 0,
            marketFee: marketFee,
            marketFeeCollector: marketFeeCollector,
            opfFee: opfFee,
            marketFeeAvailable: 0,
            oceanFeeAvailable: 0
        });

        exchangeIds.push(exchangeId);

        emit ExchangeCreated(
            exchangeId,
            baseToken,
            dataToken,
            owner,
            fixedRate
        );

        emit ExchangeActivated(exchangeId, owner);
    }

    /**
     * @dev generateExchangeId
     *      creates unique exchange identifier for two token pairs.
     * @param baseToken refers to a ocean token contract address
     * @param dataToken refers to a data token contract address
     * @param exchangeOwner exchange owner address
     */
    function generateExchangeId(
        address baseToken,
        address dataToken,
        address exchangeOwner
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(baseToken, dataToken, exchangeOwner));
    }

    /**
     * @dev CalcInGivenOut
     *      Calculates how many basetokens are needed to get specifyed amount of datatokens
     * @param exchangeId a unique exchange idnetifier
     * @param dataTokenAmount the amount of data tokens to be exchanged
     */
    function calcBaseInGivenOutDT(bytes32 exchangeId, uint256 dataTokenAmount)
        public
        view
        onlyActiveExchange(exchangeId)
        returns (
            uint256 baseTokenAmount,
            uint256 baseTokenAmountBeforeFee,
            uint256 oceanFeeAmount,
            uint256 marketFeeAmount
        )
    {
        baseTokenAmountBeforeFee = dataTokenAmount
            .mul(exchanges[exchangeId].fixedRate)
            .div(BASE)
            .mul(10**exchanges[exchangeId].btDecimals)
            .div(10**exchanges[exchangeId].dtDecimals);

      
        oceanFeeAmount;
        if (exchanges[exchangeId].opfFee != 0) {
            oceanFeeAmount = baseTokenAmountBeforeFee
                .mul(exchanges[exchangeId].opfFee)
                .div(BASE);
        }
        console.log(oceanFeeAmount, "oceanFeeAmount");
        marketFeeAmount = baseTokenAmountBeforeFee
            .mul(exchanges[exchangeId].marketFee)
            .div(BASE);

        console.log(marketFeeAmount, "marketFeeAmount");
        baseTokenAmount = baseTokenAmountBeforeFee.add(marketFeeAmount).add(
            oceanFeeAmount
        );
        console.log(baseTokenAmount, "basetokenamount");
        console.log(baseTokenAmountBeforeFee, "basetokenamount before fee");
    }

    /**
     * @dev CalcInGivenOut
     *      Calculates how many basetokens are needed to get specifyed amount of datatokens
     * @param exchangeId a unique exchange idnetifier
     * @param dataTokenAmount the amount of data tokens to be exchanged
     */
    function calcBaseOutGivenInDT(bytes32 exchangeId, uint256 dataTokenAmount)
        public
        view
        onlyActiveExchange(exchangeId)
        returns (
            uint256 baseTokenAmount,
            uint256 baseTokenAmountBeforeFee,
            uint256 oceanFeeAmount,
            uint256 marketFeeAmount
        )
    {
        baseTokenAmountBeforeFee = dataTokenAmount
            .mul(exchanges[exchangeId].fixedRate)
            .div(BASE)
            .mul(10**exchanges[exchangeId].btDecimals)
            .div(10**exchanges[exchangeId].dtDecimals);

       
        oceanFeeAmount;
        if (exchanges[exchangeId].opfFee != 0) {
            oceanFeeAmount = baseTokenAmountBeforeFee
                .mul(exchanges[exchangeId].opfFee)
                .div(BASE);
        }
        console.log(oceanFeeAmount, "oceanfeeamount");
        marketFeeAmount = baseTokenAmountBeforeFee
            .mul(exchanges[exchangeId].marketFee)
            .div(BASE);

        console.log(marketFeeAmount, "marketFeeAmount");
        baseTokenAmount = baseTokenAmountBeforeFee.sub(marketFeeAmount).sub(
            oceanFeeAmount
        );
        console.log(baseTokenAmount, "basetokenamount");
        console.log(baseTokenAmountBeforeFee, "basetokenamount before fee");
        //console.log(baseTokenAmount, "baseAmount solidity");
    }

    /**
     * @dev swap
     *      atomic swap between two registered fixed rate exchange.
     * @param exchangeId a unique exchange idnetifier
     * @param dataTokenAmount the amount of data tokens to be exchanged
     */
    function buyDT(bytes32 exchangeId, uint256 dataTokenAmount)
        external
        onlyActiveExchange(exchangeId)
    {
        require(
            dataTokenAmount != 0,
            "FixedRateExchange: zero data token amount"
        );
        (
            uint256 baseTokenAmount,
            uint256 baseTokenAmountBeforeFee,
            uint256 oceanFeeAmount,
            uint256 marketFeeAmount
        ) = calcBaseInGivenOutDT(exchangeId, dataTokenAmount);

        // we account fees , fees are always collected in basetoken
        exchanges[exchangeId].oceanFeeAvailable = exchanges[exchangeId]
            .oceanFeeAvailable
            .add(oceanFeeAmount);
        exchanges[exchangeId].marketFeeAvailable = exchanges[exchangeId]
            .marketFeeAvailable
            .add(marketFeeAmount);
        require(
            IERC20Template(exchanges[exchangeId].baseToken).transferFrom(
                msg.sender,
                address(this), // we send basetoken to this address, then exchange owner can withdraw
                baseTokenAmount
            ),
            "FixedRateExchange: transferFrom failed in the baseToken contract"
        );

        exchanges[exchangeId].btBalance = (exchanges[exchangeId].btBalance).add(
            baseTokenAmountBeforeFee
        );

        if (dataTokenAmount > exchanges[exchangeId].dtBalance) {
            require(
                IERC20Template(exchanges[exchangeId].dataToken).transferFrom(
                    exchanges[exchangeId].exchangeOwner,
                    msg.sender,
                    dataTokenAmount
                ),
                "FixedRateExchange: transferFrom failed in the dataToken contract"
            );
        } else {
            exchanges[exchangeId].dtBalance = (exchanges[exchangeId].dtBalance)
                .sub(dataTokenAmount);
            IERC20Template(exchanges[exchangeId].dataToken).transfer(
                msg.sender,
                dataTokenAmount
            );
        }

        emit Swapped(
            exchangeId,
            msg.sender,
            baseTokenAmount,
            dataTokenAmount,
            exchanges[exchangeId].dataToken,
            marketFeeAmount,
            oceanFeeAmount
        );
    }

    /**
     * @dev swap
     *      atomic swap between two registered fixed rate exchange.
     * @param exchangeId a unique exchange idnetifier
     * @param dataTokenAmount the amount of data tokens to be exchanged
     */
    function sellDT(bytes32 exchangeId, uint256 dataTokenAmount)
        external
        onlyActiveExchange(exchangeId)
    {
        require(
            dataTokenAmount != 0,
            "FixedRateExchange: zero data token amount"
        );
        (
            uint256 baseTokenAmount,
            uint256 baseTokenAmountBeforeFee,
            uint256 oceanFeeAmount,
            uint256 marketFeeAmount
        ) = calcBaseOutGivenInDT(exchangeId, dataTokenAmount);

        // we account fees , fees are always collected in basetoken
        exchanges[exchangeId].oceanFeeAvailable = exchanges[exchangeId]
            .oceanFeeAvailable
            .add(oceanFeeAmount);
        exchanges[exchangeId].marketFeeAvailable = exchanges[exchangeId]
            .marketFeeAvailable
            .add(marketFeeAmount);
        require(
            IERC20Template(exchanges[exchangeId].dataToken).transferFrom(
                msg.sender,
                address(this),
                dataTokenAmount
            ),
            "FixedRateExchange: transferFrom failed in the dataToken contract"
        );

        exchanges[exchangeId].dtBalance = (exchanges[exchangeId].dtBalance).add(
            dataTokenAmount
        );

        if (baseTokenAmount > exchanges[exchangeId].btBalance) {
            require(
                IERC20Template(exchanges[exchangeId].baseToken).transferFrom(
                    exchanges[exchangeId].exchangeOwner,
                    msg.sender,
                    baseTokenAmount
                ),
                "FixedRateExchange: transferFrom failed in the baseToken contract"
            );
        } else {
            exchanges[exchangeId].btBalance = (exchanges[exchangeId].btBalance)
                .sub(baseTokenAmountBeforeFee);
            IERC20Template(exchanges[exchangeId].baseToken).transfer(
                msg.sender,
                baseTokenAmount
            );
        }

        emit Swapped(
            exchangeId,
            msg.sender,
            baseTokenAmount,
            dataTokenAmount,
            exchanges[exchangeId].baseToken,
            marketFeeAmount,
            oceanFeeAmount
        );
    }

    function collectBT(bytes32 exchangeId)
        external
        onlyExchangeOwner(exchangeId)
    {
        uint256 amount = exchanges[exchangeId].btBalance;
        exchanges[exchangeId].btBalance = 0;
        IERC20Template(exchanges[exchangeId].baseToken).transfer(
            exchanges[exchangeId].exchangeOwner,
            amount
        );

        emit TokenCollected(
            exchangeId,
            exchanges[exchangeId].exchangeOwner,
            exchanges[exchangeId].baseToken,
            amount
        );
    }

    function collectDT(bytes32 exchangeId)
        external
        onlyExchangeOwner(exchangeId)
    {
        uint256 amount = exchanges[exchangeId].dtBalance;
        exchanges[exchangeId].dtBalance = 0;
        IERC20Template(exchanges[exchangeId].dataToken).transfer(
            exchanges[exchangeId].exchangeOwner,
            amount
        );

        emit TokenCollected(
            exchangeId,
            exchanges[exchangeId].exchangeOwner,
            exchanges[exchangeId].dataToken,
            amount
        );
    }

    function collectMarketFee(bytes32 exchangeId) external {
        // TODO: should we limit access to this function?
        uint256 amount = exchanges[exchangeId].marketFeeAvailable;
        exchanges[exchangeId].marketFeeAvailable = 0;
        IERC20Template(exchanges[exchangeId].baseToken).transfer(
            exchanges[exchangeId].marketFeeCollector,
            amount
        );
        emit MarketFeeCollected(
            exchangeId,
            exchanges[exchangeId].baseToken,
            amount
        );
    }

    function collectOceanFee(bytes32 exchangeId) external {
        // TODO:should we limit access to this function?
        uint256 amount = exchanges[exchangeId].oceanFeeAvailable;
        exchanges[exchangeId].oceanFeeAvailable = 0;
        IERC20Template(exchanges[exchangeId].baseToken).transfer(
            opfCollector,
            amount
        );
        emit OceanFeeCollected(
            exchangeId,
            exchanges[exchangeId].baseToken,
            amount
        );
    }

    function updateMarketFeeCollector(
        bytes32 exchangeId,
        address _newMarketCollector
    ) external {
        require(
            msg.sender == exchanges[exchangeId].marketFeeCollector,
            "not marketFeeCollector"
        );
        exchanges[exchangeId].marketFeeCollector = _newMarketCollector;
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
     * @dev setRate
     *      changes the fixed rate for an exchange with a new rate
     * @param exchangeId a unique exchange idnetifier
     * @param newRate new fixed rate value
     */
    function setRate(bytes32 exchangeId, uint256 newRate)
        external
        onlyExchangeOwner(exchangeId)
    {
        require(newRate != 0, "FixedRateExchange: Ratio must be >0");

        exchanges[exchangeId].fixedRate = newRate;
        emit ExchangeRateChanged(exchangeId, msg.sender, newRate);
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
     * @dev getRate
     *      gets the current fixed rate for an exchange
     * @param exchangeId a unique exchange idnetifier
     * @return fixed rate value
     */
    function getRate(bytes32 exchangeId) external view returns (uint256) {
        return exchanges[exchangeId].fixedRate;
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
                supply = balance.add(exchanges[exchangeId].dtBalance);
            else supply = allowance.add(exchanges[exchangeId].dtBalance);
        }
    }

    /**
     * @dev getSupply
     *      gets the current supply of datatokens in an fixed
     *      rate exchagne
     * @param  exchangeId the exchange ID
     * @return supply
     */
    function getBTSupply(bytes32 exchangeId)
        public
        view
        returns (uint256 supply)
    {
        if (exchanges[exchangeId].active == false) supply = 0;
        else {
            uint256 balance = IERC20Template(exchanges[exchangeId].baseToken)
                .balanceOf(exchanges[exchangeId].exchangeOwner);
            uint256 allowance = IERC20Template(exchanges[exchangeId].baseToken)
                .allowance(exchanges[exchangeId].exchangeOwner, address(this));
            if (balance < allowance)
                supply = balance.add(exchanges[exchangeId].btBalance);
            else supply = allowance.add(exchanges[exchangeId].btBalance);
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
            uint8 dtDecimals,
            address baseToken,
            uint8 btDecimals,
            uint256 fixedRate,
            bool active,
            uint256 dtSupply,
            uint256 btSupply,
            uint256 dtBalance,
            uint256 btBalance
        )
    {
        Exchange memory exchange = exchanges[exchangeId];
        exchangeOwner = exchange.exchangeOwner;
        dataToken = exchange.dataToken;
        dtDecimals = exchange.dtDecimals;
        baseToken = exchange.baseToken;
        btDecimals = exchange.btDecimals;
        fixedRate = exchange.fixedRate;
        active = exchange.active;
        dtSupply = getDTSupply(exchangeId);
        btSupply = getBTSupply(exchangeId);
        dtBalance = exchange.dtBalance;
        btBalance = exchange.btBalance;
    }

    function getFeesInfo(bytes32 exchangeId)
        external
        view
        returns (
            uint256 marketFee,
            address marketFeeCollector,
            uint256 opfFee,
            uint256 marketFeeAvailable,
            uint256 oceanFeeAvailable
        )
    {
        Exchange memory exchange = exchanges[exchangeId];
        marketFee = exchange.marketFee;
        marketFeeCollector = exchange.marketFeeCollector;
        opfFee = exchange.opfFee;
        marketFeeAvailable = exchange.marketFeeAvailable;
        oceanFeeAvailable = exchange.oceanFeeAvailable;
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
