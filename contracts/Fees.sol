pragma solidity ^0.5.3;

import '@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol';

contract Fees {

	using SafeMath for uint256;

    function _getFee(
        uint256 _startGas
    )
    public
    view 
    returns(uint256)
    {
        uint256 usedGas = _startGas.sub(gasleft());
    	return  usedGas.mul(tx.gasprice); 
    }

    function _getCashback(
        uint256 _fee,
        uint256 _payed
    )
    public
    view 
    returns(uint256)
    {
        return _payed.sub(_fee);
    }
}