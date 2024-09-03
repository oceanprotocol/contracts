pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "../utils/Deployer.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IAccessList{
    function initialize(address, string calldata, string calldata, 
        bool,address[] memory,string[] memory) external returns (bool);
    function transferable() external view returns (bool);
    
}
/**
 * @title DTFactory contract
 * @author Ocean Protocol Team
 *
 * @dev Implementation of Ocean datatokens Factory
 *
 *      DTFactory deploys datatoken proxy contracts.
 *      New datatoken proxy contracts are links to the template contract's bytecode.
 *      Proxy contract functionality is based on Ocean Protocol custom implementation of ERC1167 standard.
 */
contract AccessListFactory is Deployer, Ownable, ReentrancyGuard {
    address templateAddress;
    mapping(address => address) public accessListDeployedContracts;

    event NewAccessList(
        address indexed contractAddress,
        address indexed owner
    );
    
    /**
     * @dev Returns true if `account` is a contract.
     *
     * [IMPORTANT]
     * ====
     * It is unsafe to assume that an address for which this function returns
     * false is an externally-owned account (EOA) and not a contract.
     *
     * Among others, `isContract` will return false for the following
     * types of addresses:
     *
     *  - an externally-owned account
     *  - a contract in construction
     *  - an address where a contract will be created
     *  - an address where a contract lived, but was destroyed
     * ====
     */
    function _isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize, which returns 0 for contracts in
        // construction, since the code is only stored at the end of the
        // constructor execution.

        uint256 size;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            size := extcodesize(account)
        }
        return size > 0;
    }
    /**
     * @dev constructor
     *      Called on contract deployment. Could not be called with zero address parameters.
     * @param _template refers to the address of a deployed access list contract.
     */
    constructor(
        address _template
    ) {
        require(
            _template != address(0) && _isContract(_template),
            "Invalid template"
        );
        templateAddress=_template;
    }


    /**
     * @dev deployAccessListContract
     *      
     * @param name NFT name
     * @param symbol NFT Symbol
     * @param transferable if NFT is transferable. Cannot be changed afterwards
     * @param owner owner of the NFT
     * @param user array of users to add on the list
     * @param _tokenURI array of uris for each of the users to be added on the list
     */

    function deployAccessListContract(
        string calldata name,
        string calldata symbol,
        bool transferable,
        address owner,
        address[] memory user,
        string[] memory _tokenURI
    ) public returns (address token) {
        token = deploy(templateAddress);

        require(
            token != address(0),
            "Failed to deploy new access list"
        );
       
        accessListDeployedContracts[token] = token;
        emit NewAccessList(token,owner);
        IAccessList tokenInstance = IAccessList(token);
        require(
            tokenInstance.initialize(
                owner,
                name,
                symbol,
                transferable,
                user,
                _tokenURI
            ),
            "Unable to initialize access list"
        );

        
    }
    
    
      /**
     * @dev change the template address
            Only Owner can call it
     * @param _newTemplateAddress new template address
     */
    
    // function to activate a disabled token.
    function changeTemplateAddress(address _newTemplateAddress) external onlyOwner {
        require(
            _newTemplateAddress != address(0) && _isContract(_newTemplateAddress),
            "Invalid template"
        );
        templateAddress=_newTemplateAddress;
    }

    function isDeployed(address contractAddress) public view returns (bool){
        if(accessListDeployedContracts[contractAddress] == contractAddress) return true;
        return false;
    }
     function isSoulBound(address contractAddress) external view returns (bool){
        require(isDeployed(contractAddress)==true,"Not deployed by factory");
        return(!(IAccessList(contractAddress).transferable()));
     }

}