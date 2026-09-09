pragma solidity 0.8.12;
// Copyright Ocean Protocol contributors
// SPDX-License-Identifier: Apache-2.0

import '../interfaces/IERC20.sol';
import '../utils/SafeERC20.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

/**
 * @title GrantsSwap
 * @dev Contract that allows swapping input tokens for COMPY tokens at an owner-configurable rate.
 *      Users can swap the input token for COMPY (one-way swap only).
 *      The rate is expressed in wei (1e18 == 1:1 in token units, accounting for decimals)
 *      and can be updated by the owner.
 */
contract GrantsSwap is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Rate denominator: a rate of RATE_UNIT (1e18) means a 1:1 ratio in token units
    uint256 public constant RATE_UNIT = 1e18;

    // The COMPY token address
    IERC20 public immutable compyToken;

    // The input token address (the token that can be swapped with COMPY)
    IERC20 public immutable inputToken;

    // Decimals for COMPY token (6)
    uint8 private immutable compyDecimals;

    // Decimals for input token
    uint8 private immutable inputDecimals;

    // Swap rate in wei: 1e18 (RATE_UNIT) == 1:1 ratio in token units
    uint256 public rate;

    // Events
    event Swap(
        address indexed user,
        uint256 inputTokenAmount,
        uint256 compyAmount
    );

    event RateChanged(uint256 oldRate, uint256 newRate);

    event Withdraw(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    /**
     * @dev Constructor for GrantsSwap
     * @param _compyToken Address of the COMPY token
     * @param _inputToken Address of the input token that can be swapped with COMPY
     * @param _initialRate Initial swap rate in wei (1e18 == 1:1 ratio in token units)
     */
    constructor(address _compyToken, address _inputToken, uint256 _initialRate) {
        require(_compyToken != address(0), "GrantsSwap: COMPY token cannot be zero address");
        require(_inputToken != address(0), "GrantsSwap: input token cannot be zero address");
        require(_compyToken != _inputToken, "GrantsSwap: tokens must be different");
        require(_initialRate > 0, "GrantsSwap: rate must be greater than zero");

        compyToken = IERC20(_compyToken);
        inputToken = IERC20(_inputToken);

        // Get decimals from tokens
        compyDecimals = IERC20(_compyToken).decimals();
        inputDecimals = IERC20(_inputToken).decimals();

        rate = _initialRate;
        emit RateChanged(0, _initialRate);
    }

    /**
     * @dev Update the swap rate (only owner)
     * @param _rate New swap rate in wei (1e18 == 1:1 ratio in token units)
     */
    function setRate(uint256 _rate) external onlyOwner {
        require(_rate > 0, "GrantsSwap: rate must be greater than zero");
        uint256 oldRate = rate;
        rate = _rate;
        emit RateChanged(oldRate, _rate);
    }

    /**
     * @dev Swap input tokens for COMPY tokens at 1:1 ratio (accounting for decimals)
     * @param amount Amount of input tokens to swap (in input token's smallest unit)
     */
    function swapToCOMPY(uint256 amount) external nonReentrant {
        require(amount > 0, "GrantsSwap: amount must be greater than zero");

        // Calculate equivalent amount in COMPY's smallest unit at the current rate
        uint256 compyAmount = getCompyAmount(amount);
        require(compyAmount > 0, "GrantsSwap: output amount must be greater than zero");

        // Transfer input tokens from user to this contract
        inputToken.safeTransferFrom(msg.sender, address(this), amount);

        // Transfer COMPY from this contract to user
        compyToken.safeTransfer(msg.sender, compyAmount);

        emit Swap(msg.sender, amount, compyAmount);
    }

    /**
     * @dev Swap input tokens for COMPY tokens at 1:1 ratio using ERC20Permit (accounting for decimals)
     *      This function allows users to swap without a separate approval transaction by using a permit signature.
     * @param amount Amount of input tokens to swap (in input token's smallest unit)
     * @param deadline The time at which the permit expires (unix timestamp)
     * @param v The recovery byte of the signature
     * @param r Half of the ECDSA signature pair
     * @param s Half of the ECDSA signature pair
     */
    function swapToCOMPYwithPermit(
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        require(amount > 0, "GrantsSwap: amount must be greater than zero");

        // Use permit to approve this contract to spend user's input tokens
        IERC20Permit(address(inputToken)).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );

        // Calculate equivalent amount in COMPY's smallest unit at the current rate
        uint256 compyAmount = getCompyAmount(amount);
        require(compyAmount > 0, "GrantsSwap: output amount must be greater than zero");

        // Transfer input tokens from user to this contract
        inputToken.safeTransferFrom(msg.sender, address(this), amount);

        // Transfer COMPY from this contract to user
        compyToken.safeTransfer(msg.sender, compyAmount);

        emit Swap(msg.sender, amount, compyAmount);
    }

    /**
     * @dev Withdraw tokens from the contract (only owner)
     * @param token Address of the token to withdraw (address(0) for native ETH, but not supported in this contract)
     * @param to Address to send the tokens to
     * @param amount Amount of tokens to withdraw
     */
    function withdrawTokens(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "GrantsSwap: cannot withdraw to zero address");
        require(amount > 0, "GrantsSwap: amount must be greater than zero");
        require(token != address(0), "GrantsSwap: token address cannot be zero");

        IERC20(token).safeTransfer(to, amount);

        emit Withdraw(token, to, amount);
    }

    /**
     * @dev Calculate the amount of COMPY received for a given input amount at the current rate.
     *      A rate of RATE_UNIT (1e18) yields a 1:1 ratio in token units (accounting for decimals).
     *      Multiplication is applied before division to minimize precision loss.
     * @param amount Amount of input tokens (in input token's smallest unit)
     * @return Amount of COMPY tokens (in COMPY's smallest unit)
     */
    function getCompyAmount(uint256 amount) public view returns (uint256) {
        if (compyDecimals >= inputDecimals) {
            return amount * rate * (10 ** (compyDecimals - inputDecimals)) / RATE_UNIT;
        } else {
            return amount * rate / (RATE_UNIT * (10 ** (inputDecimals - compyDecimals)));
        }
    }

    /**
     * @dev Get the current swap rate in wei (1e18 == 1:1 ratio in token units)
     * @return uint256 Current swap rate
     */
    function getRate() external view returns (uint256) {
        return rate;
    }

    /**
     * @dev Get the balance of COMPY tokens held by this contract
     * @return uint256 Balance of COMPY tokens
     */
    function getCOMPYBalance() external view returns (uint256) {
        return compyToken.balanceOf(address(this));
    }

    /**
     * @dev Get the balance of input tokens held by this contract
     * @return uint256 Balance of input tokens
     */
    function getInputTokenBalance() external view returns (uint256) {
        return inputToken.balanceOf(address(this));
    }
}
