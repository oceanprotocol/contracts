pragma solidity ^0.7.0;

import "@balancer-labs/v2-vault/contracts/interfaces/IVault.sol";
import "@balancer-labs/v2-pool-utils/contracts/factories/FactoryWidePauseWindow.sol";
import "../WeightedPool.sol";
import "./BasePoolSplitCodeFactory.sol";
import "../../interfaces/IFriendlyFactory.sol";

contract OceanPoolFactory is BasePoolSplitCodeFactory, FactoryWidePauseWindow {
    IVault public vault;

    constructor(IVault _vault)
        BasePoolSplitCodeFactory(vault, type(WeightedPool).creationCode)
    {
        vault = _vault;
    }

    function _createPool(
        string[2] memory identifiers,
        // string memory name,
        // string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory weights,
        uint256 swapFeePercentage,
        uint256 oceanFee,
        uint256 marketFee,
        address[3] memory addresses
        // address owner,
        // address ssStaking,
        // address marketFeeCollector
    ) internal returns (address) {
        (
            uint256 pauseWindowDuration,
            uint256 bufferPeriodDuration
        ) = getPauseConfiguration();

        address pool = _create(
            abi.encode(
                vault,
                identifiers,
                // name,
                // symbol,
                tokens,
                weights,
                swapFeePercentage,
                oceanFee,
                marketFee,
                pauseWindowDuration,
                bufferPeriodDuration,
                addresses
                // owner,
                // ssStaking,
                // marketFeeCollector
            )
        );

        return pool;
    }
}
