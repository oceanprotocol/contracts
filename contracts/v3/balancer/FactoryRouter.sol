// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity >=0.5.7;
pragma experimental ABIEncoderV2;


import "./BFactory.sol";


contract OceanPoolFactoryRouter is BFactory {
    address public routerOwner;
    address public oceanPoolFactory;
    address public stakingBot;

    uint256 public constant swapOceanFee = 1e15; // 0.1% - TODO: check bal v1 

    mapping(address => bool) public oceanTokens;

    event NewPool(address indexed poolAddress, bool isOcean);
    event NewForkPool(address indexed poolAddress);


    modifier onlyRouterOwner {
        require(routerOwner == msg.sender, "OceanRouter: NOT OWNER");
        _;
    }

    constructor(address _routerOwner, address _oceanToken,address _bpoolTemplate, address[] memory _preCreatedPools) BFactory(_bpoolTemplate,_preCreatedPools) public {
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
        address controller, 
        address datatokenAddress, 
        address basetokenAddress, 
        address publisherAddress, 
        uint256 burnInEndBlock,
        uint256[] calldata ssParams
    ) external returns (address) {
        
        bool flag;
        address pool;
        // TODO? ADD REQUIRE TO CHECK IF datatoken is on the erc20List => erc20List[datatoken] == true

       
        if (oceanTokens[basetokenAddress] == true) {
                flag = true;
            
            }
        

        if (flag == true) {
            pool =  newBPool(
               controller,
               datatokenAddress,
               basetokenAddress,
               publisherAddress,
               burnInEndBlock,
               ssParams,
               0
            );
       
        } else {
             pool =  newBPool(
               controller,
               datatokenAddress,
               basetokenAddress,
               publisherAddress,
               burnInEndBlock,
               ssParams,
               swapOceanFee
            );
        }

        require(pool != address(0), "FAILED TO DEPLOY POOL");

        emit NewPool(pool, flag);
   
       
        return pool;
    }




    function getLength(IERC20[] memory array) private view returns (uint256) {
        return array.length;
    }

   
}
