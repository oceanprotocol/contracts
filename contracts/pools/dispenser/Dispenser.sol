pragma solidity >=0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "../../interfaces/IERC20Template.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";


contract Dispenser {
    using SafeMath for uint256;
    address public router;

    struct DataToken {
        bool active;  // if the dispenser is active for this datatoken
        address owner; // owner of this dispenser
        uint256 maxTokens; // max tokens to dispense
        uint256 maxBalance; // max balance of requester. 
        //If the balance is higher, the dispense is rejected
    }
    mapping(address => DataToken) datatokens;
    address[] public datatokensList;
    
    
    event DispenserCreated(  // emited when a dispenser is created
        address indexed datatokenAddress
    );
    event DispenserActivated(  // emited when a dispenser is activated
        address indexed datatokenAddress
    );

    event DispenserDeactivated( // emited when a dispenser is deactivated
        address indexed datatokenAddress
    );

    
    event TokensDispensed( 
        // emited when tokens are dispended
        address indexed datatokenAddress,
        address indexed userAddress,
        uint256 amount
    );

    event OwnerWithdrawed(
        address indexed datatoken,
        address indexed owner,
        uint256 amount
    );

    constructor(address _router) {
        require(_router != address(0), "Dispenser: Wrong Router address");
        router = _router;
    }

    /**
     * @dev status
     *      Get information about a datatoken dispenser
     * @param datatoken refers to datatoken address.
     * @return active - if the dispenser is active for this datatoken
     * @return owner - owner of this dispenser
     * @return isMinter  - check the datatoken contract if the dispenser has mint roles
     * @return maxTokens - max tokens to dispense
     * @return maxBalance - max balance of requester. If the balance is higher, the dispense is rejected
     * @return balance - internal balance of the contract (if any)
     */
    function status(address datatoken) 
    external view 
    returns(bool active,address owner,
    bool isMinter,uint256 maxTokens,uint256 maxBalance, uint256 balance){
        require(
            datatoken != address(0),
            'Invalid token contract address'
        );
        active = datatokens[datatoken].active;
        owner = datatokens[datatoken].owner;
        maxTokens = datatokens[datatoken].maxTokens;
        maxBalance = datatokens[datatoken].maxBalance;
        IERC20Template tokenInstance = IERC20Template(datatoken);
        balance = tokenInstance.balanceOf(address(this));
        isMinter = tokenInstance.isMinter(address(this));
    }

    /**
     * @dev create
     *      Create a new dispenser
     * @param datatoken refers to datatoken address.
     * @param maxTokens - max tokens to dispense
     * @param maxBalance - max balance of requester.
     * @param owner - owner
     */
    function create(address datatoken,uint256 maxTokens, uint256 maxBalance, address owner)
        external {
        require(
            datatoken != address(0),
            'Invalid token contract address'
        );
        require(
            datatokens[datatoken].owner == address(0) || datatokens[datatoken].owner == owner,
            'DataToken already created'
        );
        datatokens[datatoken].active = true;
        datatokens[datatoken].owner = owner;
        datatokens[datatoken].maxTokens = maxTokens;
        datatokens[datatoken].maxBalance = maxBalance;
        datatokensList.push(datatoken);
        emit DispenserCreated(datatoken);
    }
    /**
     * @dev activate
     *      Activate a new dispenser
     * @param datatoken refers to datatoken address.
     * @param maxTokens - max tokens to dispense
     * @param maxBalance - max balance of requester.
     */
    function activate(address datatoken,uint256 maxTokens, uint256 maxBalance)
        external {
        require(
            datatoken != address(0),
            'Invalid token contract address'
        );
        require(
            datatokens[datatoken].owner == msg.sender, 'Invalid owner'
        );
        datatokens[datatoken].active = true;
        datatokens[datatoken].maxTokens = maxTokens;
        datatokens[datatoken].maxBalance = maxBalance;
        datatokensList.push(datatoken);
        emit DispenserActivated(datatoken);
    }

    /**
     * @dev deactivate
     *      Deactivate an existing dispenser
     * @param datatoken refers to datatoken address.
     */
    function deactivate(address datatoken) external{
        require(
            datatoken != address(0),
            'Invalid token contract address'
        );
        require(
            datatokens[datatoken].owner == msg.sender,
            'DataToken already activated'
        );
        datatokens[datatoken].active = false;
        emit DispenserDeactivated(datatoken);
    }

    

    /**
     * @dev dispense
     *  Dispense datatokens to caller. 
     *  The dispenser must be active, hold enough DT (or be able to mint more) 
     *  and respect maxTokens/maxBalance requirements
     * @param datatoken refers to datatoken address.
     * @param datatoken amount of datatokens required.
     */
    function dispense(address datatoken, uint256 amount) external payable{
        require(
            datatoken != address(0),
            'Invalid token contract address'
        );
        require(
            datatokens[datatoken].active == true,
            'Dispenser not active'
        );
        require(
            amount > 0,
            'Invalid zero amount'
        );
        require(
            datatokens[datatoken].maxTokens >= amount,
            'Amount too high'
        );
        IERC20Template tokenInstance = IERC20Template(datatoken);
        uint256 callerBalance = tokenInstance.balanceOf(msg.sender);
        require(
            callerBalance<datatokens[datatoken].maxBalance,
            'Caller balance too high'
        );
        uint256 ourBalance = tokenInstance.balanceOf(address(this));
        if(ourBalance<amount && tokenInstance.isMinter(address(this))){ 
            //we need to mint the difference if we can
            tokenInstance.mint(address(this),amount - ourBalance);
            ourBalance = tokenInstance.balanceOf(address(this));
        }
        require(
            ourBalance>=amount,
            'Not enough reserves'
        );
        tokenInstance.transfer(msg.sender,amount);
        emit TokensDispensed(datatoken, msg.sender, amount);
    }

    /**
     * @dev ownerWithdraw
     *      Allow owner to withdraw all datatokens in this dispenser balance
     * @param datatoken refers to datatoken address.
     */
    function ownerWithdraw(address datatoken) external{
        require(
            datatoken != address(0),
            'Invalid token contract address'
        );
        require(
            datatokens[datatoken].owner == msg.sender,
            'Invalid owner'
        );
        IERC20Template tokenInstance = IERC20Template(datatoken);
        uint256 ourBalance = tokenInstance.balanceOf(address(this));
        if(ourBalance>0){
            tokenInstance.transfer(msg.sender,ourBalance);
            emit OwnerWithdrawed(datatoken, msg.sender, ourBalance);
        }
    }
}
