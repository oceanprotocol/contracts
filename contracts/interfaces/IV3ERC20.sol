pragma solidity ^0.8.0;


interface IV3ERC20 {

    function minter() external returns (address);
     function approveMinter()
        external;

         function proposeMinter(address newMinter) 
        external;
}