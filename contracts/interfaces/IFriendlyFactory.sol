pragma solidity ^0.7.0;


interface IFriendlyFactory {
     function newBPool(address controller)
        external
        returns (address bpool);
}