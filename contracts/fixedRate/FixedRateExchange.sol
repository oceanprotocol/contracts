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

    struct Exchange {
        address exchangeOwner;
        address dataToken;
        address baseToken;
        uint256 fixedRate;
        bool active;
    }

    // map a exchangeId to a exchanges
    mapping(bytes32 => Exchange) exchanges;
    bytes32[] exchangeIds;

    modifier onlyActiveExchange(
        address baseToken,
        address dataToken
    )
    {
        bytes32 id = generateExchangeId(
            baseToken,
            dataToken
        );
        require(
            exchanges[id].fixedRate != 0 &&
            exchanges[id].active == true,
            'FixedRateExchange: Exchange does not exist!'
        );
        _;
    }

    modifier onlyExchangeOwner(
        bytes32 exchangeId
    )
    {
        require(
            exchanges[exchangeId].exchangeOwner == msg.sender,
            'FixedRateExchange: invalid exchange owner'
        );
        _;
    }

    event ExchangeCreated(
        bytes32 indexed exchangeId,
        address indexed baseToken,
        address indexed dataToken,
        address exchangeOwner,
        uint256 fixedRate
    );

    event ExchangeRateChanged(
        bytes32 indexed exchangeId,
        address indexed exchangeOwner,
        uint256 newRate
    );

    event ExchangeActivated(
        bytes32 indexed exchangeId,
        address indexed exchangeOwner,
        uint256 timestamp
    );

    event ExchangeDeactivated(
        bytes32 indexed exchangeId,
        address indexed exchangeOwner,
        uint256 timestamp
    );

    event Swapped(
        bytes32 indexed exchangeId,
        address indexed by,
        uint256 baseTokenSwappedAmount,
        uint256 dataTokenSwappedAmount
    );


    constructor () public {}

    function create(
        address baseToken,
        address dataToken,
        uint256 fixedRate
    )
        external
    {
        bytes32 id = generateExchangeId(
            baseToken,
            dataToken
        );
        require(
            exchanges[id].fixedRate == 0,
            'FixedRateExchange: Exchange already exists!'
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

        exchanges[id] = Exchange({
            exchangeOwner: msg.sender,
            dataToken: dataToken,
            baseToken: baseToken,
            fixedRate: fixedRate,
            active: true
        });
        exchangeIds.push(id);

        emit ExchangeCreated(
            id,
            baseToken,
            dataToken,
            msg.sender,
            fixedRate
        );

        emit ExchangeActivated(
            id,
            msg.sender,
            block.number
        );
    }

    //TODO: add exchange owner to 
    // generate unique exchange id
    function generateExchangeId(
        address baseToken,
        address dataToken
    )
        public
        pure
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
        onlyActiveExchange(
            baseToken,
            dataToken
        )
    {
        bytes32 id = generateExchangeId(
            baseToken,
            dataToken
        );
        uint256 baseTokenAmount = 
            dataTokenAmount.mul(exchanges[id].fixedRate).div(10 ** 18);
        require(
            IERC20Template(baseToken).transferFrom(
                msg.sender,
                address(this),
                baseTokenAmount
            ),
            'FixedRateExchange: transferFrom failed in the baseToken contract'
        );
        require(
            IERC20Template(dataToken).transferFrom(
                exchanges[id].exchangeOwner,
                address(this),
                dataTokenAmount
            ),
            'FixedRateExchange: transferFrom failed in the dataToken contract'
        );

        require(
            IERC20Template(baseToken).transfer(
                exchanges[id].exchangeOwner,
                baseTokenAmount
            ),
            'FixedRateExchange: transfer failed in the baseToken contract'
        );

        require(
            IERC20Template(dataToken).transfer(
                msg.sender,
                dataTokenAmount
            ),
            'FixedRateExchange: transfer failed in the dataToken contract'
        );

        emit Swapped(
            id,
            msg.sender,
            baseTokenAmount,
            dataTokenAmount
        );
    }

    function getNumberOfExchanges()
        external
        view
        returns (uint256)
    {
        return exchangeIds.length;
    }

    function setRate(
        bytes32 exchangeId,
        uint256 newRate
    )
        external
        onlyExchangeOwner(exchangeId)
    {
        require(
            newRate >0,
            'FixedRateExchange: Ratio must be >0'
        );

        exchanges[exchangeId].fixedRate = newRate;
        emit ExchangeRateChanged(
            exchangeId,
            msg.sender,
            newRate
        );
    }


    function activate(
        bytes32 exchangeId
    )
        external
        onlyExchangeOwner(exchangeId)
    {
        require(
            exchanges[exchangeId].active == false,
            'FixedRateExchange: Exchange is already activated'
        );

        exchanges[exchangeId].active = true;

        emit ExchangeActivated(
            exchangeId,
            msg.sender,
            block.number
        );
    }

    function deactivate(
        bytes32 exchangeId
    )
        external
        onlyExchangeOwner(exchangeId)
    {
        require(
            exchanges[exchangeId].active == true,
            'FixedRateExchange: Exchange is already deactivated'
        );

        exchanges[exchangeId].active = false;

        emit ExchangeDeactivated(
            exchangeId,
            msg.sender,
            block.number
        );
    }

    
    function getRate(
        bytes32 exchangeId
    )
        external
        view
        returns(uint256)
    {
        return exchanges[exchangeId].fixedRate;
    }

    function getExchange(
        bytes32 exchangeId
    )
        external
        view
        returns (
            address exchangeOwner,
            address dataToken,
            address baseToken,
            uint256 fixedRate,
            bool active
        )
    {
        exchangeOwner = exchanges[exchangeId].exchangeOwner;
        dataToken = exchanges[exchangeId].dataToken;
        baseToken = exchanges[exchangeId].baseToken;
        fixedRate = exchanges[exchangeId].fixedRate;
        active = exchanges[exchangeId].active;
    }

    function getExchanges()
        external 
        view 
        returns (bytes32[] memory)
    {
        return exchangeIds;
    }

    function isActive(
        bytes32 exchangeId
    )
        external
        view
        returns(bool)
    {
        return exchanges[exchangeId].active;
    }
}