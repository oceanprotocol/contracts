pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';
import '../interfaces/IERC20Template.sol';

/**
 * @title FixedRateExchange
 * @dev FixedRateExchange is a fixed rate exchange Contract
 */
contract FixedRateExchange is Ownable {

    struct FixedRatePool {
        address poolOwner;
        address dataToken;
        address baseToken;
        uint256 fixedRate;
    }

    // map a poolId to a fixedRatePool
    mapping(bytes32 => FixedRatePool) fixedRatePools;

    modifier onlyNotExistPool(
        address dataTokenAddress,
        address baseTokenAddress
    )
    {
        bytes32 _id = keccak256(
            abi.encodePacked(
                dataTokenAddress,
                baseTokenAddress
            )
        );
        require(
            fixedRatePools[_id].fixedRate == 0,
            'FixedRateExchange: Pool already exists!'
        );
        _;
    }


    constructor() 
        public
        Ownable()
    {
    }


    function createPool(
        address dataTokenAddress,
        address baseTokenAddress,
        uint256 fixedRate
    )
        public
        onlyNotExistPool(
            dataTokenAddress,
            baseTokenAddress
        )
    {
        require(
            baseTokenAddress != address(0),
            'FixedRateExchange: Invalid basetoken,  zero address'
        );
        require(
            dataTokenAddress != address(0),
            'FixedRateExchange: Invalid datatoken,  zero address'
        );
        require(
            baseTokenAddress != dataTokenAddress,
            'FixedRateExchange: Invalid datatoken,  equals basetoken'
        );
        require(
            fixedRate > 0, 
            'FixedRateExchange: Invalid exchange rate value'
        );

        bytes32 _id = keccak256(
            abi.encodePacked(
                dataTokenAddress,
                baseTokenAddress
            )
        );

        fixedRatePools[_id] = FixedRatePool({
            poolOwner: msg.sender,
            dataToken: dataTokenAddress,
            baseToken: baseTokenAddress,
            fixedRate: fixedRate
        });
    }

    // /**
    //  * @dev isInitialized
    //  *      Function checks if the contract is initialized.
    //  * @return true if the contract is initialized, false if it is not.
    //  */

    // function isInitialized() public view returns (bool) {
    //     return initialized;
    // }

    // /**
    //  * @dev buyDataTokens
    //  *      Buys Datatokens using base token
    //  * @param dtAmount amount of DataTokens to be bought
    //  * @return true
    //  */
    // function buyDataTokens(uint256 dtAmount) public 
    // onlyInitialized returns (bool) {
    //     //TO DO - This assumes that ratio is going to be always expressed in wei
    //     uint256 baseAmount = dtAmount * (_ratio / (10**18));
    //     //TO DO  - should we check the reserve first or just let it fail if there is not enough DT ?
    //     require(
    //         IERC20Template(_basetoken).transfer(_lpAddress, baseAmount),
    //         'ERROR: transfer failed'
    //     );
    //     require(
    //         IERC20Template(_datatoken).transferFrom(
    //             _lpAddress,
    //             msg.sender,
    //             dtAmount
    //         ),
    //         'ERROR: transferFrom failed'
    //     );
    //     return true;
    // }

    // /**
    //  * @dev getRatio
    //  *      Gets Ratio
    //  * @return uint ratio
    //  */
    // function getRatio() public view onlyInitialized returns (uint256) {
    //     return (_ratio);
    // }

    // /**
    //  * @dev SetRatio
    //  *      Sets a new Ratio
    //  * @return uint ratio
    //  */
    // function setRatio(uint ratio) public 
    // onlyOwner onlyInitialized returns (bool) {
    //     require(ratio>0,'Ratio must be >0');
    //     uint oldratio = _ratio;
    //     _ratio = ratio;
    //     emit RatioChanged(oldratio,ratio);
    //     return true;

    // }

    // /**
    //  * @dev getTokens
    //  *      Gets tokens addresses
    //  * @return address[] tokens
    //  */
    // function getTokens() public view 
    // onlyInitialized returns (address[] memory) {
    //     address[] memory tokens = new address[](2);
    //     tokens[0] = _basetoken;
    //     tokens[1] = _datatoken;
    //     return (tokens);
    // }

    // /**
    //  * @dev getDTReserve
    //  *      Gets amount of DT available to trade
    //  * @return uint amount of DT
    //  */
    // function getDTReserve() public view onlyInitialized returns (uint256) {
    //     //get both balance & allowence and return the smaller one
    //     uint256 balance = IERC20Template(_datatoken).balanceOf(_lpAddress);
    //     uint256 allowance = IERC20Template(_datatoken).allowance(
    //         _lpAddress,
    //         address(this)
    //     );
    //     if (balance < allowance) return (balance);
    //     else return (allowance);
    // }
}