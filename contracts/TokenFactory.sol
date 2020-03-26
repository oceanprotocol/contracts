pragma solidity ^0.5.3;

import './Fees.sol';
import './DataToken.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol';
import '@openzeppelin/upgrades/contracts/upgradeability/ProxyFactory.sol';

contract TokenFactory is ProxyFactory, Ownable, Fees {

	using SafeMath for uint256;

	address payable beneficiary;
	address public  template;
   	uint256 public  tokenCount;

   	mapping (uint256 => address) idToToken; 
   	mapping (address => uint256) tokenToId;

	constructor(
		address _template, 
		address payable _beneficiary
	) 
	public 
	{
    	beneficiary  = _beneficiary;
    	template     = _template;
		tokenCount   = 0;    	
  	}

  	function createToken(
		string memory _metadata
	) 
	public
	payable
	{
        uint256 startGas      = gasleft();

        bytes memory _payload = abi.encodeWithSignature("initialize(string)", _metadata);
		address token 		  = deployMinimal(template, _payload);

		tokenCount 			  = tokenCount.add(1);
		idToToken[tokenCount] = token;
		tokenToId[token] 	  = tokenCount;
	
		require(_isPayed(startGas, msg.value),
			"fee is not payed");
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

	function getTokenCount()
	public
	view
	returns(uint256)
	{
		return tokenCount;
	}

	function changeBeneficiary(
		address payable newBeneficiary
	)
	public
	onlyOwner
	{
		beneficiary = newBeneficiary;
	}

}