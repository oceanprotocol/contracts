pragma solidity ^0.5.3;

// TODO
// [x] ERC20 standard interface + metadata
// [x] autogenerates human readable token names(ex. OceanDataToken1 - OceanDataTokenN)
// [ ] Implement dynamic fees for: 
//                  [x] 'Deploy'
//                  [x] 'mint'
//                  [ ] 'approve'
//                  [ ] 'transfer'
// [x] DataToken is an integer(not divisible)
// [x] add Ownable

import './Fees.sol';
import './TokenFactory.sol';
import '@openzeppelin/upgrades/contracts/Initializable.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol';

contract DataToken is Initializable, ERC20, Fees, Ownable {

    using SafeMath for uint256;

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

        uint256 tokenNumber = factory.getTokenCount(); 

        symbol   = string(abi.encodePacked('ODT-', tokenNumber.add(1))); 
        name     = string(abi.encodePacked('OceanDataToken-', tokenNumber.add(1)));

        emit Initialized(address(this));
	} 

	function mint(
        address to, 
        uint256 amount 
    )
        public
        payable
        onlyOwner
    {
        uint256 startGas = gasleft();
        
        super._mint(address(this), amount);
        
        require(_isPayed(startGas, msg.value),
            "fee is not payed");

        _transfer(address(this), to, amount);
    }

}