pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';
import '../interfaces/IERC20Template.sol';

/**
 * @title FixedRateExchange
 * @dev FixedRateExchange is a fixed rate exchange Contract
 */
contract FixedRateExchange is Ownable {

    struct FixedRatePool {
        address poolOwner;
        address baseToken;
        uint256 fixedRate;
    }

    // map a dataToken to a fixedRatePool
    mapping(address => FixedRatePool) fixedRatePools;

    // /**
    //  * @dev constructor
    //  *      Called on contract deployment.  Could not be called with zero address parameters or zero ratio
    //  * @param lpAddress address that is providing liquidity (usually datatoken minter)
    //  * @param basetoken base token (IE: Ocean)
    //  * @param datatoken DataToken address
    //  * @param ratio exchange rate (IE: How many basetokens are required to get a DataToken)
    //  */
    // constructor(
    //     address lpAddress,
    //     address basetoken,
    //     address datatoken,
    //     uint256 ratio
    // ) public {
    //     _initialize(lpAddress, basetoken, datatoken, ratio);
    // }

    // function initialize(
    //     address lpAddress,
    //     address basetoken,
    //     address datatoken,
    //     uint256 ratio
    // ) public onlyNotInitialized returns (bool) {
    //     return _initialize(lpAddress, basetoken, datatoken, ratio);
    // }

    // function _initialize(
    //     address lpAddress,
    //     address basetoken,
    //     address datatoken,
    //     uint256 ratio
    // ) private onlyNotInitialized returns (bool) {
    //     require(
    //         lpAddress != address(0),
    //         'FPLPTemplate: Invalid LP,  zero address'
    //     );
    //     require(
    //         basetoken != address(0),
    //         'FPLPTemplate: Invalid basetoken,  zero address'
    //     );
    //     require(
    //         datatoken != address(0),
    //         'FPLPTemplate: Invalid datatoken,  zero address'
    //     );
    //     require(
    //         basetoken != datatoken,
    //         'PLPTemplate: Invalid datatoken,  equals basetoken'
    //     );
    //     require(ratio > 0, 'FPLPTemplate: Invalid ratio value');
    //     _lpAddress = lpAddress;
    //     _basetoken = basetoken;
    //     _datatoken = datatoken;
    //     _ratio = ratio;
    // }

    // /**
    //  * @dev isInitialized
    //  *      Function checks if the contract is initialized.
    //  * @return true if the contract is initialized, false if it is not.
    //  */

    // function isInitialized() public view returns (bool) {
    //     return initialized;
    // }

    // /**
    //  * @dev buyDataTokens
    //  *      Buys Datatokens using base token
    //  * @param dtAmount amount of DataTokens to be bought
    //  * @return true
    //  */
    // function buyDataTokens(uint256 dtAmount) public 
    // onlyInitialized returns (bool) {
    //     //TO DO - This assumes that ratio is going to be always expressed in wei
    //     uint256 baseAmount = dtAmount * (_ratio / (10**18));
    //     //TO DO  - should we check the reserve first or just let it fail if there is not enough DT ?
    //     require(
    //         IERC20Template(_basetoken).transfer(_lpAddress, baseAmount),
    //         'ERROR: transfer failed'
    //     );
    //     require(
    //         IERC20Template(_datatoken).transferFrom(
    //             _lpAddress,
    //             msg.sender,
    //             dtAmount
    //         ),
    //         'ERROR: transferFrom failed'
    //     );
    //     return true;
    // }

    // /**
    //  * @dev getRatio
    //  *      Gets Ratio
    //  * @return uint ratio
    //  */
    // function getRatio() public view onlyInitialized returns (uint256) {
    //     return (_ratio);
    // }

    // /**
    //  * @dev SetRatio
    //  *      Sets a new Ratio
    //  * @return uint ratio
    //  */
    // function setRatio(uint ratio) public 
    // onlyOwner onlyInitialized returns (bool) {
    //     require(ratio>0,'Ratio must be >0');
    //     uint oldratio = _ratio;
    //     _ratio = ratio;
    //     emit RatioChanged(oldratio,ratio);
    //     return true;

    // }

    // /**
    //  * @dev getTokens
    //  *      Gets tokens addresses
    //  * @return address[] tokens
    //  */
    // function getTokens() public view 
    // onlyInitialized returns (address[] memory) {
    //     address[] memory tokens = new address[](2);
    //     tokens[0] = _basetoken;
    //     tokens[1] = _datatoken;
    //     return (tokens);
    // }

    // /**
    //  * @dev getDTReserve
    //  *      Gets amount of DT available to trade
    //  * @return uint amount of DT
    //  */
    // function getDTReserve() public view onlyInitialized returns (uint256) {
    //     //get both balance & allowence and return the smaller one
    //     uint256 balance = IERC20Template(_datatoken).balanceOf(_lpAddress);
    //     uint256 allowance = IERC20Template(_datatoken).allowance(
    //         _lpAddress,
    //         address(this)
    //     );
    //     if (balance < allowance) return (balance);
    //     else return (allowance);
    // }
}