// BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND MIT)

pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// @title Splitter
// @notice A contract that facilitates splitting payments among multiple payees based on their respective shares.
contract Splitter is Ownable, ReentrancyGuard {
    // total shares held by all payees
    uint256 private _totalShares;

    // mapping of token addresses to total released
    mapping(address => uint256) private _totalReleased;

    // emitted when a new payee is added
    event PayeeAdded(address account, uint256 shares);

    // emitted when tokens are released to payees
    event PaymentReleased(IERC20 indexed token, uint256 amount);
    event PayeePaid(IERC20 indexed token, address indexed account, uint256 amount);

    // emitted when a payee is removed
    event PayeeRemoved(address account, uint256 shares);

    // emitted when a payee's share is adjusted
    event PayeeShareAdjusted(address account, uint256 shares, uint256 oldShares);

    // mapping of payee addresses to their shares
    mapping(address => uint256) private _shares;

    // mapping of payee addresses to a mapping of token addresses to released amount
    mapping(address => mapping(address => uint256)) private _released;

    // list of payee addresses
    address[] private _payees;

    /**
     * @dev Constructor function initializes the payees and their shares.
     * @param payees The addresses of the payees.
     * @param shares_ The number of shares held by each payee.
     */
    constructor(address[] memory payees, uint256[] memory shares_) payable {
        require(payees.length == shares_.length, "Splitter: payees and shares length mismatch");
        require(payees.length > 0, "Splitter: no payees");

        for (uint256 i = 0; i < payees.length; i++) {
            _addPayee(payees[i], shares_[i]);
        }
    }

    // ---------------------------- getters ----------------------------
    
    /**
     * @notice Gets payees.
     * @return Array of addresses
     */
    function getPayees() public view returns (address[] memory) {
        return _payees;
    }


    /**
     * @notice Gets the number of shares held by a payee.
     * @param account The address of the payee.
     * @return The number of shares held by the payee.
     */
    function shares(address account) public view returns (uint256) {
        return _shares[account];
    }

    /**
     * @notice Gets the total number of tokens released to a payee.
     * @param account The address of the payee.
     * @param token The address of the token.
     * @return The number of tokens released to the payee.
     */
    function released(address account, address token) public view returns (uint256) {
        return _released[token][account];
    }

    /**
     * @notice Gets the total number of shares held by all payees.
     * @return The total number of shares held by all payees.
     */
    function totalShares() public view returns (uint256) {
        return _totalShares;
    }

    /**
     * @notice Gets the total number of tokens released to all payees.
     * @param token The address of the token.
     * @return The total number of tokens released to all payees.
     */
    function totalReleased(address token) public view returns (uint256) {
        return _totalReleased[token];
    }

    // ---------------------------- external functions ----------------------------

    /**
    * @notice Release tokens to payees based on their shares.
    * @param token Address of the token to distribute.
    */
    function release(IERC20 token) external nonReentrant {
        require(_totalShares > 0, "Splitter: no shares");
        uint256 balance = token.balanceOf(address(this));
        if(balance<1) return;
        balance = balance - 1; //keep 1 wei in the contract
        uint256 total = 0;
        for(uint256 i = 0; i < _payees.length; i++) {
            address payee = _payees[i];
            uint256 payment;
            if (i == _payees.length - 1){
                payment = balance - total;
            } else {
                payment = balance * _shares[payee] / _totalShares;
            }
            if (payment > 0) {
                _released[payee][address(token)] = _released[payee][address(token)] + payment;
                emit PayeePaid(token, payee, payment);
                SafeERC20.safeTransfer(token, payee, payment);
                total += payment;
            }
        }
        _totalReleased[address(token)] = _totalReleased[address(token)] + total;
        emit PaymentReleased(token, total);
    }

    /**
     * @notice Adds a new payee with the given shares
     * @param account The address of the new payee
     * @param shares_ The number of shares the new payee will hold
     */
    function addPayee(address account, uint256 shares_) external onlyOwner {
        _addPayee(account, shares_);
    }

    /**
     * @notice Removes a payee
     * @param account The address of the payee to remove
     */
    function removePayee(address account) external onlyOwner {
        _removePayee(account);
    }

    /**
     * @notice Adjusts the share of a payee
     * @param account The address of the payee to adjust the share of
     * @param shares_ The new number of shares for the payee
     */
    function adjustShare(address account, uint256 shares_) external onlyOwner {
        _adjustShare(account, shares_);
    }


    
    // ---------------------------- private functions ----------------------------

    /**
     * @dev Adds a new payee with the specified number of shares.
     * @param account The address of the payee to add.
     * @param shares_ The number of shares owned by the payee.
     */
    function _addPayee(address account, uint256 shares_) private {
        require(account != address(0), "Splitter: zero address");
        require(shares_ > 0, "Splitter: shares are 0");
        require(_shares[account] == 0, "Splitter: account already has shares");

        _payees.push(account);
        _shares[account] = shares_;
        _totalShares = _totalShares + shares_;
        emit PayeeAdded(account, shares_);
    }

    /**
     * @dev Removes an existing payee.
     * @param account The address of the payee to remove.
     */
    function _removePayee(address account) private {
        require(account != address(0), "Splitter: zero address");
        require(_shares[account] > 0, "Splitter: account has no shares");

        for (uint256 i = 0; i < _payees.length; i++) {
            if (_payees[i] == account) {
                _payees[i] = _payees[_payees.length - 1];
                _totalShares = _totalShares - _shares[account];
                emit PayeeRemoved(account, _shares[account]);
                _shares[account] = 0;
                _payees.pop();
                break;
            }
        }
    }

    /**
     * @dev Adjusts the number of shares owned by a payee.
     * @param account The address of the payee to adjust.
     * @param shares_ The new number of shares.
     */
    function _adjustShare(address account, uint256 shares_) private {
        require(account != address(0), "Splitter: zero address");
        require(shares_ > 0, "Splitter: shares are 0");
        require(_shares[account] > 0, "Splitter: account has no shares");

        uint256 oldShares = _shares[account];
        _shares[account] = shares_;
        _totalShares = _totalShares - oldShares + shares_;
        emit PayeeShareAdjusted(account, shares_, oldShares);
    }


    //---------------------------- fallback ----------------------------
   
    receive() external payable virtual {
        revert("Splitter: cannot receive ether");
    }
}