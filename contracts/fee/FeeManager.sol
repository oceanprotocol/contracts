pragma solidity ^0.5.7;

import './FeeCalculator.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

contract FeeManager {
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