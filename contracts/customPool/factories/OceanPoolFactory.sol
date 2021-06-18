pragma solidity ^0.7.0;

import "@balancer-labs/v2-vault/contracts/interfaces/IVault.sol";
import "@balancer-labs/v2-pool-utils/contracts/factories/FactoryWidePauseWindow.sol";
import "../WeightedPool.sol";
import "./BasePoolSplitCodeFactory.sol";

contract OceanPoolFactory is BasePoolSplitCodeFactory, FactoryWidePauseWindow {
    IVault public vault_;
    address public oceanRouter; 
    bool public balV2;
    address private owner;

   

   constructor(IVault vault, address _oceanRouter, address _owner) BasePoolSplitCodeFactory(vault, type(WeightedPool).creationCode) {
        oceanRouter = _oceanRouter;
        owner = _owner;
        vault_ = vault;
        balV2 = true;
        
    }
    
    modifier onlyRouter {
         require(oceanRouter == msg.sender, 'OceanPoolFactory: NOT OCEAN ROUTER');
         _;
    }
   
    function createPool(
       // IVault getVault(),
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
       // address[] memory assetManagers,
        uint256 swapFeePercentage,
        uint256 oceanFee,
        uint256 marketFee,
        address owner
        ) external onlyRouter returns (address) {
        require(balV2 == true, "OceanPoolFactory: Bal V2 not available on this network");
       

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
            
            
            return pool;
    }


    function createPoolFork() onlyRouter external {
        require(balV2 == false, 'OceanPoolFactory: BalV2 available on this network');
        // TODO: Add Ocean friendly fork of Balancer (in case there's no BAL v2)
      
       
    }

    function updateBalV2Status(bool _isAvailable) external {
        require(owner == msg.sender, "OceanPoolFactory: NOT OWNER");
        balV2 = _isAvailable;
    }
}
