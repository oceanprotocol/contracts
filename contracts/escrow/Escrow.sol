pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IFactoryRouter.sol";
import "../interfaces/ISubsidyProvider.sol";

/**
 * @title Escrow contract
 *
 * @dev escrow contract between payer (aka user, consumer, etc) 
 *      and payee (app/services that is performing a task which needs to be paid).
 *
 * The payer flow looks like:
 *   - payer deposits token
 *   - payer sets limit for payees (max amount, max process time)
 *   - payer can bundle multiple deposits (plain or via ERC20Permit) and authorizations
 *     in a single transaction using bundle()
 *
 *
 * The payee flow looks like:
 *   - payer asks for service (like compute) offchain
 *   - payee computes the maximum amount and locks that amount in the escrow contract
 *   - payee performs the service
 *   - payee takes the actual amount from the lock and releases back the remaining
 *   - while a lock is still active, the payee can reLock() it to change the amount and/or
 *     expiry (up or down). Every createLock check is re-evaluated against the new values, and
 *     the total lock lifetime (measured from the original creation) cannot exceed the
 *     authorization's maxLockSeconds.
 */
contract Escrow is
    ReentrancyGuard
{
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    
    // OPC fee router
    address immutable public factoryRouter; 
    address immutable public opcCollector;

    /*  User funds are stored per user and per token */
    struct userFunds{
        uint256 available;
        uint256 locked;
    }

    mapping(address => mapping(address => userFunds)) private funds; // user -> token -> userFunds
    // Mapping from user to an array of token addresses they have funds in
    mapping(address => address[]) private userTokens;

    // A helper mapping to avoid duplicates: user => token => hasTokenFunds
    mapping(address => mapping(address => bool)) private hasFundsInToken;

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
        uint256 amount;
        uint256 expiry;     // absolute timestamp: block.timestamp + duration
        address token;
        uint256 startTime;  // block.timestamp at original createLock; preserved across reLock
    }

    mapping(address => lock[]) private locks; // locks by payee

    /* structs used to bundle multiple payer actions in a single call */
    struct DepositData { address token; uint256 amount; }
    struct PermitData { address token; uint256 amount; uint256 deadline; uint8 v; bytes32 r; bytes32 s; }
    struct AuthData { address token; address payee; uint256 maxLockedAmount; uint256 maxLockSeconds; uint256 maxLockCounts; }

    /* structs used to bundle multiple payee (job) actions in a single call */
    struct LockData { uint256 jobId; address token; address payer; uint256 amount; uint256 expiry; } // createLock & reLock
    struct ClaimData { uint256 jobId; address token; address payer; uint256 amount; bytes proof; uint256 jobType; address[] subsidyProviders; }
    struct CancelData { uint256 jobId; address token; address payer; address payee; }


    // events
    event Deposit(address indexed payer,address token,uint256 amount);
    event Withdraw(address indexed payer,address token,uint256 amount);
    event Auth(address indexed payer,address indexed payee,address token,uint256 maxLockedAmount,
        uint256 maxLockSeconds,uint256 maxLockCounts);
    event Lock(address payer,address payee,uint256 jobId,uint256 amount,uint256 expiry,address token);
    event ReLock(address payer,address payee,uint256 jobId,uint256 oldAmount,uint256 newAmount,
        uint256 newExpiry,address token);
    event Claimed(address indexed payee,uint256 jobId,address token,address indexed payer,uint256 amount,bytes proof);
    event Canceled(address indexed payee,uint256 jobId,address token,address indexed payer,uint256 amount);
    // emitted once per contributing subsidy provider (with the actually-used subsidy and bonus)
    event Subsidized(address indexed payee,address indexed payer,uint256 jobId,address token,address provider,uint256 subsidyAmount,uint256 bonusAmount);

    // Add constructor to set router
    constructor(address _factoryRouter,address _opcCollector) {
        require(_factoryRouter != address(0), "Invalid router");
        factoryRouter = _factoryRouter;
        opcCollector = _opcCollector;
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
    function depositMultiple(address[] calldata token,uint256[] calldata amount) external nonReentrant{
        require(token.length==amount.length,"Invalid input");
        for(uint256 i=0;i<token.length;i++){
            _deposit(token[i],amount[i]);
        }
    }

    /**
     * @dev depositWithPermit
     *      Called by payer to deposit funds in the contract using ERC20Permit
     *      This function allows users to deposit without a separate approval transaction
     *      
     * @param token token to deposit
     * @param amount amount in wei to deposit
     * @param deadline The time at which the permit expires (unix timestamp)
     * @param v The recovery byte of the signature
     * @param r Half of the ECDSA signature pair
     * @param s Half of the ECDSA signature pair
     */
    function depositWithPermit(
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        _depositWithPermit(token, amount, deadline, v, r, s);
    }
    function _depositWithPermit(
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        // Use permit to approve this contract to spend user's tokens
        IERC20Permit(token).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );
        // Deposit the tokens
        _deposit(token, amount);
    }

    /**
     * @dev bundle
     *      Called by payer to bundle multiple deposits, permit-based deposits and authorizations
     *      in a single transaction (e.g. onboarding). All operations execute as msg.sender; any
     *      sub-array may be empty.
     *
     * @param deposits array of {token, amount} for plain deposits (require prior approval)
     * @param permits array of {token, amount, deadline, v, r, s} for ERC20Permit-based deposits
     * @param auths array of {token, payee, maxLockedAmount, maxLockSeconds, maxLockCounts}
     */
    // Reentrancy-safe: nonReentrant blocks re-entry into every state-changing entrypoint; only view
    // getters (the caller's own balances, not an oracle) are reachable during a token transfer/permit.
    // slither-disable-next-line reentrancy-eth,reentrancy-benign
    function bundle(
        DepositData[] calldata deposits,
        PermitData[] calldata permits,
        AuthData[] calldata auths
    ) external nonReentrant {
        for(uint256 i=0;i<deposits.length;i++){
            _deposit(deposits[i].token,deposits[i].amount);
        }
        for(uint256 i=0;i<permits.length;i++){
            _depositWithPermit(permits[i].token,permits[i].amount,permits[i].deadline,permits[i].v,permits[i].r,permits[i].s);
        }
        for(uint256 i=0;i<auths.length;i++){
            _authorize(auths[i].token,auths[i].payee,auths[i].maxLockedAmount,auths[i].maxLockSeconds,auths[i].maxLockCounts);
        }
    }

    /**
     * @dev bundleJobs
     *      Called by a payee (e.g. a node servicing many jobs) to batch payee-side lock operations
     *      in a single transaction. Operations run as msg.sender in a fixed order:
     *      claims -> cancels -> creates -> reLocks, so lock slots / locked amounts freed by claims and
     *      cancels are available before new locks are created. Any sub-array may be empty.
     *
     * @param claims array of {jobId, token, payer, amount, proof} passed to claimLock
     * @param cancels array of {jobId, token, payer, payee} passed to cancelExpiredLock
     * @param newLocks array of {jobId, token, payer, amount, expiry} passed to createLock
     * @param reLockOps array of {jobId, token, payer, amount, expiry} passed to reLock
     */
    // Reentrancy-safe: nonReentrant blocks re-entry into every state-changing entrypoint, including
    // the subsidy-provider callback and token pull inside each claim; only view getters are reachable.
    // slither-disable-next-line reentrancy-eth,reentrancy-benign,reentrancy-events
    function bundleJobs(
        ClaimData[] calldata claims,
        CancelData[] calldata cancels,
        LockData[] calldata newLocks,
        LockData[] calldata reLockOps
    ) external nonReentrant {
        for(uint256 i=0;i<claims.length;i++){
            _claimLock(claims[i].jobId,claims[i].token,claims[i].payer,claims[i].amount,claims[i].proof,claims[i].jobType,claims[i].subsidyProviders);
        }
        for(uint256 i=0;i<cancels.length;i++){
            _cancelExpiredLock(cancels[i].jobId,cancels[i].token,cancels[i].payer,cancels[i].payee);
        }
        for(uint256 i=0;i<newLocks.length;i++){
            _createLock(newLocks[i].jobId,newLocks[i].token,newLocks[i].payer,newLocks[i].amount,newLocks[i].expiry);
        }
        for(uint256 i=0;i<reLockOps.length;i++){
            _reLock(reLockOps[i].jobId,reLockOps[i].token,reLockOps[i].payer,reLockOps[i].amount,reLockOps[i].expiry);
        }
    }

    function _deposit(address token,uint256 amount) internal{
        require(token!=address(0),"Invalid token address");
        funds[msg.sender][token].available+=amount;
        if (!hasFundsInToken[msg.sender][token]) {
            userTokens[msg.sender].push(token);
            hasFundsInToken[msg.sender][token] = true;
        }
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
    function withdraw(address[] calldata token,uint256[] calldata amount) external nonReentrant{
        require(token.length==amount.length,"Invalid input");
        for(uint256 i=0;i<token.length;i++){
            _withdraw(token[i],amount[i]);
        }
    }
    function _withdraw(address token,uint256 amount) internal{
        if(funds[msg.sender][token].available>=amount){
            funds[msg.sender][token].available-=amount;
            if(funds[msg.sender][token].available==0){
                address[] storage tokens = userTokens[msg.sender];
                for (uint256 i = 0; i < tokens.length; i++) {
                    if (tokens[i] == token) {
                        tokens[i] = tokens[tokens.length - 1]; // overwrite with last element
                        tokens.pop(); // remove last element
                        break;
                    }
                }
                // Update interaction status
                hasFundsInToken[msg.sender][token] = false;
            }
            emit Withdraw(msg.sender,token,amount);
            IERC20(token).safeTransfer(
                msg.sender,
                amount
            );

        }
    }
    function getUserTokens(address user) external view returns (address[] memory) {
        return userTokens[user];
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
    function authorizeMultiple(address[] calldata token,address[] calldata payee,uint256[] calldata maxLockedAmount,
        uint256[] calldata maxLockSeconds,uint256[] calldata maxLockCounts) external nonReentrant{
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
        emit Auth(msg.sender,payee,token,maxLockedAmount,maxLockSeconds,maxLockCounts);

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
     * @param payee payee to filter (required)
     */
    function getLocks(address token,address payer,address payee) public view returns (lock[] memory){
        require(payee!=address(0),'Invalid payee');
        // since solidty does not supports dynamic memory arrays, we need to calculate the return size first
        uint256 size=0;
        uint256 length=locks[payee].length;
        for(uint256 i=0;i<length;i++){
            if( 
                (address(token)==address(0) || address(token)==locks[payee][i].token) || 
                (address(payer)==address(0) || address(payer)==locks[payee][i].payer)
            ){
                size++;
            }
        }
        
        lock[] memory tempPendings=new lock[](size);
        size=0;
        for(uint256 i=0;i<length;i++){
            if(
                (address(token)==address(0) || address(token)==locks[payee][i].token) ||
                (address(payer)==address(0) || address(payer)==locks[payee][i].payer)
            ){
                tempPendings[size]=locks[payee][i];
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
    function createLocks(uint256[] calldata jobId,address[] calldata token,
        address[] calldata payer,uint256[] calldata amount,uint256[] calldata expiry) external nonReentrant{
        
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
        require(payer!=msg.sender,'Payer cannot be payee');
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
        require(tempAuth.currentLockedAmount+amount<=tempAuth.maxLockedAmount,"Exceeds maxLockedAmount");
        require(tempAuth.currentLocks<tempAuth.maxLockCounts,"Exceeds maxLockCounts");
        // check jobId
        length=locks[msg.sender].length;
        for(uint256 i=0;i<length;i++){
            if(locks[msg.sender][i].payer==payer && locks[msg.sender][i].jobId==jobId){
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
        locks[msg.sender].push(lock(jobId,payer,amount,block.timestamp+expiry,token,block.timestamp));
        emit Lock(payer,msg.sender,jobId,amount,expiry,token);
    }

    /**
     * @dev reLock
     *      Called by payee to change the amount and/or expiry of an existing, still active lock.
     *      Both amount and expiry can go up or down. All createLock checks are re-evaluated against
     *      the new values, and the total lock lifetime (measured from the original creation) cannot
     *      exceed the authorization's maxLockSeconds. jobId and the original startTime are preserved.
     *
     * @param jobId jobId, required (identifies the lock together with token and payer)
     * @param token token, required
     * @param payer payer address
     * @param amount new amount in wei to lock
     * @param expiry new expiry, relative seconds from now
     */
    function reLock(uint256 jobId,address token,address payer,uint256 amount,uint256 expiry) external nonReentrant{
        _reLock(jobId,token,payer,amount,expiry);
    }
    /**
     * @dev reLocks
     *      Called by payee to reLock multiple existing locks
     *
     * @param jobId array of jobIds
     * @param token array of tokens
     * @param payer array of payer addresses
     * @param amount array of new amounts in wei to lock
     * @param expiry array of new expiries, relative seconds from now
     */
    function reLocks(uint256[] calldata jobId,address[] calldata token,
        address[] calldata payer,uint256[] calldata amount,uint256[] calldata expiry) external nonReentrant{

        require(jobId.length==token.length &&
            jobId.length==payer.length &&
            jobId.length==amount.length &&
            jobId.length==expiry.length,"Invalid input");
        for(uint256 i=0;i<jobId.length;i++){
            _reLock(jobId[i],token[i],payer[i],amount[i],expiry[i]);
        }
    }
    function _reLock(uint256 jobId,address token,address payer,uint256 amount,uint256 expiry) internal {
        require(payer!=address(0),'Invalid payer');
        require(payer!=msg.sender,'Payer cannot be payee');
        require(token!=address(0),'Invalid token');
        require(amount>0,"Invalid amount");
        require(jobId>0,"Invalid jobId");
        // find the existing lock
        lock memory tempLock=lock(0,address(0),0,0,address(0),0);
        uint256 lockIndex;
        uint256 length=locks[msg.sender].length;
        for(lockIndex=0;lockIndex<length;lockIndex++){
            if(
                payer==locks[msg.sender][lockIndex].payer &&
                jobId==locks[msg.sender][lockIndex].jobId &&
                token==locks[msg.sender][lockIndex].token
            ){
                tempLock=locks[msg.sender][lockIndex];
                break;
            }
        }
        require(tempLock.payer==payer,"Lock not found");
        require(tempLock.expiry>=block.timestamp,"Lock expired");
        // find the auth
        auth memory tempAuth=auth(address(0),0,0,0,0,0);
        uint256 index;
        length=userAuths[payer][token].length;
        for(index=0;index<length;index++){
            if(msg.sender==userAuths[payer][token][index].payee) {
                tempAuth=userAuths[payer][token][index];
                break;
            }
        }
        require(tempAuth.payee==msg.sender,"No auth found");
        // re-run createLock checks against the new values, accounting for the old lock being removed
        require(funds[payer][token].available+tempLock.amount>=amount,"Payer does not have enough funds");
        require(block.timestamp+expiry<=tempLock.startTime+tempAuth.maxLockSeconds,"Expiry too high");
        require(tempAuth.currentLockedAmount-tempLock.amount+amount<=tempAuth.maxLockedAmount,"Exceeds maxLockedAmount");
        // update auths (currentLocks unchanged - same slot)
        userAuths[payer][token][index].currentLockedAmount=tempAuth.currentLockedAmount-tempLock.amount+amount;
        // update user funds
        funds[payer][token].available=funds[payer][token].available+tempLock.amount-amount;
        funds[payer][token].locked=funds[payer][token].locked-tempLock.amount+amount;
        // update the lock in place (jobId and startTime preserved)
        locks[msg.sender][lockIndex].amount=amount;
        locks[msg.sender][lockIndex].expiry=block.timestamp+expiry;
        emit ReLock(payer,msg.sender,jobId,tempLock.amount,amount,expiry,token);
    }

     /**
     * @dev claimLock
     *      Called by payee to claim a lock (fully or partial)
     *      Must match a previous lock. The node may supply a jobType and a list of subsidy providers
     *      that may sponsor part of the payer's cost and/or add a bonus for the node (empty list =
     *      no subsidy).
     *
     * @param jobId jobId, required
     * @param token token, required
     * @param payer payer address
     * @param amount amount in wei to claim
     * @param proof job proof
     * @param jobType opaque category forwarded to the providers
     * @param subsidyProviders list of ISubsidyProvider addresses to consult
     */
    // Reentrancy-safe: nonReentrant blocks re-entry, including the subsidy-provider callback and the
    // token pull; only view getters are reachable during the external calls.
    // slither-disable-next-line reentrancy-eth,reentrancy-benign,reentrancy-events
    function claimLock(uint256 jobId,address token,address payer,uint256 amount,
        bytes calldata proof,uint256 jobType,address[] calldata subsidyProviders)
        external nonReentrant{
            _claimLock(jobId,token,payer,amount,proof,jobType,subsidyProviders);
    }

    /**
     * @dev claimLocks
     *      Called by payee to claim locks (fully or partial) and keeps funds in the contract
     *      Must match previous locks. Parallel jobType and subsidyProviders arrays carry the
     *      per-claim subsidy parameters (empty inner list = no subsidy).
     *
     * @param jobId array of jobIds
     * @param token array of tokens
     * @param payer array of payer addresses
     * @param amount array amounts in wei to claim
     * @param proof array of job proofs
     * @param jobType array of jobTypes
     * @param subsidyProviders array of subsidy-provider lists (one per claim)
     */
    // Reentrancy-safe: nonReentrant blocks re-entry, including the subsidy-provider callbacks and the
    // token pulls; only view getters are reachable during the external calls.
    // slither-disable-next-line reentrancy-eth,reentrancy-benign,reentrancy-events
    function claimLocks(uint256[] calldata jobId,address[] calldata token,
        address[] calldata payer,uint256[] calldata amount,bytes[] calldata proof,
        uint256[] calldata jobType,address[][] calldata subsidyProviders) external nonReentrant{

            require(jobId.length==token.length &&
                    jobId.length==payer.length &&
                    jobId.length==amount.length &&
                    jobId.length==proof.length &&
                    jobId.length==jobType.length &&
                    jobId.length==subsidyProviders.length,"Invalid input");
            _claimLocksMem(jobId,token,payer,amount,proof,jobType,subsidyProviders);
    }
    // loops _claimLock over parallel arrays; params are memory (single stack slots) so the 7-way loop
    // does not blow the stack. calldata arrays are copied to memory implicitly at the call site.
    function _claimLocksMem(uint256[] memory jobId,address[] memory token,address[] memory payer,
        uint256[] memory amount,bytes[] memory proof,uint256[] memory jobType,
        address[][] memory subsidyProviders) internal {
        for(uint256 i=0;i<jobId.length;i++){
            _claimLock(jobId[i],token[i],payer[i],amount[i],proof[i],jobType[i],subsidyProviders[i]);
        }
    }
    /**
     * @dev claimLockAndWithdraw
     *      Called by payee to claim lock (fully or partial) and withdraw funds
     *      Must match previous lock. Supports the same subsidy parameters as claimLock.
     *
     * @param jobId jobId, required
     * @param token token, required
     * @param payer payer address
     * @param amount amount in wei to claim
     * @param proof job proof
     * @param jobType opaque category forwarded to the providers
     * @param subsidyProviders list of ISubsidyProvider addresses to consult
     */
    // Reentrancy-safe: nonReentrant blocks re-entry, including the subsidy-provider callback and the
    // token pull; only view getters are reachable during the external calls.
    // slither-disable-next-line reentrancy-eth,reentrancy-benign,reentrancy-events
    function claimLockAndWithdraw(uint256 jobId,address token,address payer,
        uint256 amount,bytes calldata proof,uint256 jobType,address[] calldata subsidyProviders)
        external nonReentrant{
            _claimLock(jobId,token,payer,amount,proof,jobType,subsidyProviders);
            _withdraw(token,funds[msg.sender][token].available);
    }
    /**
     * @dev claimLocksAndWithdraw
     *      Called by payee to claim locks (fully or partial) and withdraw funds
     *      Must match previous locks. Parallel jobType and subsidyProviders arrays carry the
     *      per-claim subsidy parameters.
     *
     * @param jobId array of jobIds
     * @param token array of tokens
     * @param payer array of payer addresses
     * @param amount array amounts in wei to claim
     * @param proof array of job proofs
     * @param jobType array of jobTypes
     * @param subsidyProviders array of subsidy-provider lists (one per claim)
     */
    // Reentrancy-safe: nonReentrant blocks re-entry, including the subsidy-provider callbacks and the
    // token pulls; only view getters are reachable during the external calls.
    // slither-disable-next-line reentrancy-eth,reentrancy-benign,reentrancy-events
    function claimLocksAndWithdraw(uint256[] calldata jobId,address[] calldata token,
        address[] calldata payer,uint256[] calldata amount,bytes[] calldata proof,
        uint256[] calldata jobType,address[][] calldata subsidyProviders) external nonReentrant{

        require(jobId.length==token.length &&
            jobId.length==payer.length &&
            jobId.length==amount.length &&
            jobId.length==proof.length &&
            jobId.length==jobType.length &&
            jobId.length==subsidyProviders.length,"Invalid input");
        _claimLocksMem(jobId,token,payer,amount,proof,jobType,subsidyProviders);
        _withdrawAvailable(token);
    }

    // withdraw all of msg.sender's available balance for each listed token (used by *AndWithdraw)
    function _withdrawAvailable(address[] calldata token) internal {
        for(uint256 i=0;i<token.length;i++){
            if(funds[msg.sender][token[i]].available>0){
                _withdraw(token[i],funds[msg.sender][token[i]].available);
            }
        }
    }

    // Reentrancy-safe: reached only via nonReentrant entrypoints, so re-entry is impossible. Makes
    // external calls (subsidy-provider callbacks, the guarded subsidy pull and the fee transfer); the
    // funds/userTokens writes cannot be exploited because re-entry is blocked by the outer guard.
    // slither-disable-next-line reentrancy-no-eth,reentrancy-benign,reentrancy-events
    function _claimLock(uint256 jobId,address token,address payer,uint256 amount,
        bytes memory proof,uint256 jobType,address[] memory subsidyProviders) internal {
        require(payer!=address(0),'Invalid payer');
        require(token!=address(0),'Invalid token');
        require(jobId>0,'Invalid jobId');
        lock memory tempLock=lock(0,address(0),0,0,address(0),0);
        uint256 index;
        uint256 length=locks[msg.sender].length;
        for(index=0;index<length;index++){
            if(
                payer==locks[msg.sender][index].payer &&
                jobId==locks[msg.sender][index].jobId &&
                token==locks[msg.sender][index].token

            ) {
                tempLock=locks[msg.sender][index];
                break;
            }
        }
        require(tempLock.payer==payer,"Lock not found");
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
        //update user funds: return the unclaimed remainder to the payer and unlock the whole lock
        funds[payer][token].available+=tempLock.amount-amount;
        funds[payer][token].locked-=tempLock.amount;
        _trackToken(payer,token);
        //pull subsidy (released to payer) and bonus (added to node payout) from the providers
        (uint256 subsidy,uint256 bonus)=_applySubsidies(jobId,payer,token,jobType,amount,subsidyProviders);
        //release the subsidy back to the payer (bonus is NOT released to the payer)
        if(subsidy>0){
            funds[payer][token].available+=subsidy;
            _trackToken(payer,token);
        }
        // credit the node payout (fee charged on amount+bonus) and transfer the fee out last
        _creditPayout(token,amount+bonus);
        //delete the lock
        if(index<locks[msg.sender].length-1){
            locks[msg.sender][index]=locks[msg.sender][locks[msg.sender].length-1];
        }
        locks[msg.sender].pop();
        emit Claimed(msg.sender,jobId,token,payer,amount,proof);
    }

    // credit the node (msg.sender) payout for `payoutBase` (= amount + bonus), then transfer the OPC
    // fee out last. fee is charged on payoutBase via the OPC router rate (proportional, <=1e18).
    // slither-disable-next-line reentrancy-eth,reentrancy-benign,reentrancy-events
    function _creditPayout(address token,uint256 payoutBase) internal {
        uint256 opcFee = IFactoryRouter(factoryRouter).getOPCFee(token);
        uint256 feeAmount = payoutBase.mul(opcFee).div(1e18);
        uint256 payout = payoutBase.sub(feeAmount);
        funds[msg.sender][token].available+=payout;
        _trackToken(msg.sender,token);
        if(feeAmount > 0){
            if(opcCollector==address(0)){
                IERC20(token).safeTransfer(IFactoryRouter(factoryRouter).getOPCCollector(), feeAmount);
            }
            else{
                IERC20(token).safeTransfer(opcCollector, feeAmount);
            }
        }
    }

    // helper: make sure `token` is tracked in `user`'s userTokens list (for getUserTokens-based UIs)
    function _trackToken(address user,address token) internal {
        if (!hasFundsInToken[user][token]) {
            userTokens[user].push(token);
            hasFundsInToken[user][token] = true;
        }
    }

    /**
     * @dev _applySubsidies
     *      Consults each provider in `subsidyProviders` (once per list entry) for a subsidy (released
     *      to the payer, capped at the remaining un-subsidized portion of the claim) and a bonus
     *      (added to the node payout, uncapped). Every provider is pulled from with a guarded
     *      low-level transferFrom whose balanceOf-diff is the sole source of truth. One bad provider
     *      or token must never brick the claim, so:
     *        - the quote is wrapped in a swallowing try/catch (revert -> contribute 0),
     *        - reverts inside the try success block are NOT caught by Solidity, so the combine is
     *          overflow-guarded (no checked add) and the pull is a low-level call (no bool decode
     *          that would revert on USDT-style no-data or on 1-31 junk bytes),
     *        - a provider is credited only if the escrow received the full requested amount
     *          (reject-partial), so fee-on-transfer under-delivery contributes 0.
     * @return totalSubsidy sum of the accepted subsidies (released to the payer)
     * @return totalBonus   sum of the accepted bonuses (added to the node payout)
     */
    // Reentrancy-safe: only reachable from _claimLock, itself only reachable via nonReentrant
    // entrypoints, so the provider callback cannot re-enter any escrow entrypoint.
    // slither-disable-next-line reentrancy-eth,reentrancy-benign,reentrancy-events,calls-loop
    function _applySubsidies(uint256 jobId,address payer,address token,uint256 jobType,uint256 amount,
        address[] memory subsidyProviders) internal returns (uint256 totalSubsidy,uint256 totalBonus){
        uint256 remaining = amount; // subsidy cap only; bonus is uncapped
        for(uint256 i=0;i<subsidyProviders.length;i++){
            address provider = subsidyProviders[i];
            // never pull from the payer's own wallet (MED mitigation); do NOT break on remaining==0,
            // a later provider can still add a bonus.
            if(provider==payer) continue;
            (uint256 usedSub,uint256 usedBonus)=_consultProvider(jobId,payer,token,jobType,amount,provider,remaining);
            totalSubsidy += usedSub;
            totalBonus += usedBonus;
            remaining -= usedSub; // usedSub <= remaining, cannot underflow
        }
    }

    // Consults one provider: asks for a quote (swallowing try/catch - a revert contributes 0 and
    // never bricks the claim; EOAs/wrong-selector addresses revert decoding the return from empty
    // returndata -> caught -> skipped, a relied-on defense), caps the subsidy at `remaining`, and
    // pulls subsidy+bonus with a guarded low-level call. Returns the actually-accepted amounts.
    // Everything after the try-returns is revert-proof (overflow-guarded combine, low-level pull with
    // no bool decode), because Solidity does NOT catch reverts inside the try success block.
    // slither-disable-next-line reentrancy-eth,reentrancy-benign,reentrancy-events,calls-loop
    function _consultProvider(uint256 jobId,address payer,address token,uint256 jobType,uint256 amount,
        address provider,uint256 remaining) internal returns (uint256 usedSub,uint256 usedBonus){
        // EOA / non-contract provider: skip. Solidity 0.8.12 does NOT route the empty-code
        // return-data decode revert (from a call with a returns clause to a codeless address) into
        // the catch below, so try/catch alone would let an EOA brick the claim. Guard explicitly.
        if(provider.code.length==0) return (0,0);
        try ISubsidyProvider(provider).onSubsidyClaim(msg.sender,payer,jobType,token,amount,remaining)
            returns (uint256 subsidyAmount,uint256 bonusAmount)
        {
            uint256 wantSubsidy = subsidyAmount < remaining ? subsidyAmount : remaining; // cap
            // OVERFLOW-SAFE COMBINE: a checked add would revert INSIDE this uncaught success block on
            // a bogus quote (e.g. bonus ~2^256-1); pre-check and skip instead.
            if(bonusAmount > type(uint256).max - wantSubsidy) return (0,0);
            uint256 wantTotal = wantSubsidy + bonusAmount; // bonus is uncapped
            if(wantTotal==0) return (0,0);
            // guarded pull; reject-partial (received < wantTotal -> skip via _pullExact).
            if(!_pullExact(token,provider,wantTotal)) return (0,0);
            emit Subsidized(msg.sender,payer,jobId,token,provider,wantSubsidy,bonusAmount);
            return (wantSubsidy,bonusAmount);
        } catch {
            return (0,0);
        }
    }

    // guarded token pull: low-level transferFrom(provider -> escrow) whose balanceOf-diff is the sole
    // source of truth. Returns true only if the escrow received the FULL wantTotal (reject-partial).
    // Never reverts on a lying/short-returning token (low-level call, no bool decode).
    // slither-disable-next-line reentrancy-benign,reentrancy-events
    function _pullExact(address token,address provider,uint256 wantTotal) internal returns (bool){
        uint256 balBefore = IERC20(token).balanceOf(address(this));
        (bool ok,)=token.call(abi.encodeWithSelector(IERC20.transferFrom.selector,provider,address(this),wantTotal));
        if(!ok) return false;
        uint256 balAfter = IERC20(token).balanceOf(address(this));
        uint256 received = balAfter>=balBefore ? balAfter-balBefore : 0; // underflow-guarded
        return received>=wantTotal;
    }

    /**
     * @dev cancelExpiredLock
     *      Can be called by anyone to release an expired lock
     *      
     * @param jobId jobId, if 0 matches any jobId
     * @param token token (zero address means any)
     * @param payer payer address (zero address means any)
     * @param payee payee address (required)
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
     * @param payee payee address (required)
     */
    function cancelExpiredLocks(uint256[] calldata jobId,address[] calldata token,address[] calldata payer,
        address[] calldata payee) external nonReentrant{
            require(jobId.length==token.length && 
            jobId.length==payer.length && 
            jobId.length==payee.length,"Invalid input");
            for(uint256 i=0;i<jobId.length;i++){
                _cancelExpiredLock(jobId[i],token[i],payer[i],payee[i]);
            }
    }
    
    function _cancelExpiredLock(uint256 jobId,address token,address payer,address payee) internal{
        require(payee!=address(0),'Invalid payee');
        uint256 index;
        //since solidy does not supports dynamic arrays, we need to count first
        uint256 found=0;
        uint256 length=locks[payee].length;
        for(index=0;index<length;index++){
            if(locks[payee][index].expiry<block.timestamp &&
                (
                    (jobId==0 || jobId==locks[payee][index].jobId) &&
                    (token==address(0) || token==locks[payee][index].token) &&
                    (payer==address(0) || payer==locks[payee][index].payer)
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
            if(locks[payee][index].expiry<block.timestamp &&
                (
                    (jobId==0 || jobId==locks[payee][index].jobId) &&
                    (token==address(0) || token==locks[payee][index].token) &&
                    (payer==address(0) || payer==locks[payee][index].payer)
                )
            ){
                //cancel each lock, one by one
                //update auths
                uint256 authsLength=userAuths[locks[payee][index].payer][locks[payee][index].token].length;
                for(uint256 i=0;i<authsLength;i++){
                        if(userAuths[locks[payee][index].payer][locks[payee][index].token][i].payee==payee){
                            userAuths[locks[payee][index].payer][locks[payee][index].token][i].currentLockedAmount-=locks[payee][index].amount;
                            userAuths[locks[payee][index].payer][locks[payee][index].token][i].currentLocks-=1;
                        }
                }
                //update user funds
                funds[locks[payee][index].payer][locks[payee][index].token].available+=locks[payee][index].amount;
                funds[locks[payee][index].payer][locks[payee][index].token].locked-=locks[payee][index].amount;
                emit Canceled(payee,locks[payee][index].jobId,locks[payee][index].token,
                    locks[payee][index].payer,locks[payee][index].amount);
                indexToDelete[currentIndex]=index;
                currentIndex++;
            }
        }
        //delete the locks
        uint256 delLength=indexToDelete.length;
        // Sort indexToDelete in descending order
        for (uint256 i = 0; i < delLength - 1; i++) {
            for (uint256 j = i + 1; j < delLength; j++) {
                if (indexToDelete[i] < indexToDelete[j]) {
                    uint256 temp = indexToDelete[i];
                    indexToDelete[i] = indexToDelete[j];
                    indexToDelete[j] = temp;
                }
            }
        }
        // Delete the locks safely
        for (index = 0; index < delLength; index++) {
            uint256 delIndex = indexToDelete[index];
            if (delIndex < locks[payee].length - 1) {
                locks[payee][delIndex] = locks[payee][locks[payee].length - 1];
            }
            locks[payee].pop();
        }
    }
}