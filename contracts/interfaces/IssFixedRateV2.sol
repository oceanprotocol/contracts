// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.


pragma solidity >=0.7.0;

import "@balancer-labs/v2-vault/contracts/interfaces/IVault.sol";

interface IssFixedRateV2 {

   function stake(bytes32 poolId, IERC20[] memory tokens, uint256[] memory maxAmountsIn, bytes memory userDataStake, uint256 amountInDT) external returns(bool);

   function unstake(bytes memory self, bytes32 poolId, uint256 amountOut, address tokenAddress, address payable recipient ) external;

   function getDTAddress(address) view external returns(address);
   
   function setDTinPool(address, address) external;
}