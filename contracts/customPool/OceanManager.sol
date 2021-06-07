
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

//import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IERC20.sol";
import '../interfaces/IVault.sol';
import "../interfaces/IBaseGeneralPool.sol";
//import "./BaseGeneralPool.sol";

contract OceanManager {

    address public owner;
    address public vault;
    address public pool;
    mapping (address => uint) public feesCollected;

    constructor(address _owner,  address _vault){
        owner = _owner;   
        vault = _vault;
    }

    
    modifier onlyOwner {
        require(owner == msg.sender, 'NOT MANAGER');
        _;
    }

    function _managePoolBalanceOcean( bytes32 poolId,
        IVault.AssetManagerOpKind kind,
        IVault.AssetManagerTransfer[] memory transfers) internal {
        
        for (uint i = 0; i < transfers.lentgh; i++) {
            IVault.PoolBalanceOp memory transfer = IVault.PoolBalanceOp(
            kind,
            poolId,
            transfers[i].token,
            transfers[i].amount
        );   
            IVault(vault).managePoolBalance(transfer);


        }
       
    }

    function collectFee(bytes32 poolId, IVault.AssetManagerOpKind kind,IVault.AssetManagerTransfer[] memory transfers) external onlyOwner {
    
        for (uint i = 0; i < transfers.lentgh; i++) {

            uint totalFee = IBaseGeneralPool(pool).communityFees(address(transfers[i].token));
            uint actualFee = totalFee - feesCollected[address(transfers[i].token)];
            feesCollected[address(transfers[i].token)] = feesCollected[address(transfers[i].token)] + actualFee;
            transfers[i].amount = actualFee;

            _managePoolBalanceOcean(poolId, kind ,transfers);
             // TODO
            // UPDATE BALANCES

        }
        
      
    }



}