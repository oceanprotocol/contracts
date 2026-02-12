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
 * @dev Contract that allows swapping input tokens for COMPY tokens at a 1:1 ratio.
 *      Users can swap the input token for COMPY (one-way swap only).
 *      The swap maintains a 1:1 ratio in token units (accounting for decimals).
 */
contract GrantsSwap is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // The COMPY token address
    IERC20 public immutable compyToken;

    // The input token address (the token that can be swapped with COMPY)
    IERC20 public immutable inputToken;

    // Decimals for COMPY token (6)
    uint8 private immutable compyDecimals;

    // Decimals for input token
    uint8 private immutable inputDecimals;

    // Events
    event Swap(
        address indexed user,
        uint256 inputTokenAmount,
        uint256 compyAmount
    );

    event Withdraw(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    /**
     * @dev Constructor for GrantsSwap
     * @param _compyToken Address of the COMPY token
     * @param _inputToken Address of the input token that can be swapped with COMPY
     */
    constructor(address _compyToken, address _inputToken) {
        require(_compyToken != address(0), "GrantsSwap: COMPY token cannot be zero address");
        require(_inputToken != address(0), "GrantsSwap: input token cannot be zero address");
        require(_compyToken != _inputToken, "GrantsSwap: tokens must be different");

        compyToken = IERC20(_compyToken);
        inputToken = IERC20(_inputToken);

        // Get decimals from tokens
        compyDecimals = IERC20(_compyToken).decimals();
        inputDecimals = IERC20(_inputToken).decimals();
    }

    /**
     * @dev Swap input tokens for COMPY tokens at 1:1 ratio (accounting for decimals)
     * @param amount Amount of input tokens to swap (in input token's smallest unit)
     */
    function swapToCOMPY(uint256 amount) external nonReentrant {
        require(amount > 0, "GrantsSwap: amount must be greater than zero");

        // Calculate equivalent amount in COMPY's smallest unit (1:1 ratio)
        uint256 compyAmount = convertAmount(amount, inputDecimals, compyDecimals);

        // Transfer input tokens from user to this contract
        inputToken.safeTransferFrom(msg.sender, address(this), amount);

        // Transfer COMPY from this contract to user (1:1 ratio)
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

        // Calculate equivalent amount in COMPY's smallest unit (1:1 ratio)
        uint256 compyAmount = convertAmount(amount, inputDecimals, compyDecimals);

        // Transfer input tokens from user to this contract
        inputToken.safeTransferFrom(msg.sender, address(this), amount);

        // Transfer COMPY from this contract to user (1:1 ratio)
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
     * @dev Convert amount from one token's decimals to another (for 1:1 token unit ratio)
     * @param amount Amount in source token's smallest unit
     * @param sourceDecimals Decimals of source token
     * @param targetDecimals Decimals of target token
     * @return Converted amount in target token's smallest unit
     */
    function convertAmount(uint256 amount, uint8 sourceDecimals, uint8 targetDecimals) internal pure returns (uint256) {
        if (sourceDecimals == targetDecimals) {
            return amount;
        } else if (sourceDecimals < targetDecimals) {
            // Multiply by 10^(targetDecimals - sourceDecimals)
            return amount * (10 ** (targetDecimals - sourceDecimals));
        } else {
            // Divide by 10^(sourceDecimals - targetDecimals)
            return amount / (10 ** (sourceDecimals - targetDecimals));
        }
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
