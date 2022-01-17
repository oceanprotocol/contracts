// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity 0.8.10;

interface ISideStaking {


    function newDatatokenCreated(
        address datatokenAddress,
        address basetokenAddress,
        address poolAddress,
        address publisherAddress,
        uint256[] calldata ssParams
    ) external returns (bool);

    function getDatatokenCirculatingSupply(address datatokenAddress)
        external
        view
        returns (uint256);

    function getPublisherAddress(address datatokenAddress)
        external
        view
        returns (address);

    function getBasetokenAddress(address datatokenAddress)
        external
        view
        returns (address);

    function getPoolAddress(address datatokenAddress)
        external
        view
        returns (address);

    function getBasetokenBalance(address datatokenAddress)
        external
        view
        returns (uint256);

    function getDatatokenBalance(address datatokenAddress)
        external
        view
        returns (uint256);

    function getvestingEndBlock(address datatokenAddress)
        external
        view
        returns (uint256);

    function getvestingAmount(address datatokenAddress)
        external
        view
        returns (uint256);

    function getvestingLastBlock(address datatokenAddress)
        external
        view
        returns (uint256);

    function getvestingAmountSoFar(address datatokenAddress)
        external
        view
        returns (uint256);



    function canStake(
        address datatokenAddress,
        address stakeToken,
        uint256 amount
    ) external view returns (bool);

    function Stake(
        address datatokenAddress,
        address stakeToken,
        uint256 amount
    ) external;

    function canUnStake(
        address datatokenAddress,
        address stakeToken,
        uint256 amount
    ) external view returns (bool);

    function UnStake(
        address datatokenAddress,
        address stakeToken,
        uint256 amount,
        uint256 poolAmountIn
    ) external;

    function notifyFinalize(address datatokenAddress) external;


  
}