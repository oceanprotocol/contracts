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

    uint256 public constant swapOceanFee = 1e15;
    mapping(address => bool) public oceanTokens;
    mapping(address => bool) public ssContracts;

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

    function addSSContract(address _ssContract) external onlyRouterOwner {
        ssContracts[_ssContract] = true;
    }

    function addFactory(address _factory) external onlyRouterOwner {
        require(factory == address(0), "FACTORY ALREADY SET");
        factory = _factory;
    }

    function addFixedRateContract(address _fixedRate) external onlyRouterOwner {
        fixedRate = _fixedRate;
    }

    /**
     * @dev Deploys a new `OceanPool` on Ocean Friendly Fork.
     */
    function deployPool(
        address controller,
        address[2] calldata tokens, // [datatokenAddress, basetokenAddress]
        address publisherAddress,
        uint256[] calldata ssParams,
        address basetokenSender,
        uint256[] calldata swapFees,
        address marketFeeCollector
    ) external returns (address) {
        require(
            IFactory(factory).erc20List(msg.sender) == true,
            "FACTORY ROUTER: NOT ORIGINAL ERC20 TEMPLATE"
        );
        require(
            ssContracts[controller] = true,
            "FACTORY ROUTER: invalid ssContract"
        );
        require(ssParams[1] > 0, 'Wrong decimals');

        bool flag;
        address pool;

        if (oceanTokens[tokens[1]] == true) {
            flag = true;
        }
        // we pull basetoken for creating initial pool
        IERC20 bt = IERC20(tokens[1]);
        bt.transferFrom(basetokenSender, controller, ssParams[4]);

        uint256[] memory fees = swapFees;


        if (flag == true) {
            fees[2] = 0;
            pool = newBPool(
                controller,
                tokens,
                publisherAddress,
                ssParams,
                fees,
                marketFeeCollector
            );
        } else {
            fees[2] = swapOceanFee;
            pool = newBPool(
                controller,
                tokens,
                publisherAddress,
                ssParams,
                fees,
                marketFeeCollector
            );
        }

        require(pool != address(0), "FAILED TO DEPLOY POOL");

        emit NewPool(pool, flag);

        return pool;
    }

    function getLength(IERC20[] memory array) private view returns (uint256) {
        return array.length;
    }

    function deployFixedRate(
        address basetokenAddress,
        uint8 basetokenDecimals,
        uint256 rate,
        address owner,
        uint256 marketFee,
        address marketFeeCollector
    ) external returns(bytes32 exchangeId) {
        require(
            IFactory(factory).erc20List(msg.sender) == true,
            "FACTORY ROUTER: NOT ORIGINAL ERC20 TEMPLATE"
        );

        uint256 opfFee;

        if (oceanTokens[basetokenAddress] != true) {
            opfFee = swapOceanFee;
        } 
    
            exchangeId = IFixedRateExchange(fixedRate).createWithDecimals(
                basetokenAddress,
                msg.sender,
                basetokenDecimals,
                18,
                rate,
                owner,
                marketFee,
                marketFeeCollector,
                opfFee
            );
    
    }
}
