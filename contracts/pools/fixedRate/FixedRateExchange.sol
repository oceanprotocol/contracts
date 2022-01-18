pragma solidity 0.8.10;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0
import "../../interfaces/IERC20.sol";
import "../../interfaces/IERC20Template.sol";
import "../../interfaces/IFactoryRouter.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../../utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title FixedRateExchange
 * @dev FixedRateExchange is a fixed rate exchange Contract
 *      Marketplaces uses this contract to allow consumers
 *      exchanging datatokens with ocean token using a fixed
 *      exchange rate.
 */



contract FixedRateExchange is ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    uint256 private constant BASE = 10**18;

    address public router;
    address public opfCollector;

    struct Exchange {
        bool active;
        address exchangeOwner;
        address datatoken;
        address basetoken;
        uint256 fixedRate;
        uint256 dtDecimals;
        uint256 btDecimals;
        uint256 dtBalance;
        uint256 btBalance;
        uint256 marketFee;
        address marketFeeCollector;
        uint256 marketFeeAvailable;
        uint256 oceanFeeAvailable;
        bool withMint;
        address allowedSwapper;
    }

    // maps an exchangeId to an exchange
    mapping(bytes32 => Exchange) private exchanges;
    bytes32[] private exchangeIds;

    modifier onlyActiveExchange(bytes32 exchangeId) {
        require(
            //exchanges[exchangeId].fixedRate != 0 &&
                exchanges[exchangeId].active,
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
        address indexed basetoken,
        address indexed datatoken,
        address exchangeOwner,
        uint256 fixedRate
    );

    event ExchangeRateChanged(
        bytes32 indexed exchangeId,
        address indexed exchangeOwner,
        uint256 newRate
    );

    //triggered when the withMint state is changed 
    event ExchangeMintStateChanged(
        bytes32 indexed exchangeId,
        address indexed exchangeOwner,
        bool withMint
    );
    
    event ExchangeActivated(
        bytes32 indexed exchangeId,
        address indexed exchangeOwner
    );

    event ExchangeDeactivated(
        bytes32 indexed exchangeId,
        address indexed exchangeOwner
    );

    event ExchangeAllowedSwapperChanged(
        bytes32 indexed exchangeId,
        address indexed allowedSwapper
    );
    
    event Swapped(
        bytes32 indexed exchangeId,
        address indexed by,
        uint256 basetokenSwappedAmount,
        uint256 datatokenSwappedAmount,
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
     * @dev getId
     *      Return template id in case we need different ABIs. 
     *      If you construct your own template, please make sure to change the hardcoded value
     */
    function getId() pure public returns (uint8) {
        return 1;
    }
    
    function getOPFFee(address basetokenAddress) public view returns (uint) {
        return IFactoryRouter(router).getOPFFee(basetokenAddress);
    }
  

    /**
     * @dev create
     *      creates new exchange pairs between base token
     *      (ocean token) and data tokens.
     * datatoken refers to a data token contract address
     * addresses  - array of addresses with the following struct:
     *                [0] - basetoken
     *                [1] - owner
     *                [2] - marketFeeCollector
     *                [3] - allowedSwapper - if != address(0), only that is allowed to swap (used for ERC20Enterprise)
     * uints  - array of uints with the following struct:
     *                [0] - basetokenDecimals
     *                [1] - datatokenDecimals
     *                [2] - fixedRate
     *                [3] - marketFee
     *                [4] - withMint
     */
    function createWithDecimals(
        address datatoken,
        address[] memory addresses, 
        uint256[] memory uints 
    ) external onlyRouter returns (bytes32 exchangeId) {
       
        require(
            addresses[0] != address(0),
            "FixedRateExchange: Invalid basetoken,  zero address"
        );
        require(
            datatoken != address(0),
            "FixedRateExchange: Invalid datatoken,  zero address"
        );
        require(
            addresses[0] != datatoken,
            "FixedRateExchange: Invalid datatoken,  equals basetoken"
        );
        require(
            uints[2] != 0,
            "FixedRateExchange: Invalid exchange rate value"
        );
        exchangeId = generateExchangeId(addresses[0], datatoken, addresses[1]);
        require(
            exchanges[exchangeId].fixedRate == 0,
            "FixedRateExchange: Exchange already exists!"
        );
        bool withMint=true;
        if(uints[4] == 0) withMint = false;
        exchanges[exchangeId] = Exchange({
            active: true,
            exchangeOwner: addresses[1],
            datatoken: datatoken,
            basetoken: addresses[0],
            fixedRate: uints[2],
            dtDecimals: uints[1],
            btDecimals: uints[0],
            dtBalance: 0,
            btBalance: 0,
            marketFee: uints[3],
            marketFeeCollector: addresses[2],
            marketFeeAvailable: 0,
            oceanFeeAvailable: 0,
            withMint: withMint,
            allowedSwapper: addresses[3]
        });

        exchangeIds.push(exchangeId);

        emit ExchangeCreated(
            exchangeId,
            addresses[0], // 
            datatoken,
            addresses[1],
            uints[2]
        );

        emit ExchangeActivated(exchangeId, addresses[1]);
        emit ExchangeAllowedSwapperChanged(exchangeId, addresses[3]);
    }

    /**
     * @dev generateExchangeId
     *      creates unique exchange identifier for two token pairs.
     * @param basetoken refers to a ocean token contract address
     * @param datatoken refers to a data token contract address
     * @param exchangeOwner exchange owner address
     */
    function generateExchangeId(
        address basetoken,
        address datatoken,
        address exchangeOwner
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(basetoken, datatoken, exchangeOwner));
    }

    /**
     * @dev CalcInGivenOut
     *      Calculates how many basetokens are needed to get specifyed amount of datatokens
     * @param exchangeId a unique exchange idnetifier
     * @param datatokenAmount the amount of data tokens to be exchanged
     */
    function calcBaseInGivenOutDT(bytes32 exchangeId, uint256 datatokenAmount)
        public
        view
        onlyActiveExchange(exchangeId)
        returns (
            uint256 basetokenAmount,
            uint256 basetokenAmountBeforeFee,
            uint256 oceanFeeAmount,
            uint256 marketFeeAmount
        )
    {
        basetokenAmountBeforeFee = datatokenAmount
            .mul(exchanges[exchangeId].fixedRate)
            .mul(10**exchanges[exchangeId].btDecimals)
            .div(10**exchanges[exchangeId].dtDecimals)
            .div(BASE);

      
        
        if (getOPFFee(exchanges[exchangeId].basetoken) != 0) {
            oceanFeeAmount = basetokenAmountBeforeFee
                .mul(getOPFFee(exchanges[exchangeId].basetoken))
                .div(BASE);
        }
     
        marketFeeAmount = basetokenAmountBeforeFee
            .mul(exchanges[exchangeId].marketFee)
            .div(BASE);

       
        basetokenAmount = basetokenAmountBeforeFee.add(marketFeeAmount).add(
            oceanFeeAmount
        );
      
    }

    /**
     * @dev CalcInGivenOut
     *      Calculates how many basetokens are needed to get specifyed amount of datatokens
     * @param exchangeId a unique exchange idnetifier
     * @param datatokenAmount the amount of data tokens to be exchanged
     */
    function calcBaseOutGivenInDT(bytes32 exchangeId, uint256 datatokenAmount)
        public
        view
        onlyActiveExchange(exchangeId)
        returns (
            uint256 basetokenAmount,
            uint256 basetokenAmountBeforeFee,
            uint256 oceanFeeAmount,
            uint256 marketFeeAmount
        )
    {
        basetokenAmountBeforeFee = datatokenAmount
            .mul(exchanges[exchangeId].fixedRate)
            .mul(10**exchanges[exchangeId].btDecimals)
            .div(10**exchanges[exchangeId].dtDecimals)
            .div(BASE);

       
        
        if (getOPFFee(exchanges[exchangeId].basetoken) != 0) {
            oceanFeeAmount = basetokenAmountBeforeFee
                .mul(getOPFFee(exchanges[exchangeId].basetoken))
                .div(BASE);
        }
      
        marketFeeAmount = basetokenAmountBeforeFee
            .mul(exchanges[exchangeId].marketFee)
            .div(BASE);

    
        basetokenAmount = basetokenAmountBeforeFee.sub(marketFeeAmount).sub(
            oceanFeeAmount
        );
   
    }

    /**
     * @dev swap
     *      atomic swap between two registered fixed rate exchange.
     * @param exchangeId a unique exchange idnetifier
     * @param datatokenAmount the amount of data tokens to be exchanged
     * @param maxBasetokenAmount maximum amount of base tokens to pay
     */
    function buyDT(bytes32 exchangeId, uint256 datatokenAmount, uint256 maxBasetokenAmount)
        external
        onlyActiveExchange(exchangeId)
        nonReentrant
    {
        require(
            datatokenAmount != 0,
            "FixedRateExchange: zero data token amount"
        );
        if(exchanges[exchangeId].allowedSwapper != address(0)){
            require(
                exchanges[exchangeId].allowedSwapper == msg.sender,
                "FixedRateExchange: This address is not allowed to swap"
            );
        }
        (
            uint256 basetokenAmount,
            uint256 basetokenAmountBeforeFee,
            uint256 oceanFeeAmount,
            uint256 marketFeeAmount
        ) = calcBaseInGivenOutDT(exchangeId, datatokenAmount);
        require(
            basetokenAmount <= maxBasetokenAmount,
            "FixedRateExchange: Too many base tokens"
        );
        // we account fees , fees are always collected in basetoken
        exchanges[exchangeId].oceanFeeAvailable = exchanges[exchangeId]
            .oceanFeeAvailable
            .add(oceanFeeAmount);
        exchanges[exchangeId].marketFeeAvailable = exchanges[exchangeId]
            .marketFeeAvailable
            .add(marketFeeAmount);
        IERC20(exchanges[exchangeId].basetoken).safeTransferFrom(
                msg.sender,
                address(this), // we send basetoken to this address, then exchange owner can withdraw
                basetokenAmount
        );

        exchanges[exchangeId].btBalance = (exchanges[exchangeId].btBalance).add(
            basetokenAmountBeforeFee
        );

        if (datatokenAmount > exchanges[exchangeId].dtBalance) {
            //first, let's try to mint
            if(exchanges[exchangeId].withMint 
            && IERC20Template(exchanges[exchangeId].datatoken).isMinter(address(this)))
            {
                IERC20Template(exchanges[exchangeId].datatoken).mint(msg.sender,datatokenAmount);
            }
            else{
                    IERC20(exchanges[exchangeId].datatoken).safeTransferFrom(
                        exchanges[exchangeId].exchangeOwner,
                        msg.sender,
                        datatokenAmount
                    );
            }
        } else {
            exchanges[exchangeId].dtBalance = (exchanges[exchangeId].dtBalance)
                .sub(datatokenAmount);
            IERC20(exchanges[exchangeId].datatoken).safeTransfer(
                msg.sender,
                datatokenAmount
            );
        }

        emit Swapped(
            exchangeId,
            msg.sender,
            basetokenAmount,
            datatokenAmount,
            exchanges[exchangeId].datatoken,
            marketFeeAmount,
            oceanFeeAmount
        );
    }

    /**
     * @dev swap
     *      atomic swap between two registered fixed rate exchange.
     * @param exchangeId a unique exchange idnetifier
     * @param datatokenAmount the amount of data tokens to be exchanged
     * @param minBasetokenAmount minimum amount of base tokens to cash in
     */
    function sellDT(bytes32 exchangeId, uint256 datatokenAmount, uint256 minBasetokenAmount)
        external
        onlyActiveExchange(exchangeId)
        nonReentrant
    {
        require(
            datatokenAmount != 0,
            "FixedRateExchange: zero data token amount"
        );
        if(exchanges[exchangeId].allowedSwapper != address(0)){
            require(
                exchanges[exchangeId].allowedSwapper == msg.sender,
                "FixedRateExchange: This address is not allowed to swap"
            );
        }
        (
            uint256 basetokenAmount,
            uint256 basetokenAmountBeforeFee,
            uint256 oceanFeeAmount,
            uint256 marketFeeAmount
        ) = calcBaseOutGivenInDT(exchangeId, datatokenAmount);
        require(
            basetokenAmount >= minBasetokenAmount,
            "FixedRateExchange: Too few base tokens"
        );
        // we account fees , fees are always collected in basetoken
        exchanges[exchangeId].oceanFeeAvailable = exchanges[exchangeId]
            .oceanFeeAvailable
            .add(oceanFeeAmount);
        exchanges[exchangeId].marketFeeAvailable = exchanges[exchangeId]
            .marketFeeAvailable
            .add(marketFeeAmount);
        
            IERC20(exchanges[exchangeId].datatoken).safeTransferFrom(
                msg.sender,
                address(this),
                datatokenAmount
            );

        exchanges[exchangeId].dtBalance = (exchanges[exchangeId].dtBalance).add(
            datatokenAmount
        );

        if (basetokenAmount > exchanges[exchangeId].btBalance) {
            
                IERC20(exchanges[exchangeId].basetoken).safeTransferFrom(
                    exchanges[exchangeId].exchangeOwner,
                    msg.sender,
                    basetokenAmount
                );
        } else {
            exchanges[exchangeId].btBalance = (exchanges[exchangeId].btBalance)
                .sub(basetokenAmountBeforeFee);
            IERC20(exchanges[exchangeId].basetoken).safeTransfer(
                msg.sender,
                basetokenAmount
            );
        }

        emit Swapped(
            exchangeId,
            msg.sender,
            basetokenAmount,
            datatokenAmount,
            exchanges[exchangeId].basetoken,
            marketFeeAmount,
            oceanFeeAmount
        );
    }

    function collectBT(bytes32 exchangeId)
        external
        onlyExchangeOwner(exchangeId)
        nonReentrant
    {
        uint256 amount = exchanges[exchangeId].btBalance;
        exchanges[exchangeId].btBalance = 0;
        IERC20(exchanges[exchangeId].basetoken).safeTransfer(
            exchanges[exchangeId].exchangeOwner,
            amount
        );

        emit TokenCollected(
            exchangeId,
            exchanges[exchangeId].exchangeOwner,
            exchanges[exchangeId].basetoken,
            amount
        );
    }

    function collectDT(bytes32 exchangeId)
        external
        onlyExchangeOwner(exchangeId)
        nonReentrant
    {
        uint256 amount = exchanges[exchangeId].dtBalance;
        exchanges[exchangeId].dtBalance = 0;
        IERC20(exchanges[exchangeId].datatoken).safeTransfer(
            exchanges[exchangeId].exchangeOwner,
            amount
        );

        emit TokenCollected(
            exchangeId,
            exchanges[exchangeId].exchangeOwner,
            exchanges[exchangeId].datatoken,
            amount
        );
    }

    function collectMarketFee(bytes32 exchangeId) external nonReentrant {
        // anyone call call this function, because funds are sent to the correct address
        uint256 amount = exchanges[exchangeId].marketFeeAvailable;
        exchanges[exchangeId].marketFeeAvailable = 0;
        IERC20(exchanges[exchangeId].basetoken).safeTransfer(
            exchanges[exchangeId].marketFeeCollector,
            amount
        );
        emit MarketFeeCollected(
            exchangeId,
            exchanges[exchangeId].basetoken,
            amount
        );
    }

    function collectOceanFee(bytes32 exchangeId) external nonReentrant {
        // anyone call call this function, because funds are sent to the correct address
        uint256 amount = exchanges[exchangeId].oceanFeeAvailable;
        exchanges[exchangeId].oceanFeeAvailable = 0;
        IERC20(exchanges[exchangeId].basetoken).safeTransfer(
            opfCollector,
            amount
        );
        emit OceanFeeCollected(
            exchangeId,
            exchanges[exchangeId].basetoken,
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

    function updateMarketFee(
        bytes32 exchangeId,
        uint256 _newMarketFee
    ) external {
        require(
            msg.sender == exchanges[exchangeId].marketFeeCollector,
            "not marketFeeCollector"
        );
        exchanges[exchangeId].marketFee = _newMarketFee;
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
     * @dev toggleMintState
     *      toggle withMint state
     * @param exchangeId a unique exchange idnetifier
     * @param withMint new value
     */
    function toggleMintState(bytes32 exchangeId, bool withMint)
        external
        onlyExchangeOwner(exchangeId)
    {
        exchanges[exchangeId].withMint = withMint;
        emit ExchangeMintStateChanged(exchangeId, msg.sender, withMint);
    }

    /**
     * @dev toggleExchangeState
     *      toggles the active state of an existing exchange
     * @param exchangeId a unique exchange identifier
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
     * @dev setAllowedSwapper
     *      Sets a new allowedSwapper
     * @param exchangeId a unique exchange identifier
     * @param newAllowedSwapper refers to the new allowedSwapper
     */
    function setAllowedSwapper(bytes32 exchangeId, address newAllowedSwapper) external
    onlyExchangeOwner(exchangeId)
    {
        exchanges[exchangeId].allowedSwapper = newAllowedSwapper;
        emit ExchangeAllowedSwapperChanged(exchangeId, newAllowedSwapper);
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
        else if (exchanges[exchangeId].withMint
        && IERC20Template(exchanges[exchangeId].datatoken).isMinter(address(this))){
            supply = IERC20Template(exchanges[exchangeId].datatoken).cap() 
            - IERC20Template(exchanges[exchangeId].datatoken).totalSupply();
        }
        else {
            uint256 balance = IERC20Template(exchanges[exchangeId].datatoken)
                .balanceOf(exchanges[exchangeId].exchangeOwner);
            uint256 allowance = IERC20Template(exchanges[exchangeId].datatoken)
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
            uint256 balance = IERC20Template(exchanges[exchangeId].basetoken)
                .balanceOf(exchanges[exchangeId].exchangeOwner);
            uint256 allowance = IERC20Template(exchanges[exchangeId].basetoken)
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
    //  *         the datatoken contract address, the base token address, the
    //  *         fixed rate, whether the exchange is active and the supply or the
    //  *         the current data token liquidity.
    //  */
    function getExchange(bytes32 exchangeId)
        external
        view
        returns (
            address exchangeOwner,
            address datatoken,
            uint256 dtDecimals,
            address basetoken,
            uint256 btDecimals,
            uint256 fixedRate,
            bool active,
            uint256 dtSupply,
            uint256 btSupply,
            uint256 dtBalance,
            uint256 btBalance,
            bool withMint
           // address allowedSwapper
        )
    {
        Exchange memory exchange = exchanges[exchangeId];
        exchangeOwner = exchange.exchangeOwner;
        datatoken = exchange.datatoken;
        dtDecimals = exchange.dtDecimals;
        basetoken = exchange.basetoken;
        btDecimals = exchange.btDecimals;
        fixedRate = exchange.fixedRate;
        active = exchange.active;
        dtSupply = getDTSupply(exchangeId);
        btSupply = getBTSupply(exchangeId);
        dtBalance = exchange.dtBalance;
        btBalance = exchange.btBalance;
        withMint = exchange.withMint;
       // allowedSwapper = exchange.allowedSwapper;
    }

    // /**
    //  * @dev getAllowedSwapper
    //  *      gets allowedSwapper
    //  * @param exchangeId a unique exchange idnetifier
    //  * @return address of allowedSwapper 
    //  */
    function getAllowedSwapper(bytes32 exchangeId)
        external
        view
        returns (
            address allowedSwapper
        )
    {
        Exchange memory exchange = exchanges[exchangeId];
        allowedSwapper = exchange.allowedSwapper;
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
        opfFee = getOPFFee(exchanges[exchangeId].basetoken);
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