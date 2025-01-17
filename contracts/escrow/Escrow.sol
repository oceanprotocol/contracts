pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title Escrow contract
 *
 * @dev escrow contract between payer (aka user, consumer, etc) 
 *      and payee (app/services that is performing a task which needs to be paid).
 *
 * The payer flow looks like:
 *   - payer deposits token
 *   - payer sets limit for payees (max amount, max process time)
 *  
 * 
 * The payee flow looks like:
 *   - payer asks for service (like compute) offchain
 *   - payee computes the maximum amount and locks that amount in the escrow contract
 *   - payee performs the service
 *   - payee takes the actual amount from the lock and releases back the remaining
 */
contract Escrow is
    ReentrancyGuard
{
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    

    /*  User funds are stored per user and per token */
    struct userFunds{
        uint256 available;
        uint256 locked;
    }

    mapping(address => mapping(address => userFunds)) private funds; // user -> token -> userFunds
    
    /*  Payee authorizations are stored per user and per token */
    struct auth{
        address payee;
        uint256 maxLockedAmount;
        uint256 currentLockedAmount;
        uint256 maxLockSeconds;
        uint256 maxLockCounts;
        uint256 currentLocks;
    }
    
    mapping(address => mapping(address => auth[])) private userAuths; // user -> token -> userAuths
    

    // locks
    struct lock{
        uint256 jobId;
        address payer;
        address payee;
        uint256 amount;
        uint256 expiry;
        address token;
    }
    lock[] locks;

    // events
    event Deposit(address indexed payer,address token,uint256 amount);
    event Withdraw(address indexed payer,address token,uint256 amount);
    event Auth(address indexed payer,address indexed payee,uint256 maxLockedAmount,
        uint256 maxLockSeconds,uint256 maxLockCounts);
    event Lock(address payer,address payee,uint256 jobId,uint256 amount,uint256 expiry,address token);
    event Claimed(address indexed payee,uint256 jobId,address token,address indexed payer,uint256 amount,bytes proof);
    event Canceled(address indexed payee,uint256 jobId,address token,address indexed payer,uint256 amount);

    /* Payer actions  */
    
    /**
     * @dev deposit
     *      Called by payer to deposit funds in the contract
     *      
     * @param token token to deposit
     * @param amount amount in wei to deposit
     */
    function deposit(address token,uint256 amount) external nonReentrant{
        require(token!=address(0),"Invalid token address");
        funds[msg.sender][token].available+=amount;
        emit Deposit(msg.sender,token,amount);
        _pullUnderlying(token,msg.sender,address(this),amount);
        
    }

    /**
     * @dev withdraw
     *      Called by payer to withdraw available (not locked) funds from the contract
     *      
     * @param token token to withdraw
     * @param amount amount in wei to withdraw
     */
    function withdraw(address token,uint256 amount) external nonReentrant{
        require(funds[msg.sender][token].available>=amount,"Not enough available funds");
        funds[msg.sender][token].available-=amount;
        emit Withdraw(msg.sender,token,amount);
        IERC20(token).safeTransfer(
            msg.sender,
            amount
        );
    }

    /**
     * @dev authorize
     *      Called by payer to authorize a payee to lock and claim funds
     *      
     * @param token token to lock
     * @param payee payee address
     * @param maxLockedAmount maximum amount locked by payee in one lock
     * @param maxLockSeconds maximum lock duration in seconds
     * @param maxLockCounts maximum locks held by this payee
     */
    function authorize(address token,address payee,uint256 maxLockedAmount,
        uint256 maxLockSeconds,uint256 maxLockCounts) external{
        
        require(token!=address(0),'Invalid token');
        require(payee!=address(0),'Invalid payee');
        uint256 i;
        uint256 length=userAuths[msg.sender][token].length;
        for(i=0;i<length;i++){
            if(userAuths[msg.sender][token][i].payee==payee){
                userAuths[msg.sender][token][i].maxLockedAmount=maxLockedAmount;
                userAuths[msg.sender][token][i].maxLockSeconds=maxLockSeconds;
                userAuths[msg.sender][token][i].maxLockCounts=maxLockCounts;
                break;
            }
        }
        if(i==length){ //not found
            userAuths[msg.sender][token].push(auth(payee,maxLockedAmount,0,maxLockSeconds,maxLockCounts,0));
        }
        emit Auth(msg.sender,payee,maxLockedAmount,maxLockSeconds,maxLockCounts);

    }

    /* Payer view actions  */
    /**
     * @dev getFunds
     *      Returns funds information for caller
     *      
     * @param token token
     */
    function getFunds(address token) public view returns (userFunds memory){
        return(funds[msg.sender][token]);
    }
    
    /**
     * @dev getLocks
     *      Returns all locks, filtered
     *      
     * @param token token to filter (zero address means any)
     * @param payer payer to filter (zero address means any)
     * @param payee payee to filter (zero address means any)
     */
    function getLocks(address token,address payer,address payee) public view returns (lock[] memory){
        // since solidty does not supports dynamic memory arrays, we need to calculate the return size first
        uint256 size=0;
        uint256 length=locks.length;
        for(uint256 i=0;i<length;i++){
            if( 
                (address(token)==address(0) || address(token)==locks[i].token) || 
                (address(payee)==address(0) || address(payee)==locks[i].payee) || 
                (address(payer)==address(0) || address(payer)==locks[i].payer)
            ){
                size++;
            }
        }
        
        lock[] memory tempPendings=new lock[](size);
        size=0;
        for(uint256 i=0;i<length;i++){
            if(
                (address(token)==address(0) || address(token)==locks[i].token) ||
                (address(payee)==address(0) || address(payee)==locks[i].payee) ||
                (address(payer)==address(0) || address(payer)==locks[i].payer)
            ){
                tempPendings[size]=locks[i];
                size++;
            }
        }    
        return(tempPendings);
    }

    
    /**
     * @dev getAuthorizations
     *      Returns all auths
     *      
     * @param token token, required
     * @param payer payer, required
     * @param payee payee to filter (zero address means any)
     */
    function getAuthorizations(address token,address payer,address payee) public view returns (auth[] memory){
        require(payer!=address(0),'Invalid payer');
        require(token!=address(0),'Invalid token');
        // since solidty does not supports dynamic memory arrays, we need to calculate the return size first
        uint256 size=0;
        uint256 length=userAuths[payer][token].length;
        for(uint256 i=0;i<length;i++){
            if(address(payee)==address(0) || address(payee)==userAuths[payer][token][i].payee) size++;
        }
        auth[] memory tempAuths=new auth[](size);
        size=0;
        for(uint256 i=0;i<length;i++){
            if(address(payee)==address(0) || address(payee)==userAuths[payer][token][i].payee){
                tempAuths[size]=userAuths[payer][token][i];
                size++;
            }
        }    
        return(tempAuths);
    }

    /* Payee  functions   */

    /**
     * @dev createLock
     *      Called by payee to create a lock
     *      
     * @param jobId jobId, required
     * @param token token, required
     * @param payer payer address
     * @param amount amount in wei to lock
     * @param expiry expiry timestamp
     */
    function createLock(uint256 jobId,address token,address payer,uint256 amount,uint256 expiry) external{
        require(payer!=address(0),'Invalid payer');
        require(token!=address(0),'Invalid token');
        require(amount>0,"Invalid amount");
        require(jobId>0,"Invalid jobId");
        auth memory tempAuth=auth(address(0),0,0,0,0,0);
        uint256 index;
        uint256 ts=block.timestamp;
        require(funds[payer][token].available>=amount,"Payer does not have enough funds");
        uint256 length=userAuths[payer][token].length;
        for(index=0;index<length;index++){
            if(msg.sender==userAuths[payer][token][index].payee) {
                tempAuth=userAuths[payer][token][index];
                break;
            }
        }
        require(tempAuth.payee==msg.sender,"No auth found");
        require(expiry>ts && expiry <= (ts+tempAuth.maxLockSeconds),"Invalid expiry");
        require(amount<= tempAuth.maxLockedAmount,"Amount too high");
        require(tempAuth.currentLockedAmount+amount<=tempAuth.maxLockedAmount,"Exceeds maxLockedAmount");
        require(tempAuth.currentLocks<tempAuth.maxLockCounts,"Exceeds maxLockCounts");
        // check jobId
        length=locks.length;
        for(uint256 i=0;i<length;i++){
            if(locks[i].payer==payer && locks[i].payee==msg.sender && locks[i].jobId==jobId){
                revert("JobId already exists");
            }
        }
        // update auths
        userAuths[payer][token][index].currentLockedAmount+=amount;
        userAuths[payer][token][index].currentLocks+=1;
        // update user funds
        funds[payer][token].available-=amount;
        funds[payer][token].locked+=amount;
        // create the lock
        locks.push(lock(jobId,payer,msg.sender,amount,expiry,token));
        emit Lock(payer,msg.sender,jobId,amount,expiry,token);
    }

    /**
     * @dev claimLock
     *      Called by payee to claim a lock (fully or partial)
     *      Must match a previous lock
     *      
     * @param jobId jobId, required
     * @param token token, required
     * @param payer payer address
     * @param amount amount in wei to claim
     * @param proof job proof
     */
    function claimLock(uint256 jobId,address token,address payer,uint256 amount,
        bytes memory proof) external nonReentrant{
        
        require(payer!=address(0),'Invalid payer');
        require(token!=address(0),'Invalid token');
        require(jobId>0,'Invalid jobId');
        lock memory tempLock=lock(0,address(0),address(0),0,0,address(0));
        uint256 index;
        uint256 length=locks.length;
        for(index=0;index<length;index++){
            if(
                msg.sender==locks[index].payee && 
                payer==locks[index].payer && 
                jobId==locks[index].jobId

            ) {
                tempLock=locks[index];
                break;
            }
        }
        require(tempLock.payee==msg.sender,"Lock not found");
        if(tempLock.expiry<block.timestamp){
            //we are too late, cancel the lock
            cancelExpiredLocks(jobId,token,payer,msg.sender);
            return;
        }
        require(tempLock.amount>=amount,"Amount too high");
        
        //update auths
        length=userAuths[payer][token].length;
        for(uint256 i=0;i<length;i++){
            if(userAuths[payer][token][i].payee==msg.sender){
                userAuths[payer][token][i].currentLockedAmount-=tempLock.amount;
                userAuths[payer][token][i].currentLocks-=1;
            }
        }
        //update user funds
        funds[payer][token].available+=tempLock.amount-amount;
        funds[payer][token].locked-=tempLock.amount;
        //delete the lock
        if(index<locks.length-1){
            locks[index]=locks[locks.length-1];
        }
        locks.pop();
        
        emit Claimed(msg.sender,jobId,token,payer,amount,proof);
        //send the tokens
        IERC20(token).safeTransfer(msg.sender,amount);
    }

    /**
     * @dev cancelExpiredLocks
     *      Can be called by anyone to release an expired locks
     *      
     * @param jobId jobId, if 0 matches any jobId
     * @param token token (zero address means any)
     * @param payer payer address (zero address means any)
     * @param payee payee address (zero address means any)
     */
    function cancelExpiredLocks(uint256 jobId,address token,address payer,address payee) public{
        uint256 index;
        //since solidy does not supports dynamic arrays, we need to count first
        uint256 found=0;
        uint256 length=locks.length;
        for(index=0;index<length;index++){
            if(locks[index].expiry<block.timestamp &&
                (
                    (jobId==0 || jobId==locks[index].jobId) &&
                    (token==address(0) || token==locks[index].token) &&
                    (payer==address(0) || payer==locks[index].payer) &&
                    (payee==address(0) || payee==locks[index].payee)
                )
            ){
                found++;
            }
        }
        // bail out if we don't have any expired matching locks
        if(found==0) return;
        uint256[] memory indexToDelete=new uint256[](found);
        uint256 currentIndex=0;
        // now actually do the work
        for(index=0;index<length;index++){
            if(locks[index].expiry<block.timestamp &&
                (
                    (jobId==0 || jobId==locks[index].jobId) &&
                    (token==address(0) || token==locks[index].token) &&
                    (payer==address(0) || payer==locks[index].payer) &&
                    (payee==address(0) || payee==locks[index].payee)
                )
            ){
                //cancel each lock, one by one
                //update auths
                uint256 authsLength=userAuths[locks[index].payer][locks[index].token].length;
                for(uint256 i=0;i<authsLength;i++){
                        if(userAuths[payer][token][i].payee==locks[index].payee){
                            userAuths[payer][token][i].currentLockedAmount-=locks[index].amount;
                            userAuths[payer][token][i].currentLocks-=1;
                        }
                }
                //update user funds
                funds[locks[index].payer][locks[index].token].available+=locks[index].amount;
                funds[locks[index].payer][locks[index].token].locked-=locks[index].amount;
                emit Canceled(locks[index].payee,locks[index].jobId,locks[index].token,
                    locks[index].payer,locks[index].amount);
                indexToDelete[currentIndex]=index;
                currentIndex++;
            }
        }
        //delete the locks
        uint256 delLength=indexToDelete.length;
        for(index=0;index<delLength;index++){
            locks[indexToDelete[index]]=locks[locks.length-1];
            locks.pop();
        }
    }

    /* Utils */
    function _pullUnderlying(
        address erc20,
        address from,
        address to,
        uint256 amount
    ) internal {
        uint256 balanceBefore = IERC20(erc20).balanceOf(to);
        IERC20(erc20).safeTransferFrom(from, to, amount);
        require(
            IERC20(erc20).balanceOf(to) >= balanceBefore.add(amount),
            "Transfer amount is too low"
        );
    }
}