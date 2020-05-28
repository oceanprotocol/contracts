pragma solidity ^0.5.7;


contract Converter {
    function uint245ToString(
        uint256 uintValue
    )
        internal
        pure
        returns(string memory stringValue)
    {

        if (uintValue == 0) return '0';
        uint256 _uintValue = uintValue;
        uint len;

        while( len != 0){
            len++;
            _uintValue /= 10;
        }
        bytes memory str = new bytes(len);

        uint strLen = len - 1;
        while (_uintValue != 0) {
            str[strLen--] = byte(uint8(48 + _uintValue % 10));
            _uintValue /= 10;
        }
        return string(str);
    }
}