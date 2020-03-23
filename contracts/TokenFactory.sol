pragma solidity ^0.5.3;

import '@openzeppelin/upgrades/contracts/upgradeability/ProxyFactory.sol';

contract TokenFactory is ProxyFactory {

	address public template;
	
	address[] tokens;
	mapping(string => uint256) ids;

	constructor(address _template) public {
    	template = _template;
  	}

  	function createToken(
		string calldata _name, 
		string calldata _symbol, 
		string calldata _metadata
	) 
	external 
	// returns(address  token) 
	{
        require(ids[_symbol] == 0,
        	"token symbol already exists");
        
        bytes memory _payload = abi.encodeWithSignature("initialize(string,string,string)", _name, _symbol, _metadata);
		address token = deployMinimal(template, _payload);

		tokens.push(token);
		ids[_symbol] = tokens.length; 

	}


}

