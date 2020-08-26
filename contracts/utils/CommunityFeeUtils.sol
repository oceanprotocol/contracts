pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

contract CommunityFeeUtils {
    using SafeMath for uint256;
    uint256 public constant BASE = 10**18;
    uint256 public constant COMMUNITY_FEE_BASE = BASE / 100;
    address private collector;

    function setCollector(
        address _collector
    )
        internal 
    {
        require(
            _collector != address(0),
            'FeeUtils: invalid community fee collector address'
        );
        collector = _collector;
    }

    function calcCommunityFee(
        uint256 value
    )
        internal
        pure
        returns(uint256)
    {
        return value.mul(COMMUNITY_FEE_BASE).div(BASE);
    }

    function getCollector()
        public
        view
        returns(address)
    {
        return collector;
    }
}