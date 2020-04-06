pragma solidity ^0.5.3;

import '@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol';

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
    	return  _msgValue >= usedGas.mul(tx.gasprice); //TODO: should be changed to '=='
    }

}