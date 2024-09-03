// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title AccessList
 *
 * @dev AccessList is an optional soul bound/non-sould bound ERC721 used to build access lists (allow or deny)
 * Only owner can mint and also burn (ie: remove address from a list)
 * Each token id has it's own metadata
 */

contract AccessList is ERC721Enumerable,ERC721URIStorage {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;
    bool private initialized;
    address private _owner;
    string private _name;
    string private _symbol;
    bool public transferable;

    event AddressAdded(
        address indexed wallet,
        uint256 tokenId
    );
    event AddressRemoved(
        uint256 tokenId
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    constructor()
    ERC721("","") {
         
    }
    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
     /* @dev initialize
     *      Calls private _initialize function. Only if contract is not initialized.
            This function mints an NFT (tokenId=1) to the owner and add owner as Manager Role
     * @param owner NFT Owner
     * @param name_ NFT name
     * @param symbol_ NFT Symbol
     * @param transferable_ if set to false, this NFT is non-transferable
     
     @return boolean
     */

    function initialize(
        address owner_,
        string calldata name_,
        string calldata symbol_,
        bool transferable_,
        address[] memory user,
        string[] memory _tokenURI
    ) external returns (bool) {
        require(
            !initialized,
            "Already initialized"
        );
         _name = name_;
        _symbol = symbol_;
        _owner=owner_;
        initialized = true;
        transferable = transferable_;
        if(user.length==_tokenURI.length && _tokenURI.length>0){
            uint256 i;
            for(i=0;i<user.length;i++){
                _add(user[i],_tokenURI[i]);
            }    
        }
        return(true);
    }

    /**
     * @dev name
     *      It returns the token name.
     * @return Datatoken name.
     */
    function name() public view override returns (string memory) {
        return _name;
    }

    /**
     * @dev symbol
     *      It returns the token symbol.
     * @return Datatoken symbol.
     */
    function symbol() public view override returns (string memory) {
        return _symbol;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override( ERC721Enumerable,ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize)
        internal
        override(ERC721,ERC721Enumerable)
    {
        if(transferable == false)
            require(from == address(0) || to == address(0), "Token not transferable");
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }
 
    function _add(address user, string memory _tokenURI) private returns (uint256) {
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        emit AddressAdded(user,newItemId);
        _mint(user, newItemId);
        _setTokenURI(newItemId, _tokenURI);
        return newItemId;
    }

    function mint(address user, string memory _tokenURI) external onlyOwner returns (uint256) {
        return(_add(user,_tokenURI));    
    }

    
    /**
     * @notice Batch Mint only for owner
     */
    function batchMint(address[] memory user,string[] memory _tokenURI) external onlyOwner
    {
        uint256 i;
        require(user.length==_tokenURI.length);
        for(i=0;i<user.length;i++){
            _add(user[i],_tokenURI[i]);
        }
    }

    function burn(uint256 tokenId) public {
        require(_msgSender() == owner() || _msgSender()==super._ownerOf(tokenId),"ERC721: Not owner");
        emit AddressRemoved(tokenId);
        _burn(tokenId);
    }
    // The following functions are overrides required by Solidity.
    function _burn(uint256 tokenId) internal override(ERC721URIStorage,ERC721) {
       super._burn(tokenId);
    }
    
    
}