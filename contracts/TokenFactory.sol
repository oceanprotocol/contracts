pragma solidity ^0.5.3;

import '@openzeppelin/upgrades/contracts/upgradeability/ProxyFactory.sol';
import './DataToken.sol';

// TODO
// [] 'Uniswap-like architecture'
// []  minimal token registry
// []  token registry related functions

contract TokenFactory is ProxyFactory {

	address public template;
	
	address[] tokens;
   	mapping (uint256 => address) idToToken; 
   	mapping (address => uint256) tokenToId;

	constructor(address _template) public {
    	template = _template;
  	}

  	function createToken(
		string calldata _name, 
		string calldata _symbol, 
		string calldata _metadata
	) 
	external 
	{

        bytes memory _payload = abi.encodeWithSignature("initialize(string,string,string)", _name, _symbol, _metadata);
		address token = deployMinimal(template, _payload);

		tokens.push(token);
		idToToken[tokens.length] = token;
		tokenToId[token] = tokens.length;
	}

	function getTokenAddress(uint256 tokenId) public view returns(address) {
		return idToToken[tokenId];
	}

	function getTokenId(address tokenAddress) public view returns(uint256) {
		return tokenToId[tokenAddress];
	}

}

