pragma solidity 0.8.12;
// Copyright Ocean Protocol contributors
// SPDX-License-Identifier: Apache-2.0

import '../interfaces/IERC20.sol';
import '../utils/Ownable.sol';
import '../utils/SafeERC20.sol';

/**
 * @title GrantsTokenFaucet
 * @dev Faucet contract for GrantsToken that uses signature-based authentication.
 *      Backend validates user info and signs a message containing: userAddress, nonce, amount, userAddress.
 *      Users can claim tokens by providing a valid signature from the authorized signer.
 */
contract GrantsTokenFaucet is Ownable {
    using SafeERC20 for IERC20;

    // The token that will be distributed
    IERC20 public immutable token;

    // The address authorized to sign claim messages
    address public signer;

    // Mapping from user address to their last used nonce
    mapping(address => uint256) public userNonces;

    // Events
    event TokensClaimed(
        address indexed user,
        uint256 nonce,
        uint256 amount
    );

    event SignerChanged(
        address indexed oldSigner,
        address indexed newSigner
    );

    /**
     * @dev Constructor
     * @param _token Address of the GrantsToken contract
     * @param _signer Address authorized to sign claim messages
     */
    constructor(address _token, address _signer) {
        require(_token != address(0), "GrantsTokenFaucet: invalid token address");
        require(_signer != address(0), "GrantsTokenFaucet: invalid signer address");
        
        token = IERC20(_token);
        signer = _signer;
    }

    /**
     * @dev Claim tokens using a signature from the authorized signer
     * @param userAddress Address of the user claiming tokens
     * @param nonce Nonce for this claim (must be greater than user's last used nonce)
     * @param amount Amount of tokens to claim
     * @param signature Signature from the authorized signer
     */
    function claim(
        address userAddress,
        uint256 nonce,
        uint256 amount,
        bytes calldata signature
    ) external {
        require(userAddress != address(0), "GrantsTokenFaucet: invalid user address");
        require(amount > 0, "GrantsTokenFaucet: amount must be greater than zero");
        require(nonce > userNonces[userAddress], "GrantsTokenFaucet: nonce must be greater than last used nonce");

        // Verify signature
        // Include contract address to prevent cross-contract replay attacks
        bytes32 messageHash = keccak256(
            abi.encode(address(this), userAddress, nonce, amount)
        );
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        address recoveredSigner = _recoverSigner(ethSignedMessageHash, signature);
        require(recoveredSigner != address(0), "GrantsTokenFaucet: invalid signature recovery");
        require(recoveredSigner == signer, "GrantsTokenFaucet: invalid signature");

        // Update user nonce
        userNonces[userAddress] = nonce;
        emit TokensClaimed(userAddress, nonce, amount);
        // Transfer tokens to user
        token.safeTransfer(userAddress, amount);

        
    }

    /**
     * @dev Change the authorized signer (only owner)
     * @param newSigner Address of the new authorized signer
     */
    function setSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "GrantsTokenFaucet: invalid signer address");
        require(newSigner != signer, "GrantsTokenFaucet: signer is already set to this address");
        
        address oldSigner = signer;
        signer = newSigner;
        
        emit SignerChanged(oldSigner, newSigner);
    }

    /**
     * @dev Get the authorized signer address
     * @return The address of the authorized signer
     */
    function getSigner() external view returns (address) {
        return signer;
    }

    /**
     * @dev Get the last used nonce for a user
     * @param user Address of the user
     * @return The last used nonce
     */
    function getUserNonce(address user) external view returns (uint256) {
        return userNonces[user];
    }

    /**
     * @dev Recover signer address from signature
     * @param hash The message hash
     * @param signature The signature
     * @return The recovered signer address
     */
    function _recoverSigner(bytes32 hash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "GrantsTokenFaucet: invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := and(mload(add(signature, 65)), 255)
        }

        // Prevent signature malleability: s must be in the lower half of the secp256k1 curve order
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, 
            "GrantsTokenFaucet: invalid signature s value");

        // Handle v values 0-1 (EIP-155) and 27-28 (legacy)
        if (v < 27) {
            v += 27;
        }

        require(v == 27 || v == 28, "GrantsTokenFaucet: invalid signature v value");

        address recovered = ecrecover(hash, v, r, s);
        require(recovered != address(0), "GrantsTokenFaucet: invalid signature recovery");
        
        return recovered;
    }

    /**
     * @dev Emergency function to withdraw tokens (only owner)
     *      Useful if tokens need to be recovered or contract needs to be upgraded
     * @param amount Amount of tokens to withdraw
     */
    function withdrawTokens(uint256 amount) external onlyOwner {
        token.safeTransfer(owner(), amount);
    }

    /**
     * @dev Emergency function to withdraw all tokens (only owner)
     */
    function withdrawAllTokens() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(owner(), balance);
    }
}
