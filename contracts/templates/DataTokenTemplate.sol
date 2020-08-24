pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import './token/ERC20Pausable.sol';
import '../utils/FeeUtils.sol';
import '../interfaces/IERC20Template.sol';
/**
* @title DataTokenTemplate
*  
* @dev DataTokenTemplate is an ERC20 compliant token template
*      Used by the factory contract as a bytecode reference to 
*      deploy new DataTokens.
*/
contract DataTokenTemplate is IERC20Template, ERC20Pausable, FeeUtils {
    using SafeMath for uint256;
    
    bool    private initialized = false;
    string  private _name;
    string  private _symbol;
    string  private _blob;
    uint256 private _cap;
    uint256 private _decimals;
    address private _minter;
    

    event OrderStarted(
            uint256 amount, 
            bytes32 did, 
            uint256 serviceId, 
            address receiver, 
            uint256 startedAt,
            uint256 mrktFee,
            uint256 communityFee
    );

    event OrderFinished(
            bytes32 orderTxId, 
            address consumer, 
            uint256 amount, 
            bytes32 did, 
            uint256 serviceId, 
            address provider
    );

    modifier onlyNotInitialized() {
        require(
            !initialized,
            'DataTokenTemplate: token instance already initialized'
        );
        _;
    }
    
    modifier onlyMinter() {
        require(
            msg.sender == _minter,
            'DataTokenTemplate: invalid minter' 
        );
        _;
    }

    /**
     * @dev constructor
     *      Called prior contract deployment
     * @param name refers to a template DataToken name
     * @param symbol refers to a template DataToken symbol
     * @param minter refers to an address that has minter role
     */
    constructor(
        string memory name,
        string memory symbol,
        address minter,
        uint256 cap,
        string memory blob,
        address communityFeeCollector
    )
        public
        FeeUtils(communityFeeCollector)
    {
        _initialize(
            name,
            symbol,
            minter,
            cap,
            blob
        );
    }
    
    /**
     * @dev initialize
     *      Called prior contract initialization (e.g creating new DataToken instance)
     *      Calls private _initialize function. Only if contract is not initialized.
     * @param name refers to a new DataToken name
     * @param symbol refers to a nea DataToken symbol
     * @param minter refers to an address that has minter rights
     */
    function initialize(
        string memory name,
        string memory symbol,
        address minter,
        uint256 cap,
        string memory blob,
        address collector
    ) 
        public
        onlyNotInitialized
        returns(bool)
    {
        return _initialize(
            name,
            symbol,
            minter,
            cap,
            blob
        );
        setCommunityFeeCollector(collector);
    }

    /**
     * @dev _initialize
     *      Private function called on contract initialization.
     * @param name refers to a new DataToken name
     * @param symbol refers to a nea DataToken symbol
     * @param minter refers to an address that has minter rights
     */
    function _initialize(
        string memory name,
        string memory symbol,
        address minter,
        uint256 cap,
        string memory blob
    )
        private
        returns(bool)
    {
        require(
            minter != address(0), 
            'DataTokenTemplate: Invalid minter,  zero address'
        );

        require(
            _minter == address(0), 
            'DataTokenTemplate: Invalid minter, zero address'
        );

        require(
            cap > 0,
            'DataTokenTemplate: Invalid cap value'
        );
        
        _decimals = 18;
        _cap = cap;
        _name = name;
        _blob = blob;
        _symbol = symbol;
        _minter = minter;
        initialized = true;
        return initialized;
    }

    /**
     * @dev mint
     *      Only the minter address can call it.
     *      msg.value should be higher than zero and gt or eq minting fee
     * @param account refers to an address that token is going to be minted to.
     * @param value refers to amount of tokens that is going to be minted.
     */
    function mint(
        address account,
        uint256 value
    ) 
        public 
        payable 
        onlyNotPaused 
        onlyMinter 
    {
        require(
            totalSupply().add(value) <= _cap, 
            'DataTokenTemplate: cap exceeded'
        );
        _mint(account, value);
    }

    /**
     * @dev startOrder
     *      called by consumer prior ordering a service consume on a marketplace
     * @param receiver refers to an address that provide a service.
     * @param amount refers to amount of tokens that is going to be transfered.
     * @param did refers to DID or decentralized identifier for an asset
     * @param serviceId service index in the DID
     * @param mrktFee is the marketplace fee in wei.
     * @param mrktAddress maketplace address
     */
    function startOrder(
        address receiver, 
        uint256 amount,
        bytes32 did,
        uint256 serviceId,
        uint256 mrktFee,
        address mrktAddress
    )
        public
    {
        require(
            receiver != address(0),
            'DataTokenTemplate: invalid receiver address'
        );
        require(
            amount > mrktFee,
            'DataTokenTemplate: invalid market fee'
        );
        uint256 fee = mrktFee.add(
            calcCommunityFee(amount)
        );
        require(
            transfer(receiver, amount.sub(fee)),
            'DataTokenTemplate: failed to start order'
        );
        require(
            transfer(mrktAddress, mrktFee),
            'DataTokenTemplate: failed to transfer marketplace fee'
        );
        require(
            transfer(communityFeeCollectorAddress, calcCommunityFee(amount)),
            'DataTokenTemplate: failed to transfer community fee'
        );

        emit OrderStarted(
            amount, 
            did, 
            serviceId, 
            receiver, 
            block.number,
            mrktFee,
            calcCommunityFee(amount)
        );
    }

    /**
     * @dev finishOrder
     *      called by provider prior completing service delivery only
     *      if there is a partial or full refund.
     * @param orderTxId refers to the transaction Id  of startOrder acts 
     *                  as a payment reference.
     * @param consumer refers to an address that has consumed that service.
     * @param amount refers to amount of tokens that is going to be transfered.
     * @param did refers to DID or decentralized identifier for an asset.
     * @param serviceId service index in the DID.
     */
    function finishOrder(
        bytes32 orderTxId, 
        address consumer, 
        uint256 amount,
        bytes32 did, 
        uint256 serviceId
    )
        public
    {
        if ( amount > 0 )  
            require(
                transfer(consumer, amount),
                'DataTokenTemplate: failed to finish order'
            );

        emit OrderFinished(
            orderTxId, 
            consumer, 
            amount, 
            did, 
            serviceId, 
            msg.sender
        );
    }

    /**
     * @dev pause
     *      It pauses the contract functionalities (transfer, mint, etc)
     *      Only could be called if the contract is not already paused.
     *      Only called by the minter address.
     */
    function pause() public onlyNotPaused onlyMinter {
        paused = true;
    }

    /**
     * @dev unpause
     *      It unpauses the contract.
     *      Only called if the contract is paused.
     *      Only minter can call it.
     */
    function unpause() public onlyPaused onlyMinter {
        paused = false;
    }

    /**
     * @dev setMinter
     *      It sets a new token minter address.
     *      Only called be called if the contract is not paused.
     *      Only the current minter can call it.
     * @param minter refers to a new token minter address.
     */
    function setMinter(address minter) public onlyNotPaused onlyMinter {
        _minter = minter;
    }

    /**
     * @dev name
     *      It returns the token name.
     * @return DataToken name.
     */
    function name() public view returns(string memory) {
        return _name;
    }

    /**
     * @dev symbol
     *      It returns the token symbol.
     * @return DataToken symbol.
     */
    function symbol() public view returns(string memory) {
        return _symbol;
    }

    /**
     * @dev blob
     *      It returns the blob (e.g https://123.com).
     * @return DataToken blob.
     */
    function blob() public view returns(string memory) {
        return _blob;
    }

    /**
     * @dev decimals
     *      It returns the token decimals.
     *      how many supported decimal points
     * @return DataToken decimals.
     */
    function decimals() public view returns(uint256) {
        return _decimals;
    }

    /**
     * @dev cap
     *      it returns the capital.
     * @return DataToken cap.
     */
    function cap() public view returns (uint256) {
        return _cap;
    }

    /**
     * @dev isMinter
     *      It takes the address and checks whether it has a minter role.
     * @param account refers to the address.
     * @return true if account has a minter role.
     */
    function isMinter(address account) public view returns(bool) {
        return (_minter == account);
    } 

    /**
     * @dev isInitialized
     *      It checks whether the contract is initialized.
     * @return true if the contract is initialized.
     */ 
    function isInitialized() public view returns(bool) {
        return initialized;
    }

    /**
     * @dev isPaused
     *      Function checks if the contract is paused.
     * @return true if the contract is paused.
     */ 
    function isPaused() public view returns(bool) {
        return paused;
    }
}