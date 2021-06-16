pragma solidity ^0.7.0;

import "@balancer-labs/v2-vault/contracts/interfaces/IVault.sol";
import "@balancer-labs/v2-pool-utils/contracts/factories/FactoryWidePauseWindow.sol";
import "../WeightedPool.sol";
import "./BasePoolSplitCodeFactory.sol";

contract OceanPoolFactory is BasePoolSplitCodeFactory, FactoryWidePauseWindow {

    address private oceanRouter; 

   constructor(IVault vault, address _oceanRouter) BasePoolSplitCodeFactory(vault, type(WeightedPool).creationCode) {
        oceanRouter = _oceanRouter;
        
        
    }

   
    function create(
        IVault vault,
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        address[] memory assetManagers,
        uint256 swapFeePercentage,
        address owner) external returns (address) {
        require(oceanRouter == msg.sender, 'NOT OCEAN ROUTER');

             (uint256 pauseWindowDuration, uint256 bufferPeriodDuration) =
            getPauseConfiguration();

             address pool = _create(abi.encode(
                    vault,
                    name,
                    symbol,
                    tokens,
                    weights,
                    assetManagers,
                    swapFeePercentage,
                    pauseWindowDuration,
                    bufferPeriodDuration,
                    owner
                ));
            

            return pool;
    }
}