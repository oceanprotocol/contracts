pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
 * @title Converter Contract
 * @author Ocean Protocol Team
 *
 * @dev Simple types converter
 *      This contract provides sompe helper functions
 *      such as converting integers to strings
 */

contract Converter {

    /**
     * @dev uintToString
     *      converts an integer value to a string value
     * @param value refers to integer value
     * @return converted string value
     */
    function uintToString
    (
        uint256 value
    )
        public
        pure
        returns (string memory) 
    {
        if ( value == 0) {
            return '0';
        }
        uint tempUint = value;
        uint len;
        while (tempUint != 0) {
            len++;
            tempUint /= 10;
        }
        
        bytes memory bstr = new bytes(len);
        uint k = len - 1;
        tempUint = value; 
        while (tempUint != 0) {
            bstr[k--] = byte(uint8(48 + tempUint % 10));
            tempUint /= 10;
        }
        return string(bstr);
    }
}