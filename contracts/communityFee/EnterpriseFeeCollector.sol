pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0
import '../interfaces/IERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '../utils/SafeERC20.sol';
import "@openzeppelin/contracts/utils/math/SafeMath.sol";


/**
 * @title EnterpriseFeeCollector
 * @dev Ocean Protocol Enterprise Fee Collector contract
 */
contract EnterpriseFeeCollector is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    uint256 private constant BASE = 1e18;
    address payable collector;
    struct Token {
        bool allowed;
        uint256 minFee;
        uint256 maxFee;
        uint256 feePercentage;  // ie:  1e15 = 0.1%
    }
    // maps an token to a token struct
    mapping(address => Token) public tokenList;

    event WithdrawETH(
        address indexed collector,
        uint256 amount,
        address caller
    );

    event WithdrawToken(
        address indexed collector,
        address indexed tokenAddress,
        uint256 amount,
        address caller
    );

    event TokenUpdated(
        address indexed tokenAddress,
        uint256 minFee,
        uint256 maxFee,
        uint256 feePercentage,
        bool allowed,
        address caller
    );

    event CollectorChanged(
        address indexed oldCollector,
        address indexed newCollector,
        address caller
    );
    /**
     * @dev constructor
     *      Called prior contract deployment. set the controller address and
     *      the contract owner address
     * @param newCollector the fee collector address.
     * @param OwnerAddress the contract owner address
     */
    constructor(
        address payable newCollector,
        address OwnerAddress
    ) 
        Ownable()
    {
        require(
            newCollector != address(0)&&
            OwnerAddress != address(0), 
            'OPFCommunityFeeCollector: collector address or owner is invalid address'
        );
        collector = newCollector;
        transferOwnership(OwnerAddress);
    }
    /**
     * @dev fallback function
     *      this is a default fallback function in which receives
     *      the collected ether.
     */
    fallback() external payable {}

    /**
     * @dev receive function
     *      this is a default receive function in which receives
     *      the collected ether.
     */
    receive() external payable {}

    /**
     * @dev withdrawETH
     *      transfers all the accumlated ether the collector address
     */
    function withdrawETH() 
        external 
        payable
    {
        emit WithdrawETH(collector, address(this).balance, msg.sender);
        (bool sent, ) = collector.call{value: address(this).balance}("");
        require(sent, "Failed to send Ether");
    }

    /**
     * @dev withdrawToken
     *      transfers all the accumlated tokens the collector address
     * @param tokenAddress the token contract address 
     */
    function withdrawToken(
        address tokenAddress
    ) 
        external
    {
        require(
            tokenAddress != address(0),
            'OPFCommunityFeeCollector: invalid token contract address'
        );
        uint256 tokenBalance = IERC20(tokenAddress).balanceOf(address(this));
        emit WithdrawToken(
            collector,
            tokenAddress,
            tokenBalance,
            msg.sender
        );
        IERC20(tokenAddress).safeTransfer(
                collector,
                tokenBalance
        );
    }

    /**
     * @dev changeCollector
     *      change the current collector address. Only owner can do that.
     * @param newCollector the new collector address 
     */
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
        emit CollectorChanged(
            collector,
            newCollector,
            msg.sender
        );
    }

    /**
     * @dev isTokenAllowed
     *      checks if the token is allowed to be used in the fee calculation.
     * @param tokenAddress the token contract address 
     * @return true if the token is allowed, false otherwise
     */
    
    function isTokenAllowed(address tokenAddress) 
        external 
        view 
        returns (bool) 
    {
       return tokenList[tokenAddress].allowed; 
    }
    /**
     * @dev getToken
     *      returns the token details.
     * @param tokenAddress the token contract address 
     * @return Token struct containing the token details
     */
    function getToken(address tokenAddress) 
        external 
        view 
        returns (Token memory) 
    {
        return tokenList[tokenAddress];
    }

    /**
     * @dev updateToken
     *      updateToken a token in the allowed list.
     * @param tokenAddress the token contract address 
     * @param minFee the minimum fee for the token
     * @param maxFee the maximum fee for the token
     * @param feePercentage the fee percentage for the token
     */
    function updateToken(
        address tokenAddress,
        uint256 minFee,
        uint256 maxFee,
        uint256 feePercentage,
        bool allowed
    ) 
        external
        onlyOwner
    {
        require(
            tokenAddress != address(0),
            'OPFCommunityFeeCollector: invalid token contract address'
        );
        require(
            minFee < maxFee,
            'OPFCommunityFeeCollector: minFee should be less than maxFee'
        );
        require(
            feePercentage > 0 && feePercentage <= BASE,
            'OPFCommunityFeeCollector: feePercentage should be greater than 0 and less than or equal to 1e18'
        );
        tokenList[tokenAddress] = Token({
            allowed: allowed,
            minFee: minFee,
            maxFee: maxFee,
            feePercentage: feePercentage
        });
        emit TokenUpdated(
            tokenAddress,
            minFee,
            maxFee,
            feePercentage,
            allowed,
            msg.sender
        );
    }
       
    function calculateFee(address tokenAddress, uint256 amount) 
        external 
        view 
        returns (uint256) 
    {
        uint256 fee;
        if(tokenList[tokenAddress].feePercentage>0)
            fee=amount.mul(tokenList[tokenAddress].feePercentage).div(BASE);
        else
            fee=0;
        if (fee < tokenList[tokenAddress].minFee) {
            return tokenList[tokenAddress].minFee;
        }
        if (fee > tokenList[tokenAddress].maxFee) {
            return tokenList[tokenAddress].maxFee;
        }
        return fee;
    }

}