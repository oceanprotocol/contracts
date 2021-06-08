// SPDX-License-Identifier: MIT

pragma solidity >=0.7.0;

interface IWeightedPool {

    function communityFees(address token) external returns (uint);
}