// Copyright OpenZeppelin, BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND MIT)
pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VestingWalletHalving
 * @dev This contract handles the vesting of Eth and ERC20 tokens for a given beneficiary. Custody of multiple tokens
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
        require(
            beneficiary() != address(0),
            "VestingWallet: beneficiary is zero address"
        );
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
        require(
            beneficiary() != address(0),
            "VestingWallet: beneficiary is zero address"
        );
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

    // ----- ADMIN FUNCTIONS -----
    function renounceVesting(address token) external onlyOwner {
        uint256 amount = IERC20(token).balanceOf(address(this));
        emit RenounceVesting(token, owner(), amount);
        SafeERC20.safeTransfer(IERC20(token), owner(), amount);
        
    }

    function changeBeneficiary(address beneficiary) external onlyOwner {
        require(beneficiary!= address(0),"VestingWallet: beneficiary is zero address");
        _beneficiary = beneficiary;
        emit BeneficiaryChanged(beneficiary);
    }
    
}
