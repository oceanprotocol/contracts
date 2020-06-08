pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import './FeeCalculator.sol';
import './FeeCollector.sol';
import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';

/**
* @title Fee Manager Contract
* @author Ocean Protocol Team
*
* @dev Implementation of Fee Manager
*      manages the life cycle of the ocean service fee
*      It inherits the fee collector and fee calcualtor
*      in which allows charging fee, accumlating fee, and
*      withdraw accumalted fee (only by contract owner)
*/
contract FeeManager is FeeCalculator, FeeCollector, Ownable {
    
    constructor()
        public
        Ownable()
    {
    }

    /**
     * @dev withdraw
     *      allows contract owner to withdraw accumlated service fee.
     */
    function withdraw() 
        public
        onlyOwner
    {
        require(
            address(this).balance > 0,
            'FeeManager: Zero balance'
        );
        msg.sender.transfer(address(this).balance);
    }
}