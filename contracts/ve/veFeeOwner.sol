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
    address private veFeeDistributorToken;
    IveFeeDistributor private veFeeDistributorContract;


    constructor(
        address _veFeeDistributor
    ) payable {
        require(
            _veFeeDistributor != address(0),
            "_veFeeDistributor is zero address"
        );
        veFeeDistributorContract=IveFeeDistributor(_veFeeDistributor);
        veFeeDistributorToken=IveFeeDistributor(_veFeeDistributor).token();
        require(
            veFeeDistributorToken != address(0),
            "_veFeeDistributor token is zero address"
        );
    }

    function checkpoint_token() external{
            veFeeDistributorContract.checkpoint_token();
    }
    function checkpoint_total_supply() external{
            veFeeDistributorContract.checkpoint_total_supply();
    }
    function checkpoint() external{
            veFeeDistributorContract.checkpoint_token();
            veFeeDistributorContract.checkpoint_total_supply();
    }
    function commit_admin(address admin) external onlyOwner{
            veFeeDistributorContract.commit_admin(admin);
    }
    function apply_admin() external onlyOwner{
            veFeeDistributorContract.apply_admin();
    }
    function toggle_allow_checkpoint_token() external onlyOwner{
            veFeeDistributorContract.toggle_allow_checkpoint_token();
    }
    function kill_me() external onlyOwner{
            veFeeDistributorContract.kill_me();
            uint256 balance = IERC20(veFeeDistributorToken).balanceOf(address(this));
            SafeERC20.safeTransfer(IERC20(veFeeDistributorToken), owner(), balance);
    }
    function recover_balance(address token) external onlyOwner{
            veFeeDistributorContract.recover_balance(token);
            uint256 balance = IERC20(token).balanceOf(address(this));
            SafeERC20.safeTransfer(IERC20(token), owner(), balance);
    }
}