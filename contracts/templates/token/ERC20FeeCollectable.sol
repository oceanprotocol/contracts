pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';
import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';


contract ERC20FeeCollectable is Ownable {
    using SafeMath for uint256;
    address[] public collectors;
    uint256 public constant BASE = 10**18;
    uint256 public constant BASE_COMMUNITY_FEE = BASE / 100;
    mapping(address => uint256) public fees;

    constructor(
        address communityFeeCollector
    )
        public
        Ownable()
    {
        _initialize(msg.sender, communityFeeCollector);
    }

    function initialize(
        address contractOwner,
        address communityFeeCollector
    )
        internal
    {
        _initialize(contractOwner, communityFeeCollector);
    }

    function _initialize(
        address contractOwner,
        address communityFeeCollector
    )
        private
    {
        transferOwnership(contractOwner);
        collectors.push(communityFeeCollector);
        fees[communityFeeCollector] = BASE_COMMUNITY_FEE;
    }

    function getFee(
        address collector,
        uint256 value
    )
        internal
        view
        returns(uint256)
    {
        return value.mul(fees[collector]).div(BASE);
    }

    function setFee(
        address collector,
        uint256 baseFee
    )
        external
        onlyOwner
    {
        require(
            collector != address(0),
            'ERC20FeeCollectable: invalid collector address'
        );
        require(
            collectors[0] != collector,
            'ERC20FeeCollectable: community collector fee can not be changed'
        );
        fees[collector] = baseFee;
        collectors.push(collector);
    }
}