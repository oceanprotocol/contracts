pragma solidity ^0.8.0;

import "../interfaces/IV3ERC20.sol";
import "hardhat/console.sol";

contract V3Integration {

    mapping(address => bool ) public v3DT;

    function _wrap(address datatoken) internal {
        require(IV3ERC20(datatoken).minter() == msg.sender, 'ERC721Template: NOT ERC20 V3 datatoken owner');
        v3DT[datatoken] = true;
        IV3ERC20(datatoken).approveMinter();
        require(IV3ERC20(datatoken).minter() == address(this),"ERC721Template: FAILED TO SET NEW MINTER");      
    }
        
    function _checkV3DT(address datatoken) internal view {
        require(v3DT[datatoken] == true,"ERC721Template: v3Datatoken not WRAPPED");
    }

   
}