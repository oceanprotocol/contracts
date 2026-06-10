pragma solidity 0.8.12;
// Copyright Ocean Protocol contributors
// SPDX-License-Identifier: Apache-2.0

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20CappedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title GrantsToken
 * @dev Upgradeable ERC20 token named "COMPY" with:
 *      - UUPS proxy pattern (owner/multisig controls upgrades)
 *      - Capped supply
 *      - Pausable transfers
 *      - EIP-2612 permit
 *      - Standard burnFrom (allowance-based)
 *      - adminBurnFrom (owner-only, no allowance required — fraud remediation)
 *      - Transfer allowlist: both sender and receiver are checked; at least one must be on the list
 */
contract GrantsToken is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20CappedUpgradeable,
    ERC20PermitUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);
    event AllowlistAdded(address indexed account);
    event AllowlistRemoved(address indexed account);

    uint8 private constant _DECIMALS = 6;

    address[] private _allowlist;
    mapping(address => bool) private _isAllowlisted;
    mapping(address => uint256) private _allowlistIndex; // 1-based

    uint256[47] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializer (replaces constructor for upgradeable contracts).
     * @param initialSupply Tokens minted to owner_ on deploy (6 decimals)
     * @param cap_ Maximum token supply (6 decimals)
     * @param owner_ Address that receives initial tokens and ownership (use multisig)
     */
    function initialize(
        uint256 initialSupply,
        uint256 cap_,
        address owner_
    ) external initializer {
        require(owner_ != address(0), "GrantsToken: owner cannot be zero address");
        __ERC20_init("COMPY", "COMPY");
        __ERC20Permit_init("COMPY");
        __ERC20Capped_init(cap_);
        __Ownable_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        require(initialSupply <= cap_, "GrantsToken: initial supply exceeds cap");
        if (initialSupply > 0) {
            _mint(owner_, initialSupply);
            emit TokensMinted(owner_, initialSupply);
        }
        _transferOwnership(owner_);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /**
     * @dev Mint new tokens to `to`. Only owner.
     */
    function mint(address to, uint256 amount) public onlyOwner {
        require(to != address(0), "GrantsToken: cannot mint to zero address");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * @dev Burns `amount` tokens from `account` without requiring allowance.
     *      Owner-only. Use for fraud remediation.
     */
    function adminBurnFrom(address account, uint256 amount) external onlyOwner {
        _burn(account, amount);
        emit TokensBurned(account, amount);
    }

    function burn(uint256 amount) public override(ERC20BurnableUpgradeable) {
        address burner = _msgSender();
        super.burn(amount);
        emit TokensBurned(burner, amount);
    }

    function burnFrom(address account, uint256 amount)
        public
        override(ERC20BurnableUpgradeable)
    {
        super.burnFrom(account, amount);
        emit TokensBurned(account, amount);
    }

    // -------------------------------------------------------------------------
    // Transfer allowlist
    // -------------------------------------------------------------------------

    /**
     * @dev Add `account` to the transfer allowlist. Only owner.
     *      A transfer is only valid when at least one of sender/receiver is on the list.
     */
    function addToAllowlist(address account) external onlyOwner {
        require(account != address(0), "GrantsToken: zero address");
        require(!_isAllowlisted[account], "GrantsToken: already in allowlist");
        _allowlist.push(account);
        _allowlistIndex[account] = _allowlist.length; // 1-based
        _isAllowlisted[account] = true;
        emit AllowlistAdded(account);
    }

    /**
     * @dev Remove `account` from the transfer allowlist. Only owner.
     *      Uses swap-and-pop for O(1) deletion.
     */
    function removeFromAllowlist(address account) external onlyOwner {
        require(_isAllowlisted[account], "GrantsToken: not in allowlist");
        uint256 idx = _allowlistIndex[account] - 1; // convert to 0-based
        uint256 lastIdx = _allowlist.length - 1;
        if (idx != lastIdx) {
            address last = _allowlist[lastIdx];
            _allowlist[idx] = last;
            _allowlistIndex[last] = idx + 1; // keep 1-based
        }
        _allowlist.pop();
        delete _allowlistIndex[account];
        _isAllowlisted[account] = false;
        emit AllowlistRemoved(account);
    }

    /**
     * @dev Paginated view of allowlist entries.
     * @param from Start index (0-based)
     * @param limit Maximum entries to return
     */
    function getAllowlist(uint256 from, uint256 limit)
        external
        view
        returns (address[] memory)
    {
        uint256 len = _allowlist.length;
        if (from >= len) return new address[](0);
        uint256 end = from + limit;
        if (end > len) end = len;
        address[] memory result = new address[](end - from);
        for (uint256 i = from; i < end; i++) {
            result[i - from] = _allowlist[i];
        }
        return result;
    }

    function getAllowlistLength() external view returns (uint256) {
        return _allowlist.length;
    }

    function isAllowlisted(address account) external view returns (bool) {
        return _isAllowlisted[account];
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function cap() public view override(ERC20CappedUpgradeable) returns (uint256) {
        return super.cap();
    }

    function _mint(address to, uint256 amount)
        internal
        override(ERC20Upgradeable, ERC20CappedUpgradeable)
    {
        super._mint(to, amount);
    }

    /**
     * @dev Transfer hook: enforces pause and allowlist.
     *      Mint (from == address(0)) and burn (to == address(0)) bypass the allowlist check.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable) whenNotPaused {
        bool isMint = from == address(0);
        bool isBurn = to == address(0);
        if (!isMint && !isBurn) {
            require(
                _isAllowlisted[from] || _isAllowlisted[to],
                "GrantsToken: transfer not allowed"
            );
        }
        super._beforeTokenTransfer(from, to, amount);
    }
}
