pragma solidity ^0.5.3;

import './Fees.sol';
import './TokenFactory.sol';
import '@openzeppelin/upgrades/contracts/Initializable.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol';

/**
* @title DataToken
* @dev ERC20 contract with metadata that acts as a template contract 
*      for Ocean Data Tokens proxy contracts(ERC1167)
*/
contract DataToken is Initializable, ERC20, Fees, Ownable {

    using SafeMath for uint256;

    string       public name;
    string       public symbol;
	string       public metadata;
    TokenFactory public factory;

    event Initialized(address indexed thisAddress);

    /**
     * @notice initializer
     * @param _metadata Data token metadata
     * @param _publisher publisher(contract owner) address
     */
	function initialize(
		string memory _metadata,
        address _publisher
	) 
    public 
    initializer 
	{
        Ownable.initialize(_publisher);

        factory  = TokenFactory(msg.sender);
	   	metadata = _metadata;

        uint256 tokenNumber = factory.getTokenCount(); 

        symbol   = string(abi.encodePacked('ODT-', tokenNumber.add(1))); 
        name     = string(abi.encodePacked('OceanDataToken-', tokenNumber.add(1)));

        emit Initialized(address(this));
	} 

    /**
     * @notice mint Data Token
     * @param _to mint to address
     * @param _amount amount of data tokens being minted
     */
	function mint(
        address _to, 
        uint256 _amount 
    )
        public
        payable
        onlyOwner
    {
        uint256 startGas = gasleft();
        
        _mint(address(this), _amount);
        
        require(_isPayed(startGas, msg.value),
            "fee is not payed");
        //TODO: add transfer fee to beneficiary
        _transfer(address(this), _to, _amount);
    }

}