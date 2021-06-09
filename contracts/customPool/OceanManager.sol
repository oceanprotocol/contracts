pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "../interfaces/IERC20.sol";
import "../interfaces/IVault.sol";
import "../interfaces/IWeightedPool.sol";

contract OceanManager {
    address public owner;
    address public vault;
    address public pool;
    address public communityFC;
    mapping(address => uint256) public feesCollected;

    constructor(
        address _owner,
        address _vault,
        address _communityFC
    ) {
        owner = _owner;
        vault = _vault;
        communityFC = _communityFC;
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
        bytes32[] memory poolIds,
        IVault.AssetManagerTransfer[] memory transfers
    ) internal {
        // USE TOKEN LENTGH FROM POOL ID or use lentgh from collectFee and pass it as argument
        for (uint256 j = 0; j < getPoolsLength(poolIds); j++) {
            
            for (uint256 i = 0; i < getLength(transfers); i++) {
                IVault.PoolBalanceOp memory transfer =
                    IVault.PoolBalanceOp(
                        IVault.PoolBalanceOpKind.WITHDRAW,
                        poolIds[i],
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
                        poolIds[i],
                        transfers[i].token,
                        0 // We report it as 'full losses'
                    );

                updates.push(update);
            }
            IVault(vault).managePoolBalance(updates);
            delete updates;
        }
        // At this stage all balances are in the Asset Manager
      
    }

  
    function collectFee(
        bytes32[] memory poolIds,
        IVault.AssetManagerTransfer[] memory transfers
    ) external onlyOwner {
        // TODO?: GET NUMBER OF TOKEN FROM POOL ID and create the transfers(IVault.AssetManagerTransfer[]) during the loop (more costly!)
        for (uint256 j = 0; j < getPoolsLength(poolIds); j++) {
            for (uint256 i = 0; i < getLength(transfers); i++) {
                uint256 totalFee =
                    IWeightedPool(pool).communityFees(
                        address(transfers[i].token)
                    );
                uint256 actualFee =
                    totalFee - feesCollected[address(transfers[i].token)];

                feesCollected[address(transfers[i].token)] =
                    feesCollected[address(transfers[i].token)] +
                    actualFee;

                transfers[i].amount = actualFee;
            }
        }

        _manageAndUpdatePoolBalanceOcean(poolIds, transfers);
    }

    function getTokensLength(IERC20[] memory array)
        internal
        view
        returns (uint256)
    {
        return array.length;
    }

    function getPoolsLength(bytes32[] memory array)
        internal
        view
        returns (uint256)
    {
        return array.length;
    }

    // We could do it this way or deciding to batch swap into a single token(OCEAN? Stablecoin?) and then send it to the community collector
    function transferToOPFCollector(IERC20[] memory tokens) external onlyOwner {
        for (uint256 i = 0; i < getTokensLength(tokens); i++) {
            tokens[i].transfer(communityFC, tokens[i].balanceOf(address(this)));
        }
    }

    // TODO: add batch swap 
}
