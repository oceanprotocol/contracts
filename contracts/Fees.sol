pragma solidity ^0.5.3;

import '@openzeppelin/contracts/math/SafeMath.sol';

contract Fees {

	using SafeMath for uint256;

    function _isPayed(
        uint256 _startGas,
        uint256 _msgValue
    )
    public
    view 
    returns(bool)
    {
        uint256 usedGas = _startGas.sub(gasleft());
    	return  usedGas.mul(tx.gasprice) >= _msgValue; //TODO: should be changed to '=='
    }

}