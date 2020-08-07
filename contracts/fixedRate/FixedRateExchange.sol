pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import '../interfaces/IERC20Template.sol';
import 'openzeppelin-solidity/contracts/math/SafeMath.sol';

/**
 * @title FixedRateExchange
 * @dev FixedRateExchange is a fixed rate exchange Contract
 */
contract FixedRateExchange {
    using SafeMath for uint256;

    struct FixedRatePool {
        address poolOwner;
        address dataToken;
        address baseToken;
        uint256 fixedRate;
        bool active;
    }

    // map a poolId to a fixedRatePool
    mapping(bytes32 => FixedRatePool) fixedRatePools;
    bytes32[] poolIds;

    modifier onlyActivePool(
        address baseToken,
        address dataToken
    )
    {
        bytes32 id = generatePoolId(
            baseToken,
            dataToken
        );
        require(
            fixedRatePools[id].fixedRate != 0 &&
            fixedRatePools[id].active == true,
            'FixedRateExchange: Pool does not exist!'
        );
        _;
    }

    modifier onlyPoolOwner(
        bytes32 poolId
    )
    {
        require(
            fixedRatePools[poolId].poolOwner == msg.sender,
            'FixedRateExchange: invalid pool owner'
        );
        _;
    }

    event PoolCreated(
        address indexed poolOwner,
        address indexed baseToken,
        address indexed dataToken,
        uint256 fixedRate
    );

    event PoolRateChanged(
        bytes32 indexed poolId,
        address indexed poolOwner,
        uint256 newRate
    );

    event PoolActivated(
        bytes32 indexed poolId,
        address indexed poolOwner,
        uint256 timestamp
    );

    event PoolDeactivated(
        bytes32 indexed poolId,
        address indexed poolOwner,
        uint256 timestamp
    );

    event Swapped(
        bytes32 indexed poolId,
        address indexed by,
        uint256 baseTokenSwappedAmount,
        uint256 dataTokenSwappedamount
    );


    constructor () public {}

    function createPool(
        address baseToken,
        address dataToken,
        uint256 fixedRate
    )
        external
    {
        bytes32 id = generatePoolId(
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
            fixedRate: fixedRate,
            active: true
        });
        poolIds.push(id);

        emit PoolCreated(
            msg.sender,
            baseToken,
            dataToken,
            fixedRate
        );

        emit PoolActivated(
            id,
            msg.sender,
            block.number
        );
    }

    function generatePoolId(
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
        uint256 dataTokenAmount
    )
        external
        onlyActivePool(
            baseToken,
            dataToken
        )
    {
        bytes32 id = generatePoolId(
            baseToken,
            dataToken
        );
        uint256 baseTokenAmount = 
            dataTokenAmount.mul(fixedRatePools[id].fixedRate).div(10 ** 18);
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

        emit Swapped(
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

    function setPoolRate(
        bytes32 poolId,
        uint256 newRate
    )
        external
        onlyPoolOwner(poolId)
    {
        require(
            newRate >0,
            'FixedRateExchange: Ratio must be >0'
        );

        fixedRatePools[poolId].fixedRate = newRate;
        emit PoolRateChanged(
            poolId,
            msg.sender,
            newRate
        );
    }


    function activatePool(
        bytes32 poolId
    )
        external
        onlyPoolOwner(poolId)
    {
        require(
            fixedRatePools[poolId].active == false,
            'FixedRateExchange: pool is already activated'
        );

        fixedRatePools[poolId].active = true;

        emit PoolActivated(
            poolId,
            msg.sender,
            block.number
        );
    }

    function deactivatePool(
        bytes32 poolId
    )
        external
        onlyPoolOwner(poolId)
    {
        require(
            fixedRatePools[poolId].active == true,
            'FixedRateExchange: pool is already deactivated'
        );

        fixedRatePools[poolId].active = false;

        emit PoolDeactivated(
            poolId,
            msg.sender,
            block.number
        );
    }

    
    function getPoolRate(
        bytes32 poolId
    )
        external
        view
        returns(uint256)
    {
        return fixedRatePools[poolId].fixedRate;
    }

    function getPool(
        bytes32 poolId
    )
        external
        view
        returns (
            address poolOwner,
            address dataToken,
            address baseToken,
            uint256 fixedRate,
            bool active
        )
    {
        poolOwner = fixedRatePools[poolId].poolOwner;
        dataToken = fixedRatePools[poolId].dataToken;
        baseToken = fixedRatePools[poolId].baseToken;
        fixedRate = fixedRatePools[poolId].fixedRate;
        active = fixedRatePools[poolId].active;
    }

    function getPools()
        external 
        view 
        returns (bytes32[] memory)
    {
        return poolIds;
    }
}