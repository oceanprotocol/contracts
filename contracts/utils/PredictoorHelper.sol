pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0
import "../interfaces/IERC20Template.sol";

interface IERC20Template3 is IERC20Template {
    function submitTrueVal(
        uint256 epoch_start,
        bool trueValue,
        bool cancelRound
    ) external;
}

contract PredictoorHelper {
    address admin;

    constructor(address _admin) {
        admin = _admin;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not authorized");
        _;
    }

    function submitTruevalContracts(
        address[] calldata contract_addrs,
        uint256[][] calldata epoch_starts,
        bool[][] calldata trueVals,
        bool[][] calldata cancelRounds
    ) external onlyAdmin {
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
    ) external onlyAdmin {
        _submitTruevals(contract_addr, epoch_starts, trueVals, cancelRounds);
    }


    function _submitTruevals(
        address contract_addr,
        uint256[] calldata epoch_starts,
        bool[] calldata trueVals,
        bool[] calldata cancelRounds) internal {
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
