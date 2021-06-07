
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;


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
        require(owner == msg.sender, 'NOT OWNER');
        _;
    }

    IVault.AssetManagerTransfer[] public test;

    function getLength(IVault.AssetManagerTransfer[] memory test) public view returns (uint)
    {
        return test.length;
    }

    IVault.PoolBalanceOp[] public withdraws;

    function _managePoolBalanceOcean( bytes32 poolId,
        IVault.AssetManagerOpKind kind,
        IVault.AssetManagerTransfer[] memory transfers) internal {
        
        
        uint lentgh = getLength(transfers);
        
         
        
        for (uint i = 0; i < lentgh; i++) {
            IVault.PoolBalanceOp memory transfer = IVault.PoolBalanceOp(
            IVault.PoolBalanceOpKind.WITHDRAW,
            poolId,
            transfers[i].token,
            transfers[i].amount
        );   

           withdraws.push(transfer);


        }
        IVault(vault).managePoolBalance(withdraws);
        delete withdraws;
    }


    function collectFee(bytes32 poolId, IVault.AssetManagerOpKind kind,IVault.AssetManagerTransfer[] memory transfers) external onlyOwner {
     
        uint lentgh = getLength(transfers);

        for (uint i = 0; i < lentgh; i++) {

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