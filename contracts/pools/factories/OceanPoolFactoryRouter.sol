// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;


import "./OceanPoolFactory.sol";
//import "../../interfaces/IPool.sol";

contract OceanPoolFactoryRouter is OceanPoolFactory {
    address public routerOwner;
    address public oceanPoolFactory;
    

    uint256 public constant swapFeeOcean = 1e15; // 0.1%

    mapping(address => bool) public oceanTokens;

    event NewPool(address indexed poolAddress, bool isOcean);
    event NewForkPool(address indexed poolAddress);


    modifier onlyRouterOwner {
        require(routerOwner == msg.sender, "OceanRouter: NOT OWNER");
        _;
    }

    constructor(address _routerOwner, address _oceanToken, IVault _vault, address _factoryFork) OceanPoolFactory(_vault,_factoryFork) {
        routerOwner = _routerOwner; 
        
        addOceanToken(_oceanToken);
     
    }

    function addOceanToken(address oceanTokenAddress) public onlyRouterOwner {
        oceanTokens[oceanTokenAddress] = true;
    }


    /**
     * @dev Deploys a new `OceanPool` on Balancer V2.
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




    // deploy a new pool on Ocean fork of Balancer v1
    function deployPoolWithFork(address controller) external returns (address) {
        require(controller != address(0), "OceanPoolFactoryRouter: Invalid address");
       
   
        address pool =
            _createPoolWithFork(controller);

        emit NewForkPool(pool);
        return pool;
    }


    function getLength(IERC20[] memory array) private view returns (uint256) {
        return array.length;
    }
   
}
