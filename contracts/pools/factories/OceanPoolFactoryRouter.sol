// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@balancer-labs/v2-vault/contracts/interfaces/IVault.sol";

import "@balancer-labs/v2-pool-utils/contracts/factories/BasePoolFactory.sol";

import "../../interfaces/IOceanPoolFactory.sol";

contract OceanPoolFactoryRouter {
    address private routerOwner;
    address public oceanPoolFactory;
    
    //bool public balV2;

    uint256 public constant swapFeeOcean = 1e15; // 0.1%

    mapping(address => bool) public oceanTokens;

    event NewPool(address indexed poolAddress, bool isOcean);
    event NewForkPool(address indexed poolAddress);

    modifier onlyRouterOwner {
        require(routerOwner == msg.sender, "OceanRouter: NOT OWNER");
        _;
    }

    constructor(address _routerOwner, address _oceanToken) {
        routerOwner = _routerOwner; 
        
        addOceanToken(_oceanToken);
       // balV2 = true;
    }

    function addOceanToken(address oceanTokenAddress) public onlyRouterOwner {
        oceanTokens[oceanTokenAddress] = true;
    }

    function addOceanPoolFactory(address _oceanPoolFactory)
        external
        onlyRouterOwner
    {
        oceanPoolFactory = _oceanPoolFactory;
    }

    /**
     * @dev Deploys a new `OceanPool`.
     */
    function deployPool(
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        uint256 swapFeePercentage,
        uint256 marketFee,
        address owner
    ) external returns (address) {
        // require(
        //     balV2 == true,
        //     "OceanPoolFactoryRouter: Bal V2 not available on this network"
        // );
        bool flag;
        address pool;
        // TODO? ADD REQUIRE TO CHECK IF datatoken is on the erc20List => erc20List[datatoken] == true

        for (uint256 i = 0; i < getLength(tokens); i++) {
            if (oceanTokens[address(tokens[i])] == true) {
                flag = true;
                break;
            }
        }

        if (flag == true) {
            pool = _createPool(
                name,
                symbol,
                tokens,
                weights,
                swapFeePercentage,
                0,
                marketFee,
                owner
            );
          //  emit NewPool(pool, flag);
        } else {
            pool = _createPool(
                name,
                symbol,
                tokens,
                weights,
                swapFeePercentage,
                swapFeeOcean,
                marketFee,
                owner
            );
        }

        require(pool != address(0), "FAILED TO DEPLOY POOL");

        emit NewPool(pool, flag);
        return pool;
    }

    function _createPool(
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        uint256 swapFeePercentage,
        uint256 oceanFee,
        uint256 marketFee,
        address owner
    ) private returns (address) {
        address pool =
            IOceanPoolFactory(oceanPoolFactory).createPool(
                name,
                symbol,
                tokens,
                weights,
                swapFeePercentage,
                oceanFee,
                marketFee,
                owner
            );

        return pool;
    }

    function getLength(IERC20[] memory array) private view returns (uint256) {
        return array.length;
    }

    function deployPoolWithFork(address controller) external returns (address) {
        require(controller != address(0), "OceanPoolFactoryRouter: Invalid address");
        // require(
        //     balV2 == false,
        //     "OceanPoolFactoryRouter: BalV2 available on this network"
        // );
   
        address pool =
            IOceanPoolFactory(oceanPoolFactory).createPoolWithFork(controller);
        emit NewForkPool(pool);
        return pool;
    }

    // function updateBalV2Status(bool _isAvailable) external onlyRouterOwner {
    //     balV2 = _isAvailable;
    // }
}
