pragma solidity ^0.5.3;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";

contract DataToken is ERC20, Initializable{

	uint8 constant DECIMALS = 18;

    string  name;
    string  symbol;
    // uint8   decimals;
	string  metadata;
	// address owner;

	function initialize(
		string memory  _name, 
		string memory _symbol, 
		string memory _metadata
		// uint8   _decimals
		) public initializer 
	{
		// require(owner == address(0),
		// 	"owner should be a zero address");

		name 	 = _name;
		symbol 	 = _symbol;
		metadata = _metadata;

		// decimals = DECIMALS;	
		// owner 	 = msg.sender;
		// Ownable.initialize(msg.sender);
	} 

}