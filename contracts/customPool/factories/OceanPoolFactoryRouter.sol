// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@balancer-labs/v2-vault/contracts/interfaces/IVault.sol";

import "@balancer-labs/v2-pool-utils/contracts/factories/BasePoolFactory.sol";


import "../../interfaces/IOceanPoolFactory.sol";

contract OceanPoolFactoryRouter {
    address public routerOwner;
    address public oceanPoolFactory;
    address public assetManager;

    mapping(address => bool) public oceanTokens;

    modifier onlyRouterOwner {
        require(routerOwner == msg.sender, "NOT OWNER");
        _;
    }

    constructor(
      //  IVault vault,
        address _routerOwner,
        address _assetManager
       // address _oceanPoolFactory
    ) {
        routerOwner = _routerOwner;
        assetManager = _assetManager;
     //   oceanPoolFactory = _oceanPoolFactory;
        // solhint-disable-previous-line no-empty-blocks
    }

    function getLength(IERC20[] memory array) public view returns (uint256) {
        return array.length;
    }

    function addOceanToken(address oceanTokenAddress) external onlyRouterOwner {
        oceanTokens[oceanTokenAddress] = true;
    }

    function addOceanPoolFactory (address _oceanPoolFactory) external onlyRouterOwner {
        oceanPoolFactory = _oceanPoolFactory;
    }
    /**
     * @dev Deploys a new `OceanPool`.
     */
    function create(
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        uint256 swapFeePercentage,
        address owner
    ) external returns (address) {
        bool flag;
        address pool;
        // TODO? ADD REQUIRE TO CHECK IF datatoken is on the erc20List => erc20List[datatoken] == true

        address[] memory assetManagers = new address[](getLength(tokens));

        for (uint256 i = 0; i < getLength(tokens); i++) {
            if (oceanTokens[address(tokens[i])] == true) {
                flag = true;
                break;
            }
        }

       

        if (flag == true) {
            _createPool(
                name,
                symbol,
                tokens,
                weights,
                assetManagers,
                swapFeePercentage,
                owner
            );
        } else {
            for (uint256 j = 0; j < getLength(tokens); j++) {
                assetManagers[j] = assetManager;
            }

            _createPool(
                name,
                symbol,
                tokens,
                weights,
                assetManagers,
                swapFeePercentage,
                owner
            );
        }

        require(pool != address(0), "FAILED TO DEPLOY POOL");
       // _register(pool);
        return pool;
    }

    function _createPool(
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        address[] memory assetManagers,
        uint256 swapFeePercentage,
        address owner
    ) internal returns (address) {
        address pool =
            IOceanPoolFactory(oceanPoolFactory).create(
                name,
                symbol,
                tokens,
                weights,
                assetManagers,
                swapFeePercentage,
                owner
            );

        return pool;
    }
}
