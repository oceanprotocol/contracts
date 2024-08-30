// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Booster
 *
 * @dev Booster is an soul bound ERC721 used to calculate 
 * incentives boost rate for an address.
 * Only owner can mint
 */

contract Booster is Ownable, ERC721Enumerable,ERC721URIStorage {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;
    uint256 public immutable boost;
    constructor(string memory _name, string memory _symbol,uint256 _boost)
    ERC721(_name, _symbol) {
         boost=_boost;
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
        override(ERC721Enumerable,ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize)
        internal
        override(ERC721,ERC721Enumerable)
    {
        require(from == address(0), "Token not transferable");
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }
 
    function _createBoost(address user, string memory _tokenURI) private returns (uint256) {
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        _mint(user, newItemId);
        _setTokenURI(newItemId, _tokenURI);
        return newItemId;
    }

    function createBoost(address user, string memory _tokenURI) external onlyOwner returns (uint256) {
        return(_createBoost(user,_tokenURI));    
    }

    
    /**
     * @notice Batch Mint only for owner
     */
    function batchCreateBoosts(address[] memory user,string[] memory _tokenURI) external onlyOwner
    {
        uint256 i;
        require(user.length==_tokenURI.length);
        for(i=0;i<user.length;i++){
            _createBoost(user[i],_tokenURI[i]);
        }
    }

    // The following functions are overrides required by Solidity.
    function _burn(uint256 tokenId) internal override(ERC721URIStorage,ERC721) {
       revert("Burning not allowed");
    }
    
    
}