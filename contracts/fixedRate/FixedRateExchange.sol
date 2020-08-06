pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import '../interfaces/IERC20Template.sol';

/**
 * @title FixedRateExchange
 * @dev FixedRateExchange is a fixed rate exchange Contract
 */
contract FixedRateExchange {

    struct FixedRatePool {
        address poolOwner;
        address dataToken;
        address baseToken;
        uint256 fixedRate;
    }

    // map a poolId to a fixedRatePool
    mapping(bytes32 => FixedRatePool) fixedRatePools;
    bytes32[] poolIds;

    modifier onlyExistPool(
        address baseToken,
        address dataToken
    )
    {
        bytes32 id = getPoolId(
            baseToken,
            dataToken
        );
        require(
            fixedRatePools[id].fixedRate != 0,
            'FixedRateExchange: Pool does not exist!'
        );
        _;
    }

    event PoolCreated(
        address indexed poolOwner,
        address indexed baseToken,
        address indexed dataToken,
        uint fixedRate
    );


    event Swaped(
        bytes32 indexed poolId,
        address indexed by,
        uint256 baseTokenSwapedAmount,
        uint256 dataTokenSwapedamount
    );


    constructor () public {}

    function getPools()
        external 
        view 
        returns (bytes32[] memory)
    {
        return poolIds;
    }

    function createPool(
        address baseToken,
        address dataToken,
        uint256 fixedRate
    )
        external
    {
        bytes32 id = getPoolId(
            baseToken,
            dataToken
        );
        require(
            fixedRatePools[id].fixedRate == 0,
            'FixedRateExchange: Pool already exists!'
        );

        require(
            baseToken != address(0),
            'FixedRateExchange: Invalid basetoken,  zero address'
        );
        require(
            dataToken != address(0),
            'FixedRateExchange: Invalid datatoken,  zero address'
        );
        require(
            baseToken != dataToken,
            'FixedRateExchange: Invalid datatoken,  equals basetoken'
        );
        require(
            fixedRate > 0, 
            'FixedRateExchange: Invalid exchange rate value'
        );

        fixedRatePools[id] = FixedRatePool({
            poolOwner: msg.sender,
            dataToken: dataToken,
            baseToken: baseToken,
            fixedRate: fixedRate
        });
        poolIds.push(id);

        emit PoolCreated(
            msg.sender,
            baseToken,
            dataToken,
            fixedRate
        );
    }

    function getPoolId(
        address baseToken,
        address dataToken
    )
        public
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                baseToken,
                dataToken
            )
        );
    }

    function swap(
        address baseToken,
        address dataToken,
        uint dataTokenAmount
    )
        external
        onlyExistPool(
            baseToken,
            dataToken
        )
    {
        bytes32 id = getPoolId(
            baseToken,
            dataToken
        );
        uint256 baseTokenAmount = 
            dataTokenAmount * fixedRatePools[id].fixedRate ;
        require(
            IERC20Template(baseToken).transfer(
                fixedRatePools[id].poolOwner, 
                baseTokenAmount
            ),
            'FixedRateExchange: transfer failed in the baseToken contract'
        );
        require(
            IERC20Template(dataToken).transferFrom(
                fixedRatePools[id].poolOwner,
                msg.sender,
                dataTokenAmount
            ),
            'FixedRateExchange: transferFrom failed in the dataToken contract'
        );

        emit Swaped(
            id,
            msg.sender,
            baseTokenAmount,
            dataTokenAmount
        );
    }

    function getNumberOfPools()
        external
        view
        returns (uint256)
    {
        return poolIds.length;
    }

    // TODO: 
    // set rate
    // get rate
}