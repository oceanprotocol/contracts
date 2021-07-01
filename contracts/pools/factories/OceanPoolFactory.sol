pragma solidity ^0.7.0;

import "@balancer-labs/v2-vault/contracts/interfaces/IVault.sol";
import "@balancer-labs/v2-pool-utils/contracts/factories/FactoryWidePauseWindow.sol";
import "../WeightedPool.sol";
import "./BasePoolSplitCodeFactory.sol";
import "../../interfaces/IFriendlyFactory.sol";

contract OceanPoolFactory is BasePoolSplitCodeFactory, FactoryWidePauseWindow {
    
    IVault public vault;
    
    address public factoryFork; 
    

   constructor(IVault _vault, address _factoryFork) BasePoolSplitCodeFactory(vault, type(WeightedPool).creationCode) {
      
        vault = _vault;
        factoryFork = _factoryFork;
        
        
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
        ) internal returns (address) {
       
       

             (uint256 pauseWindowDuration, uint256 bufferPeriodDuration) =
            getPauseConfiguration();

             address pool = _create(abi.encode(
                    vault,
                    name,
                    symbol,
                    tokens,
                    weights,
                    swapFeePercentage,
                    oceanFee,
                    marketFee,
                    pauseWindowDuration,
                    bufferPeriodDuration,
                    owner
                ));
            
          
            return pool;
    }


    function _createPoolWithFork(address controller) internal returns (address){
        address pool = IFriendlyFactory(factoryFork).newBPool(controller);
        
        return pool;
    }

}
