pragma solidity ^0.5.3;

import '@openzeppelin/upgrades/contracts/upgradeability/ProxyFactory.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import './DataToken.sol';

contract TokenFactory is ProxyFactory {

	using SafeMath for uint256;

	address public template;
   	uint256 public tokenCount;

   	mapping (uint256 => address) idToToken; 
   	mapping (address => uint256) tokenToId;

	constructor(address _template) public {
    	template   = _template;
		tokenCount = 0;    	
  	}

  	function createToken(
		string memory _metadata
	) 
	public 
	{
        bytes memory _payload = abi.encodeWithSignature("initialize(string)", _metadata);
		address token 		  = deployMinimal(template, _payload);

		tokenCount 			  = tokenCount.add(1);
		idToToken[tokenCount] = token;
		tokenToId[token] 	  = tokenCount;
	}

	function getTokenAddress(
		uint256 tokenId
	)
	public
	view
	returns(address)
	{
		return idToToken[tokenId];
	}

	function getTokenId(
		address tokenAddress
	)
	public
	view
	returns(uint256)
	{
		return tokenToId[tokenAddress];
	}
}