pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0
import '../interfaces/IERC20Template.sol';
import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';


/**
 * @title OPFCommunityFeeCollector
 * @dev Ocean Protocol Foundation Community Fee Collector contract
 *      allows consumers to pay very small fee as part of the exchange of 
 *      data tokens with ocean token in order to support the community of  
 *      ocean protocol and provide a sustainble development.
 */
contract OPFCommunityFeeCollector is Ownable {
    address payable private collector;
    /**
     * @dev constructor
     *      Called prior contract deployment. set the controller address and
     *      the contract owner address
     * @param newCollector the fee collector address.
     * @param OPFOwnerAddress the contract owner address
     */
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
            'OPFCommunityFeeCollector: collector address or owner is invalid address'
        );
        collector = newCollector;
        transferOwnership(OPFOwnerAddress);
    }

    function() external payable {}

    /**
     * @dev constructor
     *      Called prior contract deployment. set the controller address and
     *      the contract owner address
     * @param newCollector the fee collector address.
     * @param OPFOwnerAddress the contract owner address
     */
    function withdrawETH() 
        external 
        payable
    {
        collector.transfer(address(this).balance);
    }

    function withdrawToken(
        address tokenAddress
    ) 
        external
    {
        require(
            tokenAddress != address(0),
            'OPFCommunityFeeCollector: invalid token contract address'
        );

        IERC20Template(tokenAddress).transfer(
            collector,
            IERC20Template(tokenAddress).balanceOf(address(this))
        );
    }

    function changeCollector(
        address payable newCollector
    ) 
        external 
        onlyOwner 
    {
        require(
            newCollector != address(0),
            'OPFCommunityFeeCollector: invalid collector address'
        );
        collector = newCollector;
    }
}
