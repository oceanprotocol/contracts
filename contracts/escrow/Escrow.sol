pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IFactoryRouter.sol";

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
    
    // OPC fee router
    address public factoryRouter; 

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

    // Add constructor to set router
    constructor(address _factoryRouter) {
        require(_factoryRouter != address(0), "Invalid router");
        factoryRouter = _factoryRouter;
    }
    /* Payer actions  */
    
    /**
     * @dev deposit
     *      Called by payer to deposit funds in the contract
     *      
     * @param token token to deposit
     * @param amount amount in wei to deposit
     */
    function deposit(address token,uint256 amount) external nonReentrant{
        _deposit(token,amount);
    }
    /**
     * @dev depositMultiple
     *      Called by payer to deposit multiple amount of tokens in the contract
     *      
     * @param token array of tokens to deposit
     * @param amount array of amounts in wei to deposit
     */
    function depositMultiple(address[] memory token,uint256[] memory amount) external nonReentrant{
        require(token.length==amount.length,"Invalid input");
        for(uint256 i=0;i<token.length;i++){
            _deposit(token[i],amount[i]);
        }
    }
    function _deposit(address token,uint256 amount) internal{
        require(token!=address(0),"Invalid token address");
        funds[msg.sender][token].available+=amount;
        emit Deposit(msg.sender,token,amount);
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        require(
            IERC20(token).balanceOf(address(this)) >= balanceBefore.add(amount),
            "Transfer amount is too low"
        );
        
    }

    /**
     * @dev withdraw
     *      Called by payer to withdraw available (not locked) funds from the contract
     *      
     * @param token array of tokens to withdraw
     * @param amount array of amounts in wei to withdraw
     */
    function withdraw(address[] memory token,uint256[] memory amount) external nonReentrant{
        require(token.length==amount.length,"Invalid input");
        for(uint256 i=0;i<token.length;i++){
            _withdraw(token[i],amount[i]);
        }
    }
    function _withdraw(address token,uint256 amount) internal{
        if(funds[msg.sender][token].available>=amount){
            funds[msg.sender][token].available-=amount;
            emit Withdraw(msg.sender,token,amount);
            IERC20(token).safeTransfer(
                msg.sender,
                amount
            );
        }
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
        uint256 maxLockSeconds,uint256 maxLockCounts) external nonReentrant{
        _authorize(token,payee,maxLockedAmount,maxLockSeconds,maxLockCounts);
    }

    /**
     * @dev authorizeMultiple
     *      Called by payer to authorize multiple payees to lock and claim funds
     *      
     * @param token array of tokens to lock
     * @param payee array of payees addresses
     * @param maxLockedAmount array of maximum amount locked by payee in one lock
     * @param maxLockSeconds array of maximum lock duration in seconds
     * @param maxLockCounts array of maximum locks held by this payee
     */
    function authorizeMultiple(address[] memory token,address[] memory payee,uint256[] memory maxLockedAmount,
        uint256[] memory maxLockSeconds,uint256[] memory maxLockCounts) external nonReentrant{
            require(token.length==payee.length && 
                    token.length==maxLockedAmount.length && 
                    token.length==maxLockSeconds.length && 
                    token.length==maxLockCounts.length,"Invalid input");
            for(uint256 i=0;i<token.length;i++){
                _authorize(token[i],payee[i],maxLockedAmount[i],maxLockSeconds[i],maxLockCounts[i]);
            }
    }
    
    function _authorize(address token,address payee,uint256 maxLockedAmount,
        uint256 maxLockSeconds,uint256 maxLockCounts) internal{
        
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
     * @dev getUserFunds
     *      Returns funds information for a specific payer
     *      
     * @param payer payer
     * @param token token
     */
    function getUserFunds(address payer,address token) public view returns (userFunds memory){
        return(funds[payer][token]);
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
    function createLock(uint256 jobId,address token,address payer,uint256 amount,uint256 expiry) external nonReentrant{
        _createLock(jobId,token,payer,amount,expiry);
    }
    /**
     * @dev createLocks
     *      Called by payee to create multiple locks
     *      
     * @param jobId array of jobIds
     * @param token array of tokens
     * @param payer array of payer addresses
     * @param amount array of amounts in wei to lock
     * @param expiry array of expiry timestamps
     */
    function createLocks(uint256[] memory jobId,address[] memory token,
        address[] memory payer,uint256[] memory amount,uint256[] memory expiry) external nonReentrant{
        
        require(jobId.length==token.length && 
            jobId.length==payer.length && 
            jobId.length==amount.length && 
            jobId.length==expiry.length,"Invalid input");
        for(uint256 i=0;i<jobId.length;i++){
            _createLock(jobId[i],token[i],payer[i],amount[i],expiry[i]);
        }
    }
    function _createLock(uint256 jobId,address token,address payer,uint256 amount,uint256 expiry) internal {
        require(payer!=address(0),'Invalid payer');
        require(token!=address(0),'Invalid token');
        require(amount>0,"Invalid amount");
        require(jobId>0,"Invalid jobId");
        auth memory tempAuth=auth(address(0),0,0,0,0,0);
        uint256 index;
        require(funds[payer][token].available>=amount,"Payer does not have enough funds");
        uint256 length=userAuths[payer][token].length;
        for(index=0;index<length;index++){
            if(msg.sender==userAuths[payer][token][index].payee) {
                tempAuth=userAuths[payer][token][index];
                break;
            }
        }
        require(tempAuth.payee==msg.sender,"No auth found");
        require(expiry<=tempAuth.maxLockSeconds,"Expiry too high");
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
        locks.push(lock(jobId,payer,msg.sender,amount,block.timestamp+expiry,token));
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
    function claimLock(uint256 jobId,address token,address payer,uint256 amount,bytes memory proof) 
        external nonReentrant{
            _claimLock(jobId,token,payer,amount,proof);
    }
    
    /**
     * @dev claimLocks
     *      Called by payee to claim locks (fully or partial) and keeps funds in the contract
     *      Must match previous locks
     *      
     * @param jobId array of jobIds
     * @param token array of tokens
     * @param payer array of payer addresses
     * @param amount array amounts in wei to claim
     * @param proof array of job proofs
     */
    function claimLocks(uint256[] memory jobId,address[] memory token,
        address[] memory  payer,uint256[] memory amount,
        bytes[] memory proof) external nonReentrant{
        
            require(jobId.length==token.length && 
                    jobId.length==payer.length && 
                    jobId.length==amount.length && 
                    jobId.length==proof.length,"Invalid input");
            for(uint256 i=0;i<jobId.length;i++){
                _claimLock(jobId[i],token[i],payer[i],amount[i],proof[i]);
            }
    }
    /**
     * @dev claimLockAndWithdraw
     *      Called by payee to claim lock (fully or partial) and withdraw funds
     *      Must match previous lock
     *      
     * @param jobId jobId, required
     * @param token token, required
     * @param payer payer address
     * @param amount amount in wei to claim
     * @param proof job proof
     */
    function claimLockAndWithdraw(uint256 jobId,address token,address payer,
        uint256 amount,bytes memory proof) external nonReentrant{
            _claimLock(jobId,token,payer,amount,proof);
            _withdraw(token,funds[msg.sender][token].available);
        
    }
    /**
     * @dev claimLocksAndWithdraw
     *      Called by payee to claim locks (fully or partial) and withdraw funds
     *      Must match previous locks
     *      
     * @param jobId array of jobIds
     * @param token array of tokens
     * @param payer array of payer addresses
     * @param amount array amounts in wei to claim
     * @param proof array of job proofs
     */
    function claimLocksAndWithdraw(uint256[] memory jobId,address[] memory token,
        address[] memory  payer,uint256[] memory amount,bytes[] memory proof) external nonReentrant{
        
        require(jobId.length==token.length && 
            jobId.length==payer.length && 
            jobId.length==amount.length && 
            jobId.length==proof.length,"Invalid input");
        uint256 i;
        for(i=0;i<jobId.length;i++){
            _claimLock(jobId[i],token[i],payer[i],amount[i],proof[i]);
        }
        for(i=0;i<token.length;i++){
            if(funds[msg.sender][token[i]].available>0){
                _withdraw(token[i],funds[msg.sender][token[i]].available);
            }
        }
    }
    
    function _claimLock(uint256 jobId,address token,address payer,uint256 amount,
        bytes memory proof) internal {
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
            _cancelExpiredLock(jobId,token,payer,msg.sender);
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
        // OPC fee logic
        uint256 opcFee = IFactoryRouter(factoryRouter).getOPCFee(token);
        uint256 feeAmount = amount.mul(opcFee).div(1e18);
        uint256 payout = amount.sub(feeAmount);
        // Transfer OPC fee to collector if any
        if(feeAmount > 0){
            address opcCollector = IFactoryRouter(factoryRouter).getOPCCollector();
            IERC20(token).safeTransfer(opcCollector, feeAmount);
        }
        //update user funds
        funds[payer][token].available+=tempLock.amount-amount;
        funds[payer][token].locked-=tempLock.amount;
        //update payee balance
        funds[msg.sender][token].available+=payout;
        //delete the lock
        if(index<locks.length-1){
            locks[index]=locks[locks.length-1];
        }
        locks.pop();
        emit Claimed(msg.sender,jobId,token,payer,amount,proof);
    }

    /**
     * @dev cancelExpiredLock
     *      Can be called by anyone to release an expired lock
     *      
     * @param jobId jobId, if 0 matches any jobId
     * @param token token (zero address means any)
     * @param payer payer address (zero address means any)
     * @param payee payee address (zero address means any)
     */
    function cancelExpiredLock(uint256 jobId,address token,address payer,address payee) external nonReentrant{
        _cancelExpiredLock(jobId,token,payer,payee);
        
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
    function cancelExpiredLocks(uint256[] memory jobId,address[] memory token,address[] memory payer,
        address[] memory payee) external nonReentrant{
            require(jobId.length==token.length && 
            jobId.length==payer.length && 
            jobId.length==payee.length,"Invalid input");
            for(uint256 i=0;i<jobId.length;i++){
                _cancelExpiredLock(jobId[i],token[i],payer[i],payee[i]);
            }
    }
    
    function _cancelExpiredLock(uint256 jobId,address token,address payer,address payee) internal{
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
}