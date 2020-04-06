pragma solidity ^0.5.0;

import './Fees.sol';
import './DataToken.sol';
import '@openzeppelin/upgrades/contracts/upgradeability/ProxyFactory.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol';

/**
* @title TokenFactory
* @dev Contract for creation of Ocean Data Tokens
*/
contract TokenFactory is ProxyFactory, Ownable, Fees {

	using SafeMath for uint256;

	address payable beneficiary;
	address public  template;
   	uint256 public  tokenCount;

   	mapping (uint256 => address) idToToken; 
   	mapping (address => uint256) tokenToId;

	/**
     * @notice constructor
     * @param _template data token template address
     * @param _beneficiary address that collects fees
     */
	constructor(
		address _template, 
		address payable _beneficiary
	) 
	public 
	{
		Ownable.initialize(msg.sender);

    	beneficiary  = _beneficiary;
    	template     = _template;
		tokenCount   = 0;    	
  	}

	/**
     * @notice Create Data token contract proxy
     * @param _metadata Data token metadata
     */
  	function createToken(
		string memory _metadata
	) 
	public
	payable
	returns(address)
	{
        uint256 startGas      = gasleft();

        bytes memory _payload = abi.encodeWithSignature("initialize(string,address)", _metadata, msg.sender);
		address token 		  = deployMinimal(template, _payload);

		tokenCount 			  = tokenCount.add(1);
		idToToken[tokenCount] = token;
		tokenToId[token] 	  = tokenCount;

		// discuss: change to "=="
		require(msg.value >= _getFee(startGas),
			"fee amount is not enough");
		
		//transfer fee to beneficiary
		beneficiary.transfer(msg.value); 

		return token;
	}


	/**
     * @notice Get Data Token contract address
     * @param tokenId token id
     * @return token address
     */
	function getTokenAddress(
		uint256 tokenId
	)
	public
	view
	returns(address)
	{
		return idToToken[tokenId];
	}

	/**
     * @notice Get Data Token id
     * @param tokenAddress Data Token contract address
     * @return token id
     */
	function getTokenId(
		address tokenAddress
	)
	public
	view
	returns(uint256)
	{
		return tokenToId[tokenAddress];
	}

	/**
     * @notice Get total number of tokens deployed
     * @return number of tokens deployed
     */
	function getTokenCount(
		)
	public
	view
	returns(uint256)
	{
		return tokenCount;
	}

	/**
     * @notice Get address of a current beneficiary
     */
	function getBeneficiary(
		) 
	public 
	view 
	returns(address payable) 
	{
		return beneficiary;
	}

	/**
     * @notice Change beneficiary address(only contract owner can do that)
	 * @param newBeneficiary new beneficiary address
     */
	function changeBeneficiary(
		address payable newBeneficiary
	)
	public
	onlyOwner
	{
		beneficiary = newBeneficiary;
	}

}