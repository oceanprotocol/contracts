pragma solidity ^0.5.7;


contract Converter {

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