pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

/**
* @title Fee Calculator Contract
* @author Ocean Protocol Team
*
* @dev Implementation of Fee Calculator
*      Fee calculator provides some helper functions
*/
contract FeeCalculator {

    using SafeMath for uint256;
    uint256 constant private BASE_TX_COST = 44000;
    uint256 constant private BASE = 10;
    
    /**
     * @dev calculateRange
     *      For a given number, calculates number of zeros.
     * @param number input number value.
     * @return number of zeros.
     */
    function calculateRange(
        uint256 number
    ) 
        public
        pure
        returns(uint256)
    {
        uint256 remainder = number;
        uint256 zeros = 0;
        for(uint256 i = 0 ; remainder >= BASE; i++){
            remainder = remainder.div(BASE);
            zeros += 1;
        }
        return zeros;
    }
    
    /**
     * @dev calculateFee
     *      calculates the fee based on the number of minted tokens compared to
     *      the capital
     * @param tokens the amount of minted tokens.
     * @param cap the capital
     * @return fee.
     */
    function calculateFee(
        uint256 tokens,
        uint256 cap
    )
        public
        pure
        returns(uint256)
    {
        require(
            cap >= tokens,
            'FeeCalculator: Invalid cap'
        );
        
        uint256 tokensRange = calculateRange(tokens);
        uint256 tokensRangeToll = tokensRange.mul(BASE_TX_COST);
        return tokensRangeToll.div(
                calculateRange(cap)
            ).div(BASE);
    }
}