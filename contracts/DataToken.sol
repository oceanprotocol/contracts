pragma solidity ^0.5.3;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/upgrades/contracts/Initializable.sol';

// TODO
// [] ERC20 standard interface + metadata
// [] DataToken is an integer(not divisible)
// [] add Ownable
// [] autogenerates human readable token names(ex. OceanDataToken1 - OceanDataTokenN)
// [] Implement dynamic fees for 'mint', 'transfer', 'approve', Deploy proxy contract 

contract DataToken is ERC20, Initializable{

    string  name;
    string  symbol;
	string  metadata;

	function initialize(
		string memory _metadata
		) public initializer 
	{

		// name 	 = _name;
		// symbol 	 = _symbol;
		metadata = _metadata;

		// Ownable.initialize(msg.sender);
	} 

	function _mint(address to, address payable from)
        external
        payable
    {
    	// require(owner == msg.sender,
    	// 	"minter should be a message sender");
        uint256 startGas = gasleft();
        
        super._mint(address(this), 1);
        
        uint256 usedGas = startGas - gasleft();
        uint256 fee = usedGas * tx.gasprice;

    	require(msg.value > fee,
    		"not enough ether to deduct fee");

        if (msg.value > fee){
        	from.transfer(msg.value-fee);
        }

        _transfer(address(this), to, 1);
    }


}