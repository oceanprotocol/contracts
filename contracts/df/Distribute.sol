// BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND MIT)

pragma solidity 0.8.12;

interface IVestingContract{
    function release(address token) external;
}

interface ISplitter{
    function release(address token) external;
}

contract Distribute{
    function distribute(address token, address vestingContract, address splitterContract) external{
        IVestingContract(vestingContract).release(token);
        ISplitter(splitterContract).release(token);
    }

    function distributeMultiple(address token, address[] memory vestingContract, address splitterContract) external{
        for(uint256 i=0; i < vestingContract.length; i++){
            IVestingContract(vestingContract[i]).release(token);
        }
        ISplitter(splitterContract).release(token);
    }
}