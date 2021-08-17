// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity >=0.5.7;
pragma experimental ABIEncoderV2;


import "./BFactory.sol";
import  "../../interfaces/IERC20Factory.sol";
import "../../interfaces/IERC20.sol";

contract FactoryRouter is BFactory {
    address public routerOwner;
    address public erc20Factory;

    uint256 public constant swapOceanFee = 1e12; 
    mapping(address => bool) public oceanTokens;
    mapping(address => bool) public ssContracts;

    event NewPool(address indexed poolAddress, bool isOcean);
    event NewForkPool(address indexed poolAddress);
    uint256 private test;

    modifier onlyRouterOwner {
        require(routerOwner == msg.sender, "OceanRouter: NOT OWNER");
        _;
    }

    constructor(address _routerOwner, address _oceanToken,address _bpoolTemplate, address _ssContract, address[] memory _preCreatedPools) BFactory(_bpoolTemplate,_preCreatedPools) public {
        routerOwner = _routerOwner; 
       // erc20Factory = _erc20Factory;
        ssContracts[_ssContract] = true;
        addOceanToken(_oceanToken);

    } 

    function addOceanToken(address oceanTokenAddress) public onlyRouterOwner {
        oceanTokens[oceanTokenAddress] = true;
    }

         // TODO: add remove function? 
    function addSSContract(address _ssContract) external onlyRouterOwner {
        ssContracts[_ssContract] = true;
    }

          // TODO: add remove function? 
    function addERC20Factory(address _erc20Factory) external onlyRouterOwner {
        require(erc20Factory == address(0), 'FACTORY ALREADY SET');
        erc20Factory = _erc20Factory;
    }

    /**
     * @dev Deploys a new `OceanPool` on Ocean Friendly Fork.
     */
    function deployPool(
        address controller, 
        address datatokenAddress, 
        address basetokenAddress, 
        address publisherAddress, 
        uint256[] calldata ssParams,
        address basetokenSender
    ) external returns (address) {
        require(IERC20Factory(erc20Factory).erc20List(msg.sender) == true, 'FACTORY ROUTER: NOT ORIGINAL ERC20 TEMPLATE');
        require(ssContracts[controller] = true, 'FACTORY ROUTER: invalid ssContract');
      
        bool flag;
        address pool;
       
       
        if (oceanTokens[basetokenAddress] == true) {
                flag = true;
            
            }
          // we pull basetoken for creating initial pool
        IERC20 bt = IERC20(basetokenAddress);
        bt.transferFrom(basetokenSender,controller,ssParams[4]);

        if (flag == true) {
            pool =  newBPool(
               controller,
               datatokenAddress,
               basetokenAddress,
               publisherAddress,
               ssParams,
               0
            );
       
        } else {
             pool =  newBPool(
               controller,
               datatokenAddress,
               basetokenAddress,
               publisherAddress,
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
