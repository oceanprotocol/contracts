// Copyright OpenZeppelin, BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND MIT)
pragma solidity 0.8.12;

import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VestingWalletHalving
 * @dev This contract can receive native currency and most of ERC20 tokens. 
 * Although is was built and tested with OCEAN token, it works with other tokens, as long as they are not implementing
 * weird function returns
 * (see https://github.com/d-xo/weird-erc20/tree/266025c555b42b2dd2517fd99f7d47032ec99abe#weird-erc20-tokens)
 * 
 * Custody of multiple tokens
 * can be given to this contract, which will release the token to the beneficiary following a given vesting schedule.
 * The vesting schedule is customizable through the {vestedAmount} function.
 *
 * Any token transferred to this contract will follow the vesting schedule as if they were locked from the beginning.
 * Consequently, if the vesting has already started, any amount of tokens sent to this contract will (at least partly)
 * be immediately releasable.
 */
contract VestingWalletHalving is Context, Ownable {
    event EtherReleased(address indexed beneficiary, uint256 amount);
    event ERC20Released(address indexed beneficiary, address indexed token, uint256 amount);
    
    event BeneficiaryChanged(address indexed newBeneficiary);
    event RenounceVesting(address indexed token, address indexed owner, uint256 amount);
    event RenounceETHVesting(address indexed owner, uint256 amount);
    

    uint256 private _released;
    mapping(address => uint256) private _erc20Released;
    address private _beneficiary;
    uint64 private immutable _start;
    uint256 private immutable _halfLife;
    uint256 private immutable _duration;

    /**
     * @dev Set the beneficiary, start timestamp and vesting duration of the vesting wallet.
     */
    constructor(
        address beneficiaryAddress,
        uint64 startTimestamp,
        uint256 halfLife,
        uint256 duration
    ) payable {
        require(
            beneficiaryAddress != address(0),
            "VestingWallet: beneficiary is zero address"
        );

        uint64 currentTime = uint64(block.timestamp);
        require(
            startTimestamp >= currentTime && startTimestamp <= currentTime + 3000 days,
            "VestingWallet: startTimestamp out of range"
        );
        
        require(
            halfLife > 0,
            "VestingWallet: halfLife must be greater than zero"
        );
        
        require(
            duration > 0,
            "VestingWallet: duration must be greater than zero"
        );

        _beneficiary = beneficiaryAddress;
        _start = startTimestamp;
        _halfLife = halfLife;
        _duration = duration;
    }

    /**
     * @dev The contract should be able to receive Eth.
     */
    receive() external payable virtual {}

    /**
     * @dev Getter for the beneficiary address.
     */
    function beneficiary() public view virtual returns (address) {
        return _beneficiary;
    }

    /**
     * @dev Getter for the start timestamp.
     */
    function start() public view virtual returns (uint256) {
        return _start;
    }

    /**
     * @dev Getter for the half life.
     */
    function halfLife() public view returns (uint256) {
        return _halfLife;
    }

    /**
     * @dev Getter for duration.
     */
    function duration() public view returns (uint256) {
        return _duration;
    }

    /**
     * @dev Amount of eth already released
     */
    function released() public view virtual returns (uint256) {
        return _released;
    }

    /**
     * @dev Amount of token already released
     */
    function released(address token) public view virtual returns (uint256) {
        return _erc20Released[token];
    }

    /**
     * @dev Getter for the amount of releasable eth.
     */
    function releasable() public view virtual returns (uint256) {
        return vestedAmount(uint64(block.timestamp)) - released();
    }

    /**
     * @dev Getter for the amount of releasable `token` tokens. `token` should be the address of an
     * IERC20 contract.
     */
    function releasable(address token) public view virtual returns (uint256) {
        return vestedAmount(token, uint64(block.timestamp)) - released(token);
    }

    /**
     * @dev Release the native token (ether) that have already vested.
     *
     * Emits a {EtherReleased} event.
     */
    function release() public virtual {
        uint256 amount = releasable();
        _released += amount;
        emit EtherReleased(beneficiary(), amount);
        Address.sendValue(payable(beneficiary()), amount);
    }

    /**
     * @dev Release the tokens that have already vested.
     *
     * Emits a {ERC20Released} event.
     */
    function release(address token) public virtual {
        uint256 amount = releasable(token);
        _erc20Released[token] += amount;
        emit ERC20Released(beneficiary(), token, amount);
        SafeERC20.safeTransfer(IERC20(token), beneficiary(), amount);
    }

    /**
     * @dev Calculates the amount of ether that has already vested. Default implementation is a linear vesting curve.
     */
    function vestedAmount(uint64 timestamp)
        public
        view
        virtual
        returns (uint256)
    {
        return _vestingSchedule(address(this).balance + released(), timestamp);
    }

    /**
     * @dev Calculates the amount of tokens that has already vested. Default implementation is a linear vesting curve.
     */
    function vestedAmount(address token, uint64 timestamp)
        public
        view
        virtual
        returns (uint256)
    {
        return
            _vestingSchedule(
                IERC20(token).balanceOf(address(this)) + released(token),
                timestamp
            );
    }

    /**
     * @dev Approximation of half life formula (1-(0.5^(t/h)))*value
     */
    function getAmount(
        uint256 value,
        uint256 t,
        uint256 h
    ) public pure returns (uint256) {
        uint256 p = value >> (t / h);
        t %= h;
        return value - p + (p * t) / h / 2;
    }

    /**
     * @dev Virtual implementation of the vesting formula. This returns the amount vested, as a function of time, for
     * an asset given its total historical allocation.
     */
    function _vestingSchedule(uint256 totalAllocation, uint64 timestamp)
        internal
        view
        virtual
        returns (uint256)
    {
        if (timestamp < start()) {
            return 0;
        } else if (timestamp > start() + duration()) {
            return totalAllocation;
        } else {
            uint256 timePassed = timestamp - start();
            return getAmount(totalAllocation, timePassed, halfLife());
        }
    }

    /**
     * @notice Allows the owner to renounce vesting of the specified token.
     * @dev This function transfers the entire token and ETH balance of the contract to the owner.
     * @param token The address of the ERC-20 token to be renounced.
     */
    function renounceVesting(address token) external onlyOwner {
        uint256 amount = IERC20(token).balanceOf(address(this));
        emit RenounceVesting(token, owner(), amount);
        SafeERC20.safeTransfer(IERC20(token), owner(), amount);
    }

    /**
     * @notice Allows the owner to renounce vesting of any Ether held by the contract.
     * @dev This function transfers the entire Ether balance of the contract to the owner.
     */
    function renounceETHVesting() external onlyOwner {
        uint256 ethBalance = address(this).balance;
        require(ethBalance > 0, "No ETH balance to transfer.");

        (bool success, ) = payable(owner()).call{value: ethBalance}("");
        require(success, "ETH Transfer failed.");

        emit RenounceETHVesting(owner(), ethBalance);
    }

    /**
     * @notice Allows the owner to change the beneficiary address.
     * @dev Changes the beneficiary of the contract to the provided address. 
     * @param beneficiary The address of the new beneficiary.
     */
    function changeBeneficiary(address beneficiary) external onlyOwner {
        require(beneficiary!= address(0),"VestingWallet: beneficiary is zero address");
        _beneficiary = beneficiary;
        emit BeneficiaryChanged(beneficiary);
    }
    
}
