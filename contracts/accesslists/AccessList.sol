// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AccessList
 *
 * @dev AccessList is an soul bound ERC721 used to build access lists (allow or deny)
 * Only owner can mint and also burn (ie: remove address from a list)
 * Each token id has it's own metadata
 */

contract AccessList is Ownable, ERC721Enumerable,ERC721URIStorage {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;


    event NewAccessList(
        address indexed contractAddress,
        address indexed owner
    );
    event AddressAdded(
        address indexed wallet,
        uint256 tokenId
    );
    event AddressRemoved(
        uint256 tokenId
    );

    constructor(string memory _name, string memory _symbol)
    ERC721(_name, _symbol) {
         emit NewAccessList(address(this),_msgSender());
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
        require(_msgSender() == super.owner() || _msgSender()==super._ownerOf(tokenId),"ERC721: Not owner");
        emit AddressRemoved(tokenId);
        _burn(tokenId);
    }
    // The following functions are overrides required by Solidity.
    function _burn(uint256 tokenId) internal override(ERC721URIStorage,ERC721) {
       super._burn(tokenId);
    }
    
    
}