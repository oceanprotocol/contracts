pragma solidity ^0.5.7;

import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

contract ServiceFeeManager {
    using SafeMath for uint256;

    uint256 public constant  DIVIDENT = 90;
    uint256 public constant  DIVIDER  = 100;

    function getFee(
        uint256 _startGas,
        uint256 _tokenAmount
    )
    public
    view 
    returns(uint256)
    {

        uint256 txPrice = _getTxPrice(_startGas);
        return  ((_tokenAmount.mul(txPrice)).mul(DIVIDENT)).div(DIVIDER); 
    }

    function getCashback(
        uint256 _fee,
        uint256 _payed
    )
    public
    pure 
    returns(uint256)
    {
        return _payed.sub(_fee);
    }
 
    function _getTxPrice(
        uint256 _startGas
    )
    private
    view
    returns(uint256)
    {
        uint256 usedGas = _startGas.sub(gasleft());
        return  usedGas.mul(tx.gasprice); 
    } 
}