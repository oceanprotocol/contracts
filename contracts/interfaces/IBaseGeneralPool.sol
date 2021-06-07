// SPDX-License-Identifier: MIT

pragma solidity >=0.7.0;

interface IBaseGeneralPool {

    function communityFees(address token) external returns (uint);
}