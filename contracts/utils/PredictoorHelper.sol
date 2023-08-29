pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0
import "../interfaces/IERC20Template.sol";
import "../interfaces/IFixedRateExchange.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20Template3 is IERC20Template {
    function submitTrueVal(
        uint256 epoch_start,
        bool trueValue,
        bool cancelRound
    ) external;

    function buyFromFreAndOrder(
        OrderParams calldata _orderParams,
        FreParams calldata _freParams
    ) external;

    struct OrderParams {
        address consumer;
        uint256 serviceIndex;
        providerFee _providerFee;
        consumeMarketFee _consumeMarketFee;
    }
    struct FreParams {
        address exchangeContract;
        bytes32 exchangeId;
        uint256 maxBaseTokenAmount;
        uint256 swapMarketFee;
        address marketFeeAddress;
    }
}

contract PredictoorHelper is Ownable {
    event OrderStarted(
        address indexed consumer,
        address payer,
        uint256 amount,
        uint256 serviceIndex,
        uint256 timestamp,
        address indexed publishMarketAddress,
        uint256 blockNumber
    );

    function consumeMultiple(
        address[] calldata addresses,
        uint256[] calldata times,
        address tokenAddress
    ) external {
        IERC20Template token = IERC20Template(tokenAddress);
        uint256 balanceStart = token.balanceOf(address(this));
        for (uint256 i = 0; i < addresses.length; i++) {
            IERC20Template3.fixedRate[] memory frates = IERC20Template3(
                addresses[i]
            ).getFixedRates();
            address fixedRateAddr = frates[0].contractAddress;
            bytes32 id = frates[0].id;

            IFixedRateExchange exchange = IFixedRateExchange(fixedRateAddr);

            (uint256 baseTokenAmount, , , ) = exchange.calcBaseInGivenOutDT(
                id,
                1 ether,
                0
            );

            require(
                token.transferFrom(
                    msg.sender,
                    address(this),
                    baseTokenAmount * times[i]
                ),
                "transfer failed"
            );

            token.approve(addresses[i], baseTokenAmount * times[i]);
            IERC20Template3.OrderParams memory orderParams = IERC20Template3
                .OrderParams(
                    msg.sender,
                    0,
                    IERC20Template.providerFee({
                        providerFeeAddress: address(0),
                        providerFeeToken: address(0),
                        providerFeeAmount: 0,
                        v: 0,
                        r: bytes32(0),
                        s: bytes32(0),
                        validUntil: 0,
                        providerData: ""
                    }),
                    IERC20Template.consumeMarketFee(address(0), address(0), 0)
                );
            IERC20Template3.FreParams memory freParams = IERC20Template3
                .FreParams(fixedRateAddr, id, baseTokenAmount, 0, address(0));

            for (uint256 j = 0; j < times[i]; j++) {
                IERC20Template3(addresses[i]).buyFromFreAndOrder(
                    orderParams,
                    freParams
                );
            }
        }
        uint256 balanceAfter = token.balanceOf(address(this));
        require(balanceAfter >= balanceStart, "lost balance");
        if (balanceAfter > balanceStart) {
            // refund extra
            token.transfer(msg.sender, balanceAfter - balanceStart);
        }
    }

    function submitTruevalContracts(
        address[] calldata contract_addrs,
        uint256[][] calldata epoch_starts,
        bool[][] calldata trueVals,
        bool[][] calldata cancelRounds
    ) external onlyOwner {
        require(
            contract_addrs.length == epoch_starts.length &&
                epoch_starts.length == trueVals.length &&
                trueVals.length == cancelRounds.length,
            "All input arrays must have the same length"
        );
        for (uint256 i = 0; i < contract_addrs.length; i++) {
            _submitTruevals(
                contract_addrs[i],
                epoch_starts[i],
                trueVals[i],
                cancelRounds[i]
            );
        }
    }

    function submitTruevals(
        address contract_addr,
        uint256[] calldata epoch_starts,
        bool[] calldata trueVals,
        bool[] calldata cancelRounds
    ) external onlyOwner {
        _submitTruevals(contract_addr, epoch_starts, trueVals, cancelRounds);
    }

    function _submitTruevals(
        address contract_addr,
        uint256[] calldata epoch_starts,
        bool[] calldata trueVals,
        bool[] calldata cancelRounds
    ) internal {
        for (uint256 i = 0; i < epoch_starts.length; i++) {
            require(
                epoch_starts.length == trueVals.length &&
                    trueVals.length == cancelRounds.length,
                "All input arrays must have the same length"
            );
            IERC20Template3(contract_addr).submitTrueVal(
                epoch_starts[i],
                trueVals[i],
                cancelRounds[i]
            );
        }
    }
}
