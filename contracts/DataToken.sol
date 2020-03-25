pragma solidity ^0.5.3;

import './TokenFactory.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/upgrades/contracts/Initializable.sol';

// TODO
// [x] ERC20 standard interface + metadata
// [x] autogenerates human readable token names(ex. OceanDataToken1 - OceanDataTokenN)
// [] Implement dynamic fees for: 
//                  * 'mint'
//                  * 'Deploy'
//                  * 'approve'
//                  * 'transfer'
// [] DataToken is an integer(not divisible)
// [] add Ownable

contract DataToken is ERC20, Initializable {

    string       public name;
    string       public symbol;
	string       public metadata;
    TokenFactory public factory;

    event Initialized(address indexed thisAddress);

	function initialize(
		string memory _metadata
	) 
    public 
    initializer 
	{
        factory  = TokenFactory(msg.sender);
	   	metadata = _metadata;

        symbol   = string(abi.encodePacked('ODT-', factory.getTokenCount()));
        name     = string(abi.encodePacked('OceanDataToken-', factory.getTokenCount()));

        emit Initialized(address(this));
	} 

	function _mint(
        address to, 
        address payable from
    )
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