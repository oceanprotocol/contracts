// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity >=0.5.7;
pragma experimental ABIEncoderV2;

import "./balancer/BFactory.sol";
import "../interfaces/IFactory.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IFixedRateExchange.sol";
import "../interfaces/IPool.sol";
import "../interfaces/IDispenser.sol";


contract FactoryRouter is BFactory {
    address public routerOwner;
    address public factory;
    address public fixedRate;
    
    uint256 public swapOceanFee = 1e15;
    mapping(address => bool) public oceanTokens;
    mapping(address => bool) public ssContracts;
    mapping(address => bool) public fixedPrice;

    event NewPool(address indexed poolAddress, bool isOcean);

    modifier onlyRouterOwner() {
        require(routerOwner == msg.sender, "OceanRouter: NOT OWNER");
        _;
    }

    constructor(
        address _routerOwner,
        address _oceanToken,
        address _bpoolTemplate,
        address _opfCollector,
        address[] memory _preCreatedPools
    ) public BFactory(_bpoolTemplate, _opfCollector, _preCreatedPools) {
        routerOwner = _routerOwner;
        opfCollector = _opfCollector;
        oceanTokens[_oceanToken] = true;
    }

    function changeRouterOwner(address _routerOwner) public onlyRouterOwner {
        require(
            _routerOwner != address(0),
            'Invalid new router owner'
        );
        routerOwner = _routerOwner;
    }

    function addOceanToken(address oceanTokenAddress) public onlyRouterOwner {
        oceanTokens[oceanTokenAddress] = true;
    }

    function removeOceanToken(address oceanTokenAddress) public onlyRouterOwner {
        oceanTokens[oceanTokenAddress] = false;
    }

    function addSSContract(address _ssContract) external onlyRouterOwner {
        ssContracts[_ssContract] = true;
    }

    function addFactory(address _factory) external onlyRouterOwner {
        require(factory == address(0), "FACTORY ALREADY SET");
        factory = _factory;
    }

    function addFixedRateContract(address _fixedRate) external onlyRouterOwner {
        fixedPrice[_fixedRate] = true;
    }

    function getOPFFee(address baseToken) public view returns (uint256) {
        if (oceanTokens[baseToken] == true) {
            return 0;
        } else return swapOceanFee;
    }

    function updateOPFFee(uint256 _newSwapOceanFee) external onlyRouterOwner {
        // TODO: add a maximum? how much? add event?
        swapOceanFee = _newSwapOceanFee;
    }

    /**
     * @dev Deploys a new `OceanPool` on Ocean Friendly Fork modified for 1SS.
     This function cannot be called directly, but ONLY through the ERC20DT contract from a ERC20DEployer role

      ssContract address
     tokens [datatokenAddress, basetokenAddress]
     publisherAddress user which will be assigned the vested amount.
     * @param ssParams params for the ssContract. 
     basetokenSender user which will provide the baseToken amount for initial liquidity 
     * @param swapFees swapFees (swapFee, swapMarketFee,swapOceanFee), swapOceanFee will be set automatically later
     marketFeeCollector marketFeeCollector address
       
        @return pool address
     */
    function deployPool(
        address[2] calldata tokens, 
        // [datatokenAddress, basetokenAddress]
        uint256[] calldata ssParams,
        uint256[] calldata swapFees,
        address[] calldata addresses 
        //[controller,basetokenAddress,basetokenSender,publisherAddress, marketFeeCollector]

    ) external returns (address) {
        require(
            IFactory(factory).erc20List(msg.sender) == true,
            "FACTORY ROUTER: NOT ORIGINAL ERC20 TEMPLATE"
        );
        require(
            ssContracts[addresses[0]] == true,
            "FACTORY ROUTER: invalid ssContract"
        );
        require(ssParams[1] > 0, "Wrong decimals");

        // TODO: do we need this? used only for the event?
        bool flag;
        if (oceanTokens[tokens[1]] == true) {
            flag = true;
        }

        // we pull basetoken for creating initial pool and send it to the controller (ssContract)
        IERC20 bt = IERC20(tokens[1]);
        require(bt.transferFrom(addresses[2], addresses[0], ssParams[4])
        ,'DeployPool: Failed to transfer initial liquidity');

        address pool = newBPool(
            tokens,
            ssParams,
            swapFees,
            addresses
        );

        require(pool != address(0), "FAILED TO DEPLOY POOL");

        emit NewPool(pool, flag);

        return pool;
    }

    function getLength(IERC20[] memory array) private view returns (uint256) {
        return array.length;
    }

    /**
     * @dev deployFixedRate
     *      Creates a new FixedRateExchange setup.
     * As for deployPool, this function cannot be called directly,
     * but ONLY through the ERC20DT contract from a ERC20DEployer role
     * basetokenAddress baseToken for exchange (OCEAN or other)
     * basetokenDecimals baseToken decimals
     * rate rate
     * owner exchangeOwner
       marketFee market Fee 
       marketFeeCollector market fee collector address

       @return exchangeId
     */

    function deployFixedRate(
        address fixedPriceAddress,
        address[] calldata addresses,
        uint[] calldata uints

    ) external returns (bytes32 exchangeId) {
        require(
            IFactory(factory).erc20List(msg.sender) == true,
            "FACTORY ROUTER: NOT ORIGINAL ERC20 TEMPLATE"
        );

        require(
            fixedPrice[fixedPriceAddress] == true,
            "FACTORY ROUTER: Invalid FixedPriceContract"
        );

        exchangeId = IFixedRateExchange(fixedPriceAddress).createWithDecimals(
            msg.sender,
            addresses,
            uints
        );
    }

    function addPoolTemplate(address poolTemplate) external onlyRouterOwner {
        _addPoolTemplate(poolTemplate);
    }

    function removePoolTemplate(address poolTemplate) external onlyRouterOwner {
       _removePoolTemplate(poolTemplate);
    }


// If you need to buy multiple DT (let's say for a compute job which has multiple datasets), 
// you have to send one transaction for each DT that you want to buy.

// We could have a buyDTBatch function in FactoryRouter, that needs the following parameters:

// uint type[] (fixedrate,dispenser,pool)
// address source[] (fixed rate address , dispenser address, pool address) - depends on type
//                           (if fixed rate or dispenser, address can be 0, we can fill it from Factory)
// bytes32[] (can be either fixed rate exchangeID, or swapExactAmountOut / swapExactAmountIn for pools)
// address[] - (only for pools, it's tokenIn)
// uint256[] - (only for pools, it's maxAmountIn (for swapExactAmountOut) / tokenAmountIn)
// address[] - (only for pools, it's tokenOut)
// uint256[] - (fixed rate it's dataTokenAmount, for pools, it's tokenAmountOut(for swapExactAmountOut) / minAmountOut)
// uint256[] - (only for pools, it's maxPrice)
// Obviously, the consumer needs to approve the FactoryRouter address as spender of the required input tokens.

// Perks:

// one single call to buy multiple DT for multiple assets (better UX, better gas optimization)
// built-in support for DT 1 -> DT2 swaps in one call (using intermediary base tokens. 
// Example IE: DT1 -> Ocean, Ocean -> DT2) (better UX, better gas optimization)
  //  enum Exchange { Pool, FixedRate, Dispenser }
    enum operationType { SwapExactIn, SwapExactOut, FixedRate, Dispenser}

    struct Operations{
        bytes32 exchangeIds;
        address source;
        operationType operation;
        address tokenIn;
        uint256 amountsIn;
        address tokenOut;
        uint256 amountsOut;
        uint256 maxPrice;
    } 

    // require tokenIn approvals for router from user. (except for dispenser operations)
    function buyDTBatch( 
        Operations[] calldata _operations
        ) 
        external {

            for (uint i= 0; i< _operations.length; i++) {

                if(_operations[i].operation == operationType.SwapExactIn) {
                    // Get amountIn from user to router
                    IERC20(_operations[i].tokenIn).transferFrom(msg.sender,address(this),_operations[i].amountsIn);
                    // we approve pool to pull token from router
                    IERC20(_operations[i].tokenIn).approve(_operations[i].source,_operations[i].amountsIn);
                    // Perform swap
                    (uint amountReceived,) = 
                    IPool(_operations[i].source)
                    .swapExactAmountIn(_operations[i].tokenIn,
                    _operations[i].amountsIn,
                    _operations[i].tokenOut,
                    _operations[i].amountsOut,
                    _operations[i].maxPrice);
                    // transfer token swapped to user
                   
                    require(IERC20(_operations[i].tokenOut).transfer(msg.sender,amountReceived),'Failed MultiSwap');
                } else if (_operations[i].operation == operationType.SwapExactOut){
                    // calculate how much amount In we need for exact Out
                    uint amountIn = IPool(_operations[i].source).getAmountInExactOut(_operations[i].tokenIn,_operations[i].tokenOut,_operations[i].amountsOut);
                    // pull amount In from user
                    IERC20(_operations[i].tokenIn).transferFrom(msg.sender,address(this),amountIn);
                    // we approve pool to pull token from router
                    IERC20(_operations[i].tokenIn).approve(_operations[i].source,amountIn);
                    // perform swap
                    IPool(_operations[i].source)
                    .swapExactAmountOut(_operations[i].tokenIn,
                    _operations[i].amountsIn,
                    _operations[i].tokenOut,
                    _operations[i].amountsOut,
                    _operations[i].maxPrice);
                    // send amount out back to user
                    require(IERC20(_operations[i].tokenOut)
                    .transfer(msg.sender,_operations[i].amountsOut),'Failed MultiSwap');

                } else if (_operations[i].operation ==  operationType.FixedRate) {
                    // get datatoken address
                    (,address datatoken,,,,,,,,,) = 
                    IFixedRateExchange(_operations[i].source).getExchange(_operations[i].exchangeIds);
                    // get tokenIn amount required for dt out
                    (uint baseTokenAmount,,,) = 
                    IFixedRateExchange(_operations[i].source).
                    calcBaseInGivenOutDT(_operations[i].exchangeIds,_operations[i].amountsOut);

                    // pull tokenIn amount
                    IERC20(_operations[i].tokenIn).transferFrom(msg.sender,address(this),baseTokenAmount);
                     // we approve pool to pull token from router
                    IERC20(_operations[i].tokenIn).approve(_operations[i].source,baseTokenAmount);
                    // perform swap
                    IFixedRateExchange(_operations[i].source)
                    .buyDT(_operations[i].exchangeIds,_operations[i].amountsOut);
                    // send dt out to user
                    IERC20(datatoken).transfer(msg.sender,_operations[i].amountsOut);
                
                } else {

                    IDispenser(_operations[i].source).getDT(_operations[i].exchangeIds,_operations[i].amountsOut);
                    (,address datatoken,,,) = IDispenser(_operations[i].source).getExchange(_operations[i].exchangeIds);
                    IERC20(datatoken).transfer(msg.sender,_operations[i].amountsOut);
                }
            }

    }


}
