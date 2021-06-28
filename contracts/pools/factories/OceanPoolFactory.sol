pragma solidity ^0.7.0;

import "@balancer-labs/v2-vault/contracts/interfaces/IVault.sol";
import "@balancer-labs/v2-pool-utils/contracts/factories/FactoryWidePauseWindow.sol";
import "../WeightedPool.sol";
import "./BasePoolSplitCodeFactory.sol";
import "../../interfaces/IFriendlyFactory.sol";

contract OceanPoolFactory is BasePoolSplitCodeFactory, FactoryWidePauseWindow {
    IVault public vault_;
    address public oceanRouter; 
    
    address private owner;
    address public factoryFork; 
    
    event NewPool(address pool);

   constructor(IVault vault, address _oceanRouter, address _owner, address _factoryFork) BasePoolSplitCodeFactory(vault, type(WeightedPool).creationCode) {
        oceanRouter = _oceanRouter;
        owner = _owner;
        vault_ = vault;
        factoryFork = _factoryFork;
        
        
    }
    
    modifier onlyRouter {
         require(oceanRouter == msg.sender, 'OceanPoolFactory: NOT OCEAN ROUTER');
         _;
    }
   
    function createPool(
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        uint256 swapFeePercentage,
        uint256 oceanFee,
        uint256 marketFee,
        address owner
        ) external onlyRouter returns (address) {
       
       

             (uint256 pauseWindowDuration, uint256 bufferPeriodDuration) =
            getPauseConfiguration();

             address pool = _create(abi.encode(
                    vault_,
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
            
            emit NewPool(pool);
            return pool;
    }


    function createPoolWithFork(address controller) external onlyRouter returns (address){
        address pool = IFriendlyFactory(factoryFork).newBPool(controller);
        
        return pool;
    }

}
