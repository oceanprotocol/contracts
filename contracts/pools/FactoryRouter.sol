// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity >=0.5.7;
pragma experimental ABIEncoderV2;

import "./balancer/BFactory.sol";
import "../interfaces/IFactory.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IFixedRateExchange.sol";

contract FactoryRouter is BFactory {
    address public routerOwner;
    address public factory;
    address public fixedRate;
    address public opfCollector;

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
        addOceanToken(_oceanToken);
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
       // address controller,
        address[2] calldata tokens, // [datatokenAddress, basetokenAddress]
       // address publisherAddress,
        uint256[] calldata ssParams,
      //  address basetokenSender,
        uint256[] calldata swapFees,
       // address marketFeeCollector,

        address[] calldata addresses //[controller,basetokenAddress,basetokenSender,publisherAddress, marketFeeCollector]

    ) external returns (address) {
        require(
            IFactory(factory).erc20List(msg.sender) == true,
            "FACTORY ROUTER: NOT ORIGINAL ERC20 TEMPLATE"
        );
        require(
            ssContracts[addresses[0]] = true,
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
          //  controller,
            tokens,
          //  publisherAddress,
            ssParams,
            swapFees,
          //  marketFeeCollector,
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
     * @param basetokenAddress baseToken for exchange (OCEAN or other)
     * @param basetokenDecimals baseToken decimals
     * @param rate rate
     * @param owner exchangeOwner
       @param marketFee market Fee 
       @param marketFeeCollector market fee collector address

       @return exchangeId
     */

    function deployFixedRate(
        address fixedPriceAddress,
        address basetokenAddress,
        uint8 basetokenDecimals,
        uint256 rate,
        address owner,
        uint256 marketFee,
        address marketFeeCollector
    ) external returns (bytes32 exchangeId) {
        require(
            IFactory(factory).erc20List(msg.sender) == true,
            "FACTORY ROUTER: NOT ORIGINAL ERC20 TEMPLATE"
        );

        require(
            fixedPrice[fixedPriceAddress] == true,
            "FACTORY ROUTER: Invalid FixedPriceContract"
        );

       // uint256 opfFee = getOPFFee(basetokenAddress);

        exchangeId = IFixedRateExchange(fixedPriceAddress).createWithDecimals(
            basetokenAddress,
            msg.sender,
            basetokenDecimals,
            18,
            rate,
            owner,
            marketFee,
            marketFeeCollector
           // opfFee
        );
    }

    function addPoolTemplate(address poolTemplate) external onlyRouterOwner {
        _addPoolTemplate(poolTemplate);
    }

    function removePoolTemplate(address poolTemplate) external onlyRouterOwner {
       _removePoolTemplate(poolTemplate);
    }
}
