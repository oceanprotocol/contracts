pragma solidity ^0.5.0;

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

    bool         public initialized = false;

    event Initialized(address indexed thisAddress);

    /**
     * @notice initializer
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

        symbol      = string(abi.encodePacked('ODT-', tokenNumber.add(1))); 
        name        = string(abi.encodePacked('OceanDataToken-', tokenNumber.add(1)));
        initialized = true;

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
        uint256 startGas            = gasleft();
        address payable beneficiary = factory.getBeneficiary();

        //mint tokens
        _mint(address(this), _amount);

        // discuss: change to "=="
        require(msg.value >= _getFee(startGas),
            "fee amount is not enough");
        
        //transfer fee to beneficiary
        beneficiary.transfer(msg.value); 

        _transfer(address(this), _to, _amount);
    }

    /**
     * @notice Get token symbol
     */
    function getSymbol() public view returns (string memory) {
        return symbol;
    }

    /**
     * @notice Get token name
     */
    function getName() public view returns (string memory) {
        return name;
    }

    /**
     * @notice Check if the token contract is initialized
     */
    function isInitialized() public view returns (bool) {
        return initialized;
    }

}