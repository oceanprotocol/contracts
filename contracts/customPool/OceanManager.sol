pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "../interfaces/IERC20.sol";
import "../interfaces/IVault.sol";
import "../interfaces/IBaseGeneralPool.sol";

//import "./BaseGeneralPool.sol";

contract OceanManager {
    address public owner;
    address public vault;
    address public pool;
    mapping(address => uint256) public feesCollected;

    constructor(address _owner, address _vault) {
        owner = _owner;
        vault = _vault;
    }

    modifier onlyOwner {
        require(owner == msg.sender, "NOT OWNER");
        _;
    }

    function getLength(IVault.AssetManagerTransfer[] memory array)
        public
        view
        returns (uint256)
    {
        return array.length;
    }

    IVault.PoolBalanceOp[] public withdraws;
    IVault.PoolBalanceOp[] public updates;

    function _manageAndUpdatePoolBalanceOcean(
        bytes32 poolId,
        IVault.AssetManagerTransfer[] memory transfers
    ) internal {
        // USE TOKEN LENTGH FROM POOL ID or use lentgh from collectFee and pass it as argument

        for (uint256 i = 0; i < getLength(transfers); i++) {
            IVault.PoolBalanceOp memory transfer =
                IVault.PoolBalanceOp(
                    IVault.PoolBalanceOpKind.WITHDRAW,
                    poolId,
                    transfers[i].token,
                    transfers[i].amount
                );

            withdraws.push(transfer);
        }
        IVault(vault).managePoolBalance(withdraws);
        delete withdraws;
        
        for (uint256 i = 0; i < getLength(transfers); i++) {
            IVault.PoolBalanceOp memory update =
                IVault.PoolBalanceOp(
                    IVault.PoolBalanceOpKind.UPDATE,
                    poolId,
                    transfers[i].token,
                    0 // We report it as 'full losses'
                );

            updates.push(update);
        }
        IVault(vault).managePoolBalance(updates);
        delete updates;
        // At this stage all balances are in the Asset Manager
        // We should then add a function to transfer them to the OPF Community Collector
    }

    function collectFee(
        bytes32 poolId,
        IVault.AssetManagerTransfer[] memory transfers
    ) external onlyOwner {
        // TODO: GET NUMBER OF TOKEN FROM POOL ID and create the transfers(IVault.AssetManagerTransfer[]) during the loop

        for (uint256 i = 0; i < getLength(transfers); i++) {
            uint256 totalFee =
                IBaseGeneralPool(pool).communityFees(
                    address(transfers[i].token)
                );
            uint256 actualFee =
                totalFee - feesCollected[address(transfers[i].token)];
            feesCollected[address(transfers[i].token)] =
                feesCollected[address(transfers[i].token)] +
                actualFee;
            transfers[i].amount = actualFee;

            _manageAndUpdatePoolBalanceOcean(poolId, transfers);
            
        }
    }
}
