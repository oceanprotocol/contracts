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
        bool enabled;
    }

    // map a poolId to a fixedRatePool
    mapping(bytes32 => FixedRatePool) fixedRatePools;
    bytes32[] poolIds;

    modifier onlyExistPool(
        address baseToken,
        address dataToken
    )
    {
        bytes32 id = generatePoolId(
            baseToken,
            dataToken
        );
        require(
            fixedRatePools[id].fixedRate != 0,
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

    event RateChanged(
        bytes32 indexed poolId,
        address indexed poolOwner,
        uint256 newRate
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
            enabled: true
        });
        poolIds.push(id);

        emit PoolCreated(
            msg.sender,
            baseToken,
            dataToken,
            fixedRate
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
        onlyExistPool(
            baseToken,
            dataToken
        )
    {
        bytes32 id = generatePoolId(
            baseToken,
            dataToken
        );
        uint256 baseTokenAmount = 
            dataTokenAmount.mul(fixedRatePools[id].fixedRate) ;
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
        emit RateChanged(
            poolId,
            msg.sender,
            newRate
        );
    }


    function enablePool(
        bytes32 poolId
    )
        external
        onlyPoolOwner(poolId)
    {
        require(
            fixedRatePools[poolId].enabled == false,
            'FixedRateExchange: pool is already enabled'
        );

        fixedRatePools[poolId].enabled = true;
    }

    function disablePool(
        bytes32 poolId
    )
        external
        onlyPoolOwner(poolId)
    {
        require(
            fixedRatePools[poolId].enabled == true,
            'FixedRateExchange: pool is already disabled'
        );

        fixedRatePools[poolId].enabled = false;
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
            bool enabled
        )
    {
        poolOwner = fixedRatePools[poolId].poolOwner;
        dataToken = fixedRatePools[poolId].dataToken;
        baseToken = fixedRatePools[poolId].baseToken;
        fixedRate = fixedRatePools[poolId].fixedRate;
        enabled = fixedRatePools[poolId].enabled;
    }


}