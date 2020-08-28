pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0
import '../interfaces/IERC20Template.sol';
import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';

contract OPFCommunityFeeCollector is Ownable {
    address payable private collector;

    constructor(
        address payable newCollector,
        address OPFOwnerAddress
    ) 
        public
        Ownable()
    {
        require(
            newCollector != address(0)&&
            OPFOwnerAddress != address(0), 
        'OPFCommunityFeeCollector: whether collector address or owner is invalid address'
        );
        collector = newCollector;
        transferOwnership(OPFOwnerAddress);
    }

    function() external payable {}

    function withdrawETH() public payable {
        collector.transfer(address(this).balance);
    }

    function withdrawToken(address tokenaddress) public {
        IERC20Template(tokenaddress).transfer(
            collector,
            IERC20Template(tokenaddress).balanceOf(address(this))
        );
    }

    function changeCollector(address payable newCollector) public onlyOwner {
        require(newCollector != address(0), 'New collector should not be 0');
        collector = newCollector;
    }
}
