// BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND MIT)

pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


interface IveFeeDistributor{
    function token() external view returns(address);
    function checkpoint_token() external;
    function checkpoint_total_supply() external;
    function commit_admin(address) external;
    function apply_admin() external;
    function toggle_allow_checkpoint_token() external;
    function kill_me() external;
    function recover_balance(address) external;
}

contract veFeeDistributorOwner is Ownable{
    address public immutable veFeeDistributorToken;
    address public immutable veFeeDistributorContract;

    event CommitAdmin(address admin);
    event ApplyAdmin(address admin);
    event ToggleAllowCheckpointToken(bool toogle_flag);
    event CheckpointToken(uint256 time,uint256 tokens);
    
    constructor(
        address _veFeeDistributor
    ) payable {
        require(
            _veFeeDistributor != address(0),
            "_veFeeDistributor is zero address"
        );
        veFeeDistributorContract=_veFeeDistributor;
        veFeeDistributorToken=IveFeeDistributor(_veFeeDistributor).token();
        require(
            veFeeDistributorToken != address(0),
            "_veFeeDistributor token is zero address"
        );
    }
    
    function checkpoint_token() external{
            IveFeeDistributor(veFeeDistributorContract).checkpoint_token();
    }
    function checkpoint_total_supply() external{
            IveFeeDistributor(veFeeDistributorContract).checkpoint_total_supply();
    }
    function checkpoint() external{
            IveFeeDistributor(veFeeDistributorContract).checkpoint_token();
            IveFeeDistributor(veFeeDistributorContract).checkpoint_total_supply();
    }
    function commit_admin(address admin) external onlyOwner{
            IveFeeDistributor(veFeeDistributorContract).commit_admin(admin);
    }
    function apply_admin() external onlyOwner{
            IveFeeDistributor(veFeeDistributorContract).apply_admin();
    }
    function toggle_allow_checkpoint_token() external onlyOwner{
            IveFeeDistributor(veFeeDistributorContract).toggle_allow_checkpoint_token();
    }
    function kill_me() external onlyOwner{
            IveFeeDistributor(veFeeDistributorContract).kill_me();
            uint256 balance = IERC20(veFeeDistributorToken).balanceOf(address(this));
            SafeERC20.safeTransfer(IERC20(veFeeDistributorToken), owner(), balance);
    }
    function recover_balance(address token) external onlyOwner{
            IveFeeDistributor(veFeeDistributorContract).recover_balance(token);
            uint256 balance = IERC20(token).balanceOf(address(this));
            SafeERC20.safeTransfer(IERC20(token), owner(), balance);
    }
}