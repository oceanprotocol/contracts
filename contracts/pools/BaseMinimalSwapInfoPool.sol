// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "./BasePool.sol";
import "@balancer-labs/v2-vault/contracts/interfaces/IMinimalSwapInfoPool.sol";

import "hardhat/console.sol";

/**
 * @dev Extension of `BasePool`, adding a handler for `IMinimalSwapInfoPool.onSwap`.
 *
 * Derived contracts must implement `_onSwapGivenIn` and `_onSwapGivenOut` along with `BasePool`'s virtual functions.
 */
abstract contract BaseMinimalSwapInfoPool is IMinimalSwapInfoPool, BasePool {
    using FixedPoint for uint256;

    constructor(
        IVault vault,
        string[2] memory identifiers,
        //string memory name,
        //string memory symbol,
        IERC20[] memory tokens,
        uint256 swapFeePercentage,
        uint256 oceanFee,
        uint256 marketFee,
        uint256 pauseWindowDuration,
        uint256 bufferPeriodDuration,
        address[3] memory addresses
        // address owner,
        // address ssStaking,
        // address marketFeeCollector
    )
        BasePool(
            vault,
            tokens.length == 2 ? IVault.PoolSpecialization.TWO_TOKEN : IVault.PoolSpecialization.MINIMAL_SWAP_INFO,
            identifiers,
            // name,
            // symbol,
            tokens,
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
    {
      
        // solhint-disable-previous-line no-empty-blocks
    }

    // Swap Hooks

    function onSwap(
        SwapRequest memory request,
        uint256 balanceTokenIn,
        uint256 balanceTokenOut
    ) external virtual override returns (uint256) {
        uint256 scalingFactorTokenIn = _scalingFactor(request.tokenIn);
        uint256 scalingFactorTokenOut = _scalingFactor(request.tokenOut);

        if (request.kind == IVault.SwapKind.GIVEN_IN) {
            // Fees are subtracted before scaling, to reduce the complexity of the rounding direction analysis.
            uint256 initialAmount = request.amount;
            console.log(initialAmount,'InitialAmount in swap');
            request.amount = _subtractSwapFeeAmount(initialAmount);
            console.log(request.amount,'amount after subracting swap fee before ocean and market cut');
            uint256 oceanFee = _calculateOceanFeeAmount(request.tokenIn, initialAmount);
            console.log(oceanFee,'oceanFee on swap');
            uint256 marketFee =  _calculateMarketFeeAmount(request.tokenIn, initialAmount);
            console.log(marketFee, 'marketFee on swap');
            request.amount = request.amount.sub(oceanFee).sub(marketFee);
            console.log(request.amount,'actual Amount swapped after all cuts');
            // All token amounts are upscaled.
            balanceTokenIn = _upscale(balanceTokenIn, scalingFactorTokenIn);
            balanceTokenOut = _upscale(balanceTokenOut, scalingFactorTokenOut);
            request.amount = _upscale(request.amount, scalingFactorTokenIn);

            uint256 amountOut = _onSwapGivenIn(request, balanceTokenIn, balanceTokenOut);

            // amountOut tokens are exiting the Pool, so we round down.
            return _downscaleDown(amountOut, scalingFactorTokenOut);
        } else {
            // All token amounts are upscaled.
            balanceTokenIn = _upscale(balanceTokenIn, scalingFactorTokenIn);
            balanceTokenOut = _upscale(balanceTokenOut, scalingFactorTokenOut);
            request.amount = _upscale(request.amount, scalingFactorTokenOut);

            uint256 amountIn = _onSwapGivenOut(request, balanceTokenIn, balanceTokenOut);

            // amountIn tokens are entering the Pool, so we round up.
            amountIn = _downscaleUp(amountIn, scalingFactorTokenIn);

            // Fees are added after scaling happens, to reduce the complexity of the rounding direction analysis.
            // TODO: remove console log and test variables
            console.log(amountIn,'InitialAmount in swap');
            uint256 oceanFee = _calculateOceanFeeAmount(request.tokenIn, amountIn);
            console.log(oceanFee,'oceanFee in swap');
            uint256 marketFee = _calculateMarketFeeAmount(request.tokenIn, amountIn);
            console.log(oceanFee,'markteFee in swap');
            uint256 test = _addSwapFeeAmount(amountIn);
            uint256 test1 = test.add(oceanFee).add(marketFee);
            console.log(test, 'amount after bal swap fee');
            console.log(test1, 'finalAmount after fees');
            return _addSwapFeeAmount(amountIn).add(oceanFee).add(marketFee);
        }
    }

    /*
     * @dev Called when a swap with the Pool occurs, where the amount of tokens entering the Pool is known.
     *
     * Returns the amount of tokens that will be taken from the Pool in return.
     *
     * All amounts inside `swapRequest`, `balanceTokenIn` and `balanceTokenOut` are upscaled. The swap fee has already
     * been deducted from `swapRequest.amount`.
     *
     * The return value is also considered upscaled, and will be downscaled (rounding down) before returning it to the
     * Vault.
     */
    function _onSwapGivenIn(
        SwapRequest memory swapRequest,
        uint256 balanceTokenIn,
        uint256 balanceTokenOut
    ) internal view virtual returns (uint256);

    /*
     * @dev Called when a swap with the Pool occurs, where the amount of tokens exiting the Pool is known.
     *
     * Returns the amount of tokens that will be granted to the Pool in return.
     *
     * All amounts inside `swapRequest`, `balanceTokenIn` and `balanceTokenOut` are upscaled.
     *
     * The return value is also considered upscaled, and will be downscaled (rounding up) before applying the swap fee
     * and returning it to the Vault.
     */
    function _onSwapGivenOut(
        SwapRequest memory swapRequest,
        uint256 balanceTokenIn,
        uint256 balanceTokenOut
    ) internal view virtual returns (uint256);
}