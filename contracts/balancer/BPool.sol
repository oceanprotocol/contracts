pragma solidity ^0.5.7;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "./BToken.sol";
import "./BNum.sol";
import "./../interfaces/ssCompatible.sol";

/**
 * @title BPool
 *
 * @dev Used by the (Ocean version) BFactory contract as a bytecode reference to
 *      deploy new BPools.
 *
 * This contract is is nearly identical to the BPool.sol contract at [1]
 *  The only difference is the "Proxy contract functionality" section
 *  given below. We'd inherit from BPool if we could, for simplicity.
 *  But we can't, because the proxy section needs to access private
 *  variables declared in BPool, and Solidity disallows this. Therefore
 *  the best we can do for now is clearly demarcate the proxy section.
 *
 *  [1] https://github.com/balancer-labs/balancer-core/contracts/.
 */
contract BPool is BNum, BToken {
    struct Record {
        bool bound; // is token bound to pool
        uint256 index; // private
        uint256 denorm; // denormalized weight
        uint256 balance;
    }

    event LOG_SWAP(
        address indexed caller,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 tokenAmountIn,
        uint256 tokenAmountOut,
        uint256 timestamp
    );

    event LOG_JOIN(
        address indexed caller,
        address indexed tokenIn,
        uint256 tokenAmountIn,
        uint256 timestamp
    );

    event LOG_EXIT(
        address indexed caller,
        address indexed tokenOut,
        uint256 tokenAmountOut,
        uint256 timestamp
    );

    event LOG_CALL(
        bytes4 indexed sig,
        address indexed caller,
        uint256 timestamp,
        bytes data
    );

    modifier _logs_() {
        emit LOG_CALL(msg.sig, msg.sender, block.timestamp, msg.data);
        _;
    }

    modifier _lock_() {
        require(!_mutex, "ERR_REENTRY");
        _mutex = true;
        _;
        _mutex = false;
    }

    modifier _viewlock_() {
        require(!_mutex, "ERR_REENTRY");
        _;
    }

    bool private _mutex;

    address private _factory; // BFactory address to push token exitFee to
    address private _controller; // has CONTROL role
    bool private _publicSwap; // true if PUBLIC can call SWAP functions
    address private _datatokenAddress; //datatoken address
    address private _basetokenAddress; //base token address
    uint256 private _burnInEndBlock; //burn-in period end block. While burnInEndBlock<block.number call 1ss for buy/sell and reject add/rem liquidiy
    // `setSwapFee` and `finalize` require CONTROL
    // `finalize` sets `PUBLIC can SWAP`, `PUBLIC can JOIN`
    uint256 private _swapFee;
    bool private _finalized;

    address[] private _tokens;
    mapping(address => Record) private _records;
    uint256 private _totalWeight;
    ssCompatible ssContract;

    //-----------------------------------------------------------------------
    //Proxy contract functionality: begin
    bool private initialized = false;
    modifier onlyNotInitialized() {
        require(!initialized, "ERR_ALREADY_INITIALIZED");
        _;
    }

    function isInitialized() external view returns (bool) {
        return initialized;
    }

    // Called prior to contract deployment
    constructor() public {
        _initialize(
            msg.sender,
            msg.sender,
            MIN_FEE,
            false,
            false,
            msg.sender,
            msg.sender,
            0
        );
    }

    // Called prior to contract initialization (e.g creating new BPool instance)
    // Calls private _initialize function. Only if contract is not initialized.
    function initialize(
        address controller,
        address factory,
        uint256 swapFee,
        bool publicSwap,
        bool finalized,
        address datatokenAddress,
        address basetokenAddress,
        uint256 burnInEndBlock
    ) external onlyNotInitialized returns (bool) {
        require(controller != address(0), "ERR_INVALID_CONTROLLER_ADDRESS");
        require(factory != address(0), "ERR_INVALID_FACTORY_ADDRESS");
        require(swapFee >= MIN_FEE, "ERR_MIN_FEE");
        require(swapFee <= MAX_FEE, "ERR_MAX_FEE");
        return
            _initialize(
                controller,
                factory,
                swapFee,
                publicSwap,
                finalized,
                datatokenAddress,
                basetokenAddress,
                burnInEndBlock
            );
    }

    // Private function called on contract initialization.
    function _initialize(
        address controller,
        address factory,
        uint256 swapFee,
        bool publicSwap,
        bool finalized,
        address datatokenAddress,
        address basetokenAddress,
        uint256 burnInEndBlock
    ) private returns (bool) {
        _controller = controller;
        _factory = factory;
        _swapFee = swapFee;
        _publicSwap = publicSwap;
        _finalized = finalized;
        _datatokenAddress = datatokenAddress;
        _basetokenAddress = basetokenAddress;
        initialized = true;
        _burnInEndBlock = burnInEndBlock;
        ssContract = ssCompatible(_controller);
        return initialized;
    }

    //can be called only by the controller
    function setup(
        address dataTokenAaddress,
        uint256 dataTokenAmount,
        uint256 dataTokenWeight,
        address baseTokenAddress,
        uint256 baseTokenAmount,
        uint256 baseTokenWeight
    ) external _logs_ {
        require(msg.sender == _controller, "ERR_INVALID_CONTROLLER");
        require(
            dataTokenAaddress == _datatokenAddress,
            "ERR_INVALID_DATATOKEN_ADDRESS"
        );
        require(
            baseTokenAddress == _basetokenAddress,
            "ERR_INVALID_BASETOKEN_ADDRESS"
        );
        // other inputs will be validated prior
        // calling the below functions
        // bind data token
        bind(dataTokenAaddress, dataTokenAmount, dataTokenWeight);
        emit LOG_JOIN(
            msg.sender,
            dataTokenAaddress,
            dataTokenAmount,
            block.timestamp
        );
        // bind base token
        bind(baseTokenAddress, baseTokenAmount, baseTokenWeight);
        emit LOG_JOIN(
            msg.sender,
            baseTokenAddress,
            baseTokenAmount,
            block.timestamp
        );
        // finalize
        finalize();
    }

    //Proxy contract functionality: end
    //-----------------------------------------------------------------------

    function isPublicSwap() external view returns (bool) {
        return _publicSwap;
    }

    function isFinalized() external view returns (bool) {
        return _finalized;
    }

    function isBound(address t) external view returns (bool) {
        return _records[t].bound;
    }

    function getNumTokens() external view returns (uint256) {
        return _tokens.length;
    }

    function getCurrentTokens()
        external
        view
        _viewlock_
        returns (address[] memory tokens)
    {
        return _tokens;
    }

    function getFinalTokens()
        external
        view
        _viewlock_
        returns (address[] memory tokens)
    {
        require(_finalized, "ERR_NOT_FINALIZED");
        return _tokens;
    }

    function getDenormalizedWeight(address token)
        external
        view
        _viewlock_
        returns (uint256)
    {
        require(_records[token].bound, "ERR_NOT_BOUND");
        return _records[token].denorm;
    }

    function getTotalDenormalizedWeight()
        external
        view
        _viewlock_
        returns (uint256)
    {
        return _totalWeight;
    }

    function getNormalizedWeight(address token)
        external
        view
        _viewlock_
        returns (uint256)
    {
        require(_records[token].bound, "ERR_NOT_BOUND");
        uint256 denorm = _records[token].denorm;
        return bdiv(denorm, _totalWeight);
    }

    function getBalance(address token)
        external
        view
        _viewlock_
        returns (uint256)
    {
        require(_records[token].bound, "ERR_NOT_BOUND");
        return _records[token].balance;
    }

    function getSwapFee() external view _viewlock_ returns (uint256) {
        return _swapFee;
    }

    function getController() external view _viewlock_ returns (address) {
        return _controller;
    }

    function getDataTokenAddress() external view _viewlock_ returns (address) {
        return _datatokenAddress;
    }

    function getBaseTokenAddress() external view _viewlock_ returns (address) {
        return _basetokenAddress;
    }

    function setSwapFee(uint256 swapFee) public _logs_ _lock_ {
        require(!_finalized, "ERR_IS_FINALIZED");
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");
        require(swapFee >= MIN_FEE, "ERR_MIN_FEE");
        require(swapFee <= MAX_FEE, "ERR_MAX_FEE");
        _swapFee = swapFee;
    }

    function setController(address manager) external _logs_ _lock_ {
        require(manager != address(0), "ERR_INVALID_MANAGER_ADDRESS");
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");
        _controller = manager;
    }

    function setPublicSwap(bool public_) public _logs_ _lock_ {
        require(!_finalized, "ERR_IS_FINALIZED");
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");
        _publicSwap = public_;
    }

    function finalize() public _logs_ _lock_ {
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");
        require(!_finalized, "ERR_IS_FINALIZED");
        require(_tokens.length >= MIN_BOUND_TOKENS, "ERR_MIN_TOKENS");

        _finalized = true;
        _publicSwap = true;

        _mintPoolShare(INIT_POOL_SUPPLY);
        _pushPoolShare(msg.sender, INIT_POOL_SUPPLY);
    }

    function bind(
        address token,
        uint256 balance,
        uint256 denorm
    )
        public
        _logs_
    // _lock_  Bind does not lock because it jumps to `rebind`, which does
    {
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");
        require(!_records[token].bound, "ERR_IS_BOUND");
        require(!_finalized, "ERR_IS_FINALIZED");

        require(_tokens.length < MAX_BOUND_TOKENS, "ERR_MAX_TOKENS");

        _records[token] = Record({
            bound: true,
            index: _tokens.length,
            denorm: 0, // balance and denorm will be validated
            balance: 0 // and set by `rebind`
        });
        _tokens.push(token);
        rebind(token, balance, denorm);
    }

    function rebind(
        address token,
        uint256 balance,
        uint256 denorm
    ) public _logs_ _lock_ {
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");
        require(_records[token].bound, "ERR_NOT_BOUND");
        require(!_finalized, "ERR_IS_FINALIZED");

        require(denorm >= MIN_WEIGHT, "ERR_MIN_WEIGHT");
        require(denorm <= MAX_WEIGHT, "ERR_MAX_WEIGHT");
        require(balance >= MIN_BALANCE, "ERR_MIN_BALANCE");

        // Adjust the denorm and totalWeight
        uint256 oldWeight = _records[token].denorm;
        if (denorm > oldWeight) {
            _totalWeight = badd(_totalWeight, bsub(denorm, oldWeight));
            require(_totalWeight <= MAX_TOTAL_WEIGHT, "ERR_MAX_TOTAL_WEIGHT");
        } else if (denorm < oldWeight) {
            _totalWeight = bsub(_totalWeight, bsub(oldWeight, denorm));
        }
        _records[token].denorm = denorm;

        // Adjust the balance record and actual token balance
        uint256 oldBalance = _records[token].balance;
        _records[token].balance = balance;
        if (balance > oldBalance) {
            _pullUnderlying(token, msg.sender, bsub(balance, oldBalance));
        } else if (balance < oldBalance) {
            // In this case liquidity is being withdrawn, so charge EXIT_FEE
            uint256 tokenBalanceWithdrawn = bsub(oldBalance, balance);
            uint256 tokenExitFee = bmul(tokenBalanceWithdrawn, EXIT_FEE);
            _pushUnderlying(
                token,
                msg.sender,
                bsub(tokenBalanceWithdrawn, tokenExitFee)
            );
            _pushUnderlying(token, _factory, tokenExitFee);
        }
    }

    function unbind(address token) external _logs_ _lock_ {
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");
        require(_records[token].bound, "ERR_NOT_BOUND");
        require(!_finalized, "ERR_IS_FINALIZED");

        uint256 tokenBalance = _records[token].balance;
        uint256 tokenExitFee = bmul(tokenBalance, EXIT_FEE);

        _totalWeight = bsub(_totalWeight, _records[token].denorm);

        // Swap the token-to-unbind with the last token,
        // then delete the last token
        uint256 index = _records[token].index;
        uint256 last = _tokens.length - 1;
        _tokens[index] = _tokens[last];
        _records[_tokens[index]].index = index;
        _tokens.pop();
        _records[token] = Record({
            bound: false,
            index: 0,
            denorm: 0,
            balance: 0
        });

        _pushUnderlying(token, msg.sender, bsub(tokenBalance, tokenExitFee));
        _pushUnderlying(token, _factory, tokenExitFee);
    }

    // Absorb any tokens that have been sent to this contract into the pool
    function gulp(address token) external _logs_ _lock_ {
        require(_records[token].bound, "ERR_NOT_BOUND");
        _records[token].balance = IERC20(token).balanceOf(address(this));
    }

    function getSpotPrice(address tokenIn, address tokenOut)
        external
        view
        _viewlock_
        returns (uint256 spotPrice)
    {
        require(_records[tokenIn].bound, "ERR_NOT_BOUND");
        require(_records[tokenOut].bound, "ERR_NOT_BOUND");
        Record storage inRecord = _records[tokenIn];
        Record storage outRecord = _records[tokenOut];
        return
            calcSpotPrice(
                inRecord.balance,
                inRecord.denorm,
                outRecord.balance,
                outRecord.denorm,
                _swapFee
            );
    }

    function getSpotPriceSansFee(address tokenIn, address tokenOut)
        external
        view
        _viewlock_
        returns (uint256 spotPrice)
    {
        require(_records[tokenIn].bound, "ERR_NOT_BOUND");
        require(_records[tokenOut].bound, "ERR_NOT_BOUND");
        Record storage inRecord = _records[tokenIn];
        Record storage outRecord = _records[tokenOut];
        return
            calcSpotPrice(
                inRecord.balance,
                inRecord.denorm,
                outRecord.balance,
                outRecord.denorm,
                0
            );
    }

    function joinPool(uint256 poolAmountOut, uint256[] calldata maxAmountsIn)
        external
        _logs_
        _lock_
    {
        if(_finalized == false && block.number>_burnInEndBlock){
                //notify 1SS to setup the pool first
                ssContract.notifyFinalize(_datatokenAddress);
        }
        require(_finalized, "ERR_NOT_FINALIZED");

        //ask ssContract if join is allowed
        uint256 tdatatokenAmount = 0;
        uint256 tbasetokenAmount = 0;
        for (uint256 i = 0; i < _tokens.length; i++) {
            if (_tokens[i] == _datatokenAddress)
                tdatatokenAmount = maxAmountsIn[i];
            if (_tokens[i] == _basetokenAddress)
                tbasetokenAmount = maxAmountsIn[i];
        }
        bool allowed = ssContract.allowStake(
            _datatokenAddress,
            _basetokenAddress,
            tdatatokenAmount,
            tbasetokenAmount,
            msg.sender
        );
        require(allowed == true, "ERR_DENIED_BY_CONTROLLER");

        uint256 poolTotal = totalSupply();
        uint256 ratio = bdiv(poolAmountOut, poolTotal);
        require(ratio != 0, "ERR_MATH_APPROX");
        for (uint256 i = 0; i < _tokens.length; i++) {
            address t = _tokens[i];
            uint256 bal = _records[t].balance;
            uint256 tokenAmountIn = bmul(ratio, bal);
            require(tokenAmountIn != 0, "ERR_MATH_APPROX");
            require(tokenAmountIn <= maxAmountsIn[i], "ERR_LIMIT_IN");
            _records[t].balance = badd(_records[t].balance, tokenAmountIn);
            emit LOG_JOIN(msg.sender, t, tokenAmountIn, block.timestamp);
            _pullUnderlying(t, msg.sender, tokenAmountIn);
        }
        _mintPoolShare(poolAmountOut);
        _pushPoolShare(msg.sender, poolAmountOut);
    }

    function exitPool(uint256 poolAmountIn, uint256[] calldata minAmountsOut)
        external
        _logs_
        _lock_
    {
        if(_finalized == false && block.number>_burnInEndBlock){
                //notify 1SS to setup the pool first
                ssContract.notifyFinalize(_datatokenAddress);
        }
        require(_finalized, "ERR_NOT_FINALIZED");

        //ask ssContract if exit is allowed
        uint256 tdatatokenAmount = 0;
        uint256 tbasetokenAmount = 0;
        for (uint256 i = 0; i < _tokens.length; i++) {
            if (_tokens[i] == _datatokenAddress)
                tdatatokenAmount = minAmountsOut[i];
            if (_tokens[i] == _basetokenAddress)
                tbasetokenAmount = minAmountsOut[i];
        }
        bool allowed = ssContract.allowUnStake(
            _datatokenAddress,
            _basetokenAddress,
            tdatatokenAmount,
            tbasetokenAmount,
            msg.sender
        );
        require(allowed == true, "ERR_DENIED_BY_CONTROLLER");

        uint256 poolTotal = totalSupply();
        uint256 exitFee = bmul(poolAmountIn, EXIT_FEE);
        uint256 pAiAfterExitFee = bsub(poolAmountIn, exitFee);
        uint256 ratio = bdiv(pAiAfterExitFee, poolTotal);
        require(ratio != 0, "ERR_MATH_APPROX");

        _pullPoolShare(msg.sender, poolAmountIn);
        _pushPoolShare(_factory, exitFee);
        _burnPoolShare(pAiAfterExitFee);

        for (uint256 i = 0; i < _tokens.length; i++) {
            address t = _tokens[i];
            uint256 bal = _records[t].balance;
            uint256 tokenAmountOut = bmul(ratio, bal);
            require(tokenAmountOut != 0, "ERR_MATH_APPROX");
            require(tokenAmountOut >= minAmountsOut[i], "ERR_LIMIT_OUT");
            _records[t].balance = bsub(_records[t].balance, tokenAmountOut);
            emit LOG_EXIT(msg.sender, t, tokenAmountOut, block.timestamp);
            _pushUnderlying(t, msg.sender, tokenAmountOut);
        }
    }

    function swapExactAmountIn(
        address tokenIn,
        uint256 tokenAmountIn,
        address tokenOut,
        uint256 minAmountOut,
        uint256 maxPrice
    )
        external
        _logs_
        _lock_
        returns (uint256 tokenAmountOut, uint256 spotPriceAfter)
    {
        require(_records[tokenIn].bound, "ERR_NOT_BOUND");
        require(_records[tokenOut].bound, "ERR_NOT_BOUND");
        if (block.number <= _burnInEndBlock) {
            // we are in burn-in period, leverage to controller
            //defer calc to ssContract
            tokenAmountOut = ssContract.calcOutGivenIn(
                _datatokenAddress,
                tokenIn,
                tokenOut,
                tokenAmountIn
            );
            require(tokenAmountOut >= minAmountOut, "ERR_LIMIT_OUT");
            //approve tokens so ssContract can pull them
            IERC20 token = IERC20(tokenIn);
            token.approve(_controller, tokenAmountIn);
            ssContract.swapExactAmountIn(
                _datatokenAddress,
                msg.sender,
                tokenIn,
                tokenAmountIn,
                tokenOut,
                minAmountOut
            );
            emit LOG_SWAP(
                msg.sender,
                tokenIn,
                tokenOut,
                tokenAmountIn,
                tokenAmountOut,
                block.timestamp
            );
            return (tokenAmountOut, 0); //returning spot price 0 because there is no public spotPrice
        }
        if(_finalized == false && block.number>_burnInEndBlock){
                //notify 1SS to setup the pool first
                ssContract.notifyFinalize(_datatokenAddress);
        }
        require(_publicSwap, "ERR_SWAP_NOT_PUBLIC");
        Record storage inRecord = _records[address(tokenIn)];
        Record storage outRecord = _records[address(tokenOut)];

        require(
            tokenAmountIn <= bmul(inRecord.balance, MAX_IN_RATIO),
            "ERR_MAX_IN_RATIO"
        );

        uint256 spotPriceBefore = calcSpotPrice(
            inRecord.balance,
            inRecord.denorm,
            outRecord.balance,
            outRecord.denorm,
            _swapFee
        );
        require(spotPriceBefore <= maxPrice, "ERR_BAD_LIMIT_PRICE");

        tokenAmountOut = calcOutGivenIn(
            inRecord.balance,
            inRecord.denorm,
            outRecord.balance,
            outRecord.denorm,
            tokenAmountIn,
            _swapFee
        );
        require(tokenAmountOut >= minAmountOut, "ERR_LIMIT_OUT");

        inRecord.balance = badd(inRecord.balance, tokenAmountIn);
        outRecord.balance = bsub(outRecord.balance, tokenAmountOut);

        spotPriceAfter = calcSpotPrice(
            inRecord.balance,
            inRecord.denorm,
            outRecord.balance,
            outRecord.denorm,
            _swapFee
        );
        require(spotPriceAfter >= spotPriceBefore, "ERR_MATH_APPROX");
        require(spotPriceAfter <= maxPrice, "ERR_LIMIT_PRICE");
        require(
            spotPriceBefore <= bdiv(tokenAmountIn, tokenAmountOut),
            "ERR_MATH_APPROX"
        );

        emit LOG_SWAP(
            msg.sender,
            tokenIn,
            tokenOut,
            tokenAmountIn,
            tokenAmountOut,
            block.timestamp
        );

        _pullUnderlying(tokenIn, msg.sender, tokenAmountIn);
        _pushUnderlying(tokenOut, msg.sender, tokenAmountOut);

        return (tokenAmountOut, spotPriceAfter); //returning spot price 0 because there is no public spotPrice
    }

    function swapExactAmountOut(
        address tokenIn,
        uint256 maxAmountIn,
        address tokenOut,
        uint256 tokenAmountOut,
        uint256 maxPrice
    )
        external
        _logs_
        _lock_
        returns (uint256 tokenAmountIn, uint256 spotPriceAfter)
    {
        require(_records[tokenIn].bound, "ERR_NOT_BOUND");
        require(_records[tokenOut].bound, "ERR_NOT_BOUND");
        if (block.number <= _burnInEndBlock) {
            // we are in burn-in period, leverage to controller
            //defer calc to ssContract
            //tokenAmountOut = ssContract.calcOutGivenIn(_datatokenAddress,tokenIn,tokenOut,tokenAmountIn);
            tokenAmountIn = ssContract.calcInGivenOut(
                _datatokenAddress,
                tokenIn,
                tokenOut,
                tokenAmountOut
            );
            require(tokenAmountIn <= maxAmountIn, "ERR_LIMIT_IN");
            //approve tokens so ssContract can pull them
            IERC20 token = IERC20(tokenIn);
            token.approve(_controller, tokenAmountIn);
            ssContract.swapExactAmountOut(
                _datatokenAddress,
                msg.sender,
                tokenIn,
                tokenAmountIn,
                tokenOut,
                tokenAmountOut
            );
            emit LOG_SWAP(
                msg.sender,
                tokenIn,
                tokenOut,
                tokenAmountIn,
                tokenAmountOut,
                block.timestamp
            );
            return (tokenAmountOut, 0); //returning spot price 0 because there is no public spotPrice
        }
        if(_finalized == false && block.number>_burnInEndBlock){
                //notify 1SS to setup the pool first
                ssContract.notifyFinalize(_datatokenAddress);
        }
        require(_publicSwap, "ERR_SWAP_NOT_PUBLIC");

        Record storage inRecord = _records[address(tokenIn)];
        Record storage outRecord = _records[address(tokenOut)];

        require(
            tokenAmountOut <= bmul(outRecord.balance, MAX_OUT_RATIO),
            "ERR_MAX_OUT_RATIO"
        );

        uint256 spotPriceBefore = calcSpotPrice(
            inRecord.balance,
            inRecord.denorm,
            outRecord.balance,
            outRecord.denorm,
            _swapFee
        );

        require(spotPriceBefore <= maxPrice, "ERR_BAD_LIMIT_PRICE");

        tokenAmountIn = calcInGivenOut(
            inRecord.balance,
            inRecord.denorm,
            outRecord.balance,
            outRecord.denorm,
            tokenAmountOut,
            _swapFee
        );
        require(tokenAmountIn <= maxAmountIn, "ERR_LIMIT_IN");

        inRecord.balance = badd(inRecord.balance, tokenAmountIn);
        outRecord.balance = bsub(outRecord.balance, tokenAmountOut);

        spotPriceAfter = calcSpotPrice(
            inRecord.balance,
            inRecord.denorm,
            outRecord.balance,
            outRecord.denorm,
            _swapFee
        );
        require(spotPriceAfter >= spotPriceBefore, "ERR_MATH_APPROX");
        require(spotPriceAfter <= maxPrice, "ERR_LIMIT_PRICE");
        require(
            spotPriceBefore <= bdiv(tokenAmountIn, tokenAmountOut),
            "ERR_MATH_APPROX"
        );

        emit LOG_SWAP(
            msg.sender,
            tokenIn,
            tokenOut,
            tokenAmountIn,
            tokenAmountOut,
            block.timestamp
        );

        _pullUnderlying(tokenIn, msg.sender, tokenAmountIn);
        _pushUnderlying(tokenOut, msg.sender, tokenAmountOut);

        return (tokenAmountIn, spotPriceAfter);
    }

    function joinswapExternAmountIn(
        address tokenIn,
        uint256 tokenAmountIn,
        uint256 minPoolAmountOut
    ) external _logs_ _lock_ returns (uint256 poolAmountOut) {
        if(_finalized == false && block.number>_burnInEndBlock){
                //notify 1SS to setup the pool first
                ssContract.notifyFinalize(_datatokenAddress);
        }
        require(_finalized, "ERR_NOT_FINALIZED");
        require(_records[tokenIn].bound, "ERR_NOT_BOUND");
        require(
            tokenAmountIn <= bmul(_records[tokenIn].balance, MAX_IN_RATIO),
            "ERR_MAX_IN_RATIO"
        );
        //ask ssContract
        bool allowed;
        Record storage ssInRecord=_records[_datatokenAddress];
        address ssStakeToken;
        
        if (tokenIn == _datatokenAddress){
            ssStakeToken= _basetokenAddress;
            allowed = ssContract.allowStake(
                _datatokenAddress,
                _basetokenAddress,
                tokenAmountIn,
                0,
                msg.sender
            );
        }
        else{
            ssInRecord = _records[_basetokenAddress];
            ssStakeToken= _datatokenAddress;
            allowed = ssContract.allowStake(
                _datatokenAddress,
                _basetokenAddress,
                0,
                tokenAmountIn,
                msg.sender
            );
        }
        require(allowed == true, "ERR_DENIED_BY_CONTROLLER");

        Record storage inRecord = _records[tokenIn];

        poolAmountOut = calcPoolOutGivenSingleIn(
            inRecord.balance,
            inRecord.denorm,
            _totalSupply,
            _totalWeight,
            tokenAmountIn,
            _swapFee
        );

        require(poolAmountOut >= minPoolAmountOut, "ERR_LIMIT_OUT");

        inRecord.balance = badd(inRecord.balance, tokenAmountIn);

        emit LOG_JOIN(msg.sender, tokenIn, tokenAmountIn, block.timestamp);

        _mintPoolShare(poolAmountOut);
        _pushPoolShare(msg.sender, poolAmountOut);
        _pullUnderlying(tokenIn, msg.sender, tokenAmountIn);

        //ask the ssContract to stake as well
        //calculate how much should the 1ss stake
        
        uint ssAmountIn=calcSingleInGivenPoolOut(
            ssInRecord.balance,
            ssInRecord.denorm,
            _totalSupply,
            _totalWeight,
            poolAmountOut,
            _swapFee
        );
        if(ssContract.canStake(_datatokenAddress,ssStakeToken,ssAmountIn)==true){
                //call 1ss to approve
                ssContract.Stake(_datatokenAddress, ssStakeToken,ssAmountIn);
                // follow the same path
                ssInRecord.balance = badd(ssInRecord.balance, ssAmountIn);
                emit LOG_JOIN(_controller, ssStakeToken, ssAmountIn, block.timestamp);
                _mintPoolShare(poolAmountOut);
                _pushPoolShare(_controller, poolAmountOut);
                _pullUnderlying(ssStakeToken, _controller, ssAmountIn);
        }
        return poolAmountOut;
    }

    function joinswapPoolAmountOut(
        address tokenIn,
        uint256 poolAmountOut,
        uint256 maxAmountIn
    ) external _logs_ _lock_ returns (uint256 tokenAmountIn) {
        if(_finalized == false && block.number>_burnInEndBlock){
                //notify 1SS to setup the pool first
                ssContract.notifyFinalize(_datatokenAddress);
        }
        require(_finalized, "ERR_NOT_FINALIZED");
        require(_records[tokenIn].bound, "ERR_NOT_BOUND");
        
        Record storage inRecord = _records[tokenIn];

        tokenAmountIn = calcSingleInGivenPoolOut(
            inRecord.balance,
            inRecord.denorm,
            _totalSupply,
            _totalWeight,
            poolAmountOut,
            _swapFee
        );

        //ask ssContract
        bool allowed;
        Record storage ssInRecord=_records[_datatokenAddress];
        address ssStakeToken;
        
        if (tokenIn == _datatokenAddress){
            ssStakeToken= _basetokenAddress;
            allowed = ssContract.allowStake(
                _datatokenAddress,
                _basetokenAddress,
                tokenAmountIn,
                0,
                msg.sender
            );
        }
        else{
            ssInRecord = _records[_basetokenAddress];
            ssStakeToken= _datatokenAddress;
            allowed = ssContract.allowStake(
                _datatokenAddress,
                _basetokenAddress,
                0,
                tokenAmountIn,
                msg.sender
            );
        }
        require(allowed == true, "ERR_DENIED_BY_CONTROLLER");

        require(tokenAmountIn != 0, "ERR_MATH_APPROX");
        require(tokenAmountIn <= maxAmountIn, "ERR_LIMIT_IN");

        require(
            tokenAmountIn <= bmul(_records[tokenIn].balance, MAX_IN_RATIO),
            "ERR_MAX_IN_RATIO"
        );

        inRecord.balance = badd(inRecord.balance, tokenAmountIn);

        emit LOG_JOIN(msg.sender, tokenIn, tokenAmountIn, block.timestamp);

        _mintPoolShare(poolAmountOut);
        _pushPoolShare(msg.sender, poolAmountOut);
        _pullUnderlying(tokenIn, msg.sender, tokenAmountIn);

        //ask the ssContract to stake as well
        //calculate how much should the 1ss stake
        uint ssAmountIn=calcSingleInGivenPoolOut(
            ssInRecord.balance,
            ssInRecord.denorm,
            _totalSupply,
            _totalWeight,
            poolAmountOut,
            _swapFee
        );
        if(ssContract.canStake(_datatokenAddress,ssStakeToken,ssAmountIn)==true){
                //call 1ss to approve
                ssContract.Stake(_datatokenAddress, ssStakeToken,ssAmountIn);
                // follow the same path
                ssInRecord.balance = badd(ssInRecord.balance, ssAmountIn);
                emit LOG_JOIN(_controller, ssStakeToken, ssAmountIn, block.timestamp);
                _mintPoolShare(poolAmountOut);
                _pushPoolShare(_controller, poolAmountOut);
                _pullUnderlying(ssStakeToken, _controller, ssAmountIn);
        }
        return tokenAmountIn;
    }

    function exitswapPoolAmountIn(
        address tokenOut,
        uint256 poolAmountIn,
        uint256 minAmountOut
    ) external _logs_ _lock_ returns (uint256 tokenAmountOut) {
        if(_finalized == false && block.number>_burnInEndBlock){
                //notify 1SS to setup the pool first
                ssContract.notifyFinalize(_datatokenAddress);
        }
        require(_finalized, "ERR_NOT_FINALIZED");
        require(_records[tokenOut].bound, "ERR_NOT_BOUND");
        
        Record storage outRecord = _records[tokenOut];

        tokenAmountOut = calcSingleOutGivenPoolIn(
            outRecord.balance,
            outRecord.denorm,
            _totalSupply,
            _totalWeight,
            poolAmountIn,
            _swapFee
        );

        require(tokenAmountOut >= minAmountOut, "ERR_LIMIT_OUT");

        require(
            tokenAmountOut <= bmul(_records[tokenOut].balance, MAX_OUT_RATIO),
            "ERR_MAX_OUT_RATIO"
        );
        //ask ssContract
        bool allowed;
        address ssStakeToken;
        Record storage ssOutRecord=_records[_datatokenAddress];
        if (tokenOut == _datatokenAddress){
            ssStakeToken= _basetokenAddress;
            allowed = ssContract.allowUnStake(
                _datatokenAddress,
                _basetokenAddress,
                tokenAmountOut,
                0,
                msg.sender
            );
        }
        else{
            ssStakeToken= _datatokenAddress;
            ssOutRecord=_records[_basetokenAddress];
            allowed = ssContract.allowUnStake(
                _datatokenAddress,
                _basetokenAddress,
                0,
                tokenAmountOut,
                msg.sender
            );
        }
        require(allowed == true, "ERR_DENIED_BY_CONTROLLER");

        outRecord.balance = bsub(outRecord.balance, tokenAmountOut);

        uint256 exitFee = bmul(poolAmountIn, EXIT_FEE);

        emit LOG_EXIT(msg.sender, tokenOut, tokenAmountOut, block.timestamp);

        _pullPoolShare(msg.sender, poolAmountIn);
        _burnPoolShare(bsub(poolAmountIn, exitFee));
        _pushPoolShare(_factory, exitFee);
        _pushUnderlying(tokenOut, msg.sender, tokenAmountOut);
        
        //ask the ssContract to unstake as well
        //calculate how much should the 1ss unstake
        uint ssAmountOut=calcSingleOutGivenPoolIn(
            ssOutRecord.balance,
            ssOutRecord.denorm,
            _totalSupply,
            _totalWeight,
            poolAmountIn,
            _swapFee
        );
        if(ssContract.canStake(_datatokenAddress,ssStakeToken,ssAmountOut)==true){
                ssOutRecord.balance = bsub(ssOutRecord.balance, ssAmountOut);
                exitFee = bmul(poolAmountIn, EXIT_FEE);
                emit LOG_EXIT(_controller, ssStakeToken, ssAmountOut, block.timestamp);
                _pullPoolShare(_controller, poolAmountIn);
                _burnPoolShare(bsub(poolAmountIn, exitFee));
                _pushPoolShare(_factory, exitFee);
                _pushUnderlying(ssStakeToken, _controller,ssAmountOut);
                //call unstake on 1ss to do cleanup on their side
                ssContract.UnStake(_datatokenAddress,ssStakeToken,ssAmountOut);
        }
        return tokenAmountOut;
    }

    function exitswapExternAmountOut(
        address tokenOut,
        uint256 tokenAmountOut,
        uint256 maxPoolAmountIn
    ) external _logs_ _lock_ returns (uint256 poolAmountIn) {
        if(_finalized == false && block.number>_burnInEndBlock){
                //notify 1SS to setup the pool first
                ssContract.notifyFinalize(_datatokenAddress);
        }
        require(_finalized, "ERR_NOT_FINALIZED");
        require(_records[tokenOut].bound, "ERR_NOT_BOUND");
        require(
            tokenAmountOut <= bmul(_records[tokenOut].balance, MAX_OUT_RATIO),
            "ERR_MAX_OUT_RATIO"
        );
        //ask ssContract
        bool allowed;
        address ssStakeToken;
        Record storage ssOutRecord=_records[_datatokenAddress];
        if (tokenOut == _datatokenAddress){
            ssStakeToken= _basetokenAddress;
            allowed = ssContract.allowUnStake(
                _datatokenAddress,
                _basetokenAddress,
                tokenAmountOut,
                0,
                msg.sender
            );
        }
        else{
            ssStakeToken= _datatokenAddress;
            ssOutRecord=_records[_basetokenAddress];
            allowed = ssContract.allowUnStake(
                _datatokenAddress,
                _basetokenAddress,
                0,
                tokenAmountOut,
                msg.sender
            );
        }
        require(allowed == true, "ERR_DENIED_BY_CONTROLLER");
        Record storage outRecord = _records[tokenOut];

        poolAmountIn = calcPoolInGivenSingleOut(
            outRecord.balance,
            outRecord.denorm,
            _totalSupply,
            _totalWeight,
            tokenAmountOut,
            _swapFee
        );

        require(poolAmountIn != 0, "ERR_MATH_APPROX");
        require(poolAmountIn <= maxPoolAmountIn, "ERR_LIMIT_IN");

        outRecord.balance = bsub(outRecord.balance, tokenAmountOut);

        uint256 exitFee = bmul(poolAmountIn, EXIT_FEE);

        emit LOG_EXIT(msg.sender, tokenOut, tokenAmountOut, block.timestamp);

        _pullPoolShare(msg.sender, poolAmountIn);
        _burnPoolShare(bsub(poolAmountIn, exitFee));
        _pushPoolShare(_factory, exitFee);
        _pushUnderlying(tokenOut, msg.sender, tokenAmountOut);

        //ask the ssContract to unstake as well
        //calculate how much should the 1ss unstake
        uint ssAmountOut=calcSingleOutGivenPoolIn(
            ssOutRecord.balance,
            ssOutRecord.denorm,
            _totalSupply,
            _totalWeight,
            poolAmountIn,
            _swapFee
        );
        if(ssContract.canUnStake(_datatokenAddress,ssStakeToken,ssAmountOut)==true){
                ssOutRecord.balance = bsub(ssOutRecord.balance, ssAmountOut);
                exitFee = bmul(poolAmountIn, EXIT_FEE);
                emit LOG_EXIT(_controller, ssStakeToken, ssAmountOut, block.timestamp);
                _pullPoolShare(_controller, poolAmountIn);
                _burnPoolShare(bsub(poolAmountIn, exitFee));
                _pushPoolShare(_factory, exitFee);
                _pushUnderlying(ssStakeToken, _controller,ssAmountOut);
                //call unstake on 1ss to do cleanup on their side
                ssContract.UnStake(_datatokenAddress,ssStakeToken,ssAmountOut);
        }
        return poolAmountIn;
    }

    // ==
    // 'Underlying' token-manipulation functions make external calls but are NOT locked
    // You must `_lock_` or otherwise ensure reentry-safety

    function _pullUnderlying(
        address erc20,
        address from,
        uint256 amount
    ) internal {
        bool xfer = IERC20(erc20).transferFrom(from, address(this), amount);
        require(xfer, "ERR_ERC20_FALSE");
    }

    function _pushUnderlying(
        address erc20,
        address to,
        uint256 amount
    ) internal {
        bool xfer = IERC20(erc20).transfer(to, amount);
        require(xfer, "ERR_ERC20_FALSE");
    }

    function _pullPoolShare(address from, uint256 amount) internal {
        _pull(from, amount);
    }

    function _pushPoolShare(address to, uint256 amount) internal {
        _push(to, amount);
    }

    function _mintPoolShare(uint256 amount) internal {
        _mint(amount);
    }

    function _burnPoolShare(uint256 amount) internal {
        _burn(amount);
    }

    //old BMath functions.  Moved them here, because if we are in burn-in period, we leverage calls to 1ss
    /**********************************************************************************************
    // calcSpotPrice                                                                             //
    // sP = spotPrice                                                                            //
    // bI = tokenBalanceIn                ( bI / wI )         1                                  //
    // bO = tokenBalanceOut         sP =  -----------  *  ----------                             //
    // wI = tokenWeightIn                 ( bO / wO )     ( 1 - sF )                             //
    // wO = tokenWeightOut                                                                       //
    // sF = swapFee                                                                              //
    **********************************************************************************************/
    function calcSpotPrice(
        uint256 tokenBalanceIn,
        uint256 tokenWeightIn,
        uint256 tokenBalanceOut,
        uint256 tokenWeightOut,
        uint256 swapFee
    ) public pure returns (uint256 spotPrice) {
        uint256 numer = bdiv(tokenBalanceIn, tokenWeightIn);
        uint256 denom = bdiv(tokenBalanceOut, tokenWeightOut);
        uint256 ratio = bdiv(numer, denom);
        uint256 scale = bdiv(BONE, bsub(BONE, swapFee));
        return (spotPrice = bmul(ratio, scale));
    }

    /**********************************************************************************************
    // calcOutGivenIn                                                                            //
    // aO = tokenAmountOut                                                                       //
    // bO = tokenBalanceOut                                                                      //
    // bI = tokenBalanceIn              /      /            bI             \    (wI / wO) \      //
    // aI = tokenAmountIn    aO = bO * |  1 - | --------------------------  | ^            |     //
    // wI = tokenWeightIn               \      \ ( bI + ( aI * ( 1 - sF )) /              /      //
    // wO = tokenWeightOut                                                                       //
    // sF = swapFee                                                                              //
    **********************************************************************************************/
    function calcOutGivenIn(
        uint256 tokenBalanceIn,
        uint256 tokenWeightIn,
        uint256 tokenBalanceOut,
        uint256 tokenWeightOut,
        uint256 tokenAmountIn,
        uint256 swapFee
    ) public pure returns (uint256 tokenAmountOut) {
        uint256 weightRatio = bdiv(tokenWeightIn, tokenWeightOut);
        uint256 adjustedIn = bsub(BONE, swapFee);
        adjustedIn = bmul(tokenAmountIn, adjustedIn);
        uint256 y = bdiv(tokenBalanceIn, badd(tokenBalanceIn, adjustedIn));
        uint256 foo = bpow(y, weightRatio);
        uint256 bar = bsub(BONE, foo);
        tokenAmountOut = bmul(tokenBalanceOut, bar);
        return tokenAmountOut;
    }

    /**********************************************************************************************
    // calcInGivenOut                                                                            //
    // aI = tokenAmountIn                                                                        //
    // bO = tokenBalanceOut               /  /     bO      \    (wO / wI)      \                 //
    // bI = tokenBalanceIn          bI * |  | ------------  | ^            - 1  |                //
    // aO = tokenAmountOut    aI =        \  \ ( bO - aO ) /                   /                 //
    // wI = tokenWeightIn           --------------------------------------------                 //
    // wO = tokenWeightOut                          ( 1 - sF )                                   //
    // sF = swapFee                                                                              //
    **********************************************************************************************/
    function calcInGivenOut(
        uint256 tokenBalanceIn,
        uint256 tokenWeightIn,
        uint256 tokenBalanceOut,
        uint256 tokenWeightOut,
        uint256 tokenAmountOut,
        uint256 swapFee
    ) public pure returns (uint256 tokenAmountIn) {
        uint256 weightRatio = bdiv(tokenWeightOut, tokenWeightIn);
        uint256 diff = bsub(tokenBalanceOut, tokenAmountOut);
        uint256 y = bdiv(tokenBalanceOut, diff);
        uint256 foo = bpow(y, weightRatio);
        foo = bsub(foo, BONE);
        tokenAmountIn = bsub(BONE, swapFee);
        tokenAmountIn = bdiv(bmul(tokenBalanceIn, foo), tokenAmountIn);
        return tokenAmountIn;
    }

    /**********************************************************************************************
    // calcPoolOutGivenSingleIn                                                                  //
    // pAo = poolAmountOut         /                                              \              //
    // tAi = tokenAmountIn        ///      /     //    wI \      \\       \     wI \             //
    // wI = tokenWeightIn        //| tAi *| 1 - || 1 - --  | * sF || + tBi \    --  \            //
    // tW = totalWeight     pAo=||  \      \     \\    tW /      //         | ^ tW   | * pS - pS //
    // tBi = tokenBalanceIn      \\  ------------------------------------- /        /            //
    // pS = poolSupply            \\                    tBi               /        /             //
    // sF = swapFee                \                                              /              //
    **********************************************************************************************/
    function calcPoolOutGivenSingleIn(
        uint256 tokenBalanceIn,
        uint256 tokenWeightIn,
        uint256 poolSupply,
        uint256 totalWeight,
        uint256 tokenAmountIn,
        uint256 swapFee
    ) public pure returns (uint256 poolAmountOut) {
        // Charge the trading fee for the proportion of tokenAi
        ///  which is implicitly traded to the other pool tokens.
        // That proportion is (1- weightTokenIn)
        // tokenAiAfterFee = tAi * (1 - (1-weightTi) * poolFee);
        uint256 normalizedWeight = bdiv(tokenWeightIn, totalWeight);
        uint256 zaz = bmul(bsub(BONE, normalizedWeight), swapFee);
        uint256 tokenAmountInAfterFee = bmul(tokenAmountIn, bsub(BONE, zaz));

        uint256 newTokenBalanceIn = badd(tokenBalanceIn, tokenAmountInAfterFee);
        uint256 tokenInRatio = bdiv(newTokenBalanceIn, tokenBalanceIn);

        // uint newPoolSupply = (ratioTi ^ weightTi) * poolSupply;
        uint256 poolRatio = bpow(tokenInRatio, normalizedWeight);
        uint256 newPoolSupply = bmul(poolRatio, poolSupply);
        poolAmountOut = bsub(newPoolSupply, poolSupply);
        return poolAmountOut;
    }

    /**********************************************************************************************
    // calcSingleInGivenPoolOut                                                                  //
    // tAi = tokenAmountIn              //(pS + pAo)\     /    1    \\                           //
    // pS = poolSupply                 || ---------  | ^ | --------- || * bI - bI                //
    // pAo = poolAmountOut              \\    pS    /     \(wI / tW)//                           //
    // bI = balanceIn          tAi =  --------------------------------------------               //
    // wI = weightIn                              /      wI  \                                   //
    // tW = totalWeight                          |  1 - ----  |  * sF                            //
    // sF = swapFee                               \      tW  /                                   //
    **********************************************************************************************/
    function calcSingleInGivenPoolOut(
        uint256 tokenBalanceIn,
        uint256 tokenWeightIn,
        uint256 poolSupply,
        uint256 totalWeight,
        uint256 poolAmountOut,
        uint256 swapFee
    ) public pure returns (uint256 tokenAmountIn) {
        uint256 normalizedWeight = bdiv(tokenWeightIn, totalWeight);
        uint256 newPoolSupply = badd(poolSupply, poolAmountOut);
        uint256 poolRatio = bdiv(newPoolSupply, poolSupply);

        //uint newBalTi = poolRatio^(1/weightTi) * balTi;
        uint256 boo = bdiv(BONE, normalizedWeight);
        uint256 tokenInRatio = bpow(poolRatio, boo);
        uint256 newTokenBalanceIn = bmul(tokenInRatio, tokenBalanceIn);
        uint256 tokenAmountInAfterFee = bsub(newTokenBalanceIn, tokenBalanceIn);
        // Do reverse order of fees charged in joinswap_ExternAmountIn, this way
        //     ``` pAo == joinswap_ExternAmountIn(Ti, joinswap_PoolAmountOut(pAo, Ti)) ```
        //uint tAi = tAiAfterFee / (1 - (1-weightTi) * swapFee) ;
        uint256 zar = bmul(bsub(BONE, normalizedWeight), swapFee);
        tokenAmountIn = bdiv(tokenAmountInAfterFee, bsub(BONE, zar));
        return tokenAmountIn;
    }

    /**********************************************************************************************
    // calcSingleOutGivenPoolIn                                                                  //
    // tAo = tokenAmountOut            /      /                                             \\   //
    // bO = tokenBalanceOut           /      // pS - (pAi * (1 - eF)) \     /    1    \      \\  //
    // pAi = poolAmountIn            | bO - || ----------------------- | ^ | --------- | * b0 || //
    // ps = poolSupply                \      \\          pS           /     \(wO / tW)/      //  //
    // wI = tokenWeightIn      tAo =   \      \                                             //   //
    // tW = totalWeight                    /     /      wO \       \                             //
    // sF = swapFee                    *  | 1 - |  1 - ---- | * sF  |                            //
    // eF = exitFee                        \     \      tW /       /                             //
    **********************************************************************************************/
    function calcSingleOutGivenPoolIn(
        uint256 tokenBalanceOut,
        uint256 tokenWeightOut,
        uint256 poolSupply,
        uint256 totalWeight,
        uint256 poolAmountIn,
        uint256 swapFee
    ) public pure returns (uint256 tokenAmountOut) {
        uint256 normalizedWeight = bdiv(tokenWeightOut, totalWeight);
        // charge exit fee on the pool token side
        // pAiAfterExitFee = pAi*(1-exitFee)
        uint256 poolAmountInAfterExitFee = bmul(
            poolAmountIn,
            bsub(BONE, EXIT_FEE)
        );
        uint256 newPoolSupply = bsub(poolSupply, poolAmountInAfterExitFee);
        uint256 poolRatio = bdiv(newPoolSupply, poolSupply);

        // newBalTo = poolRatio^(1/weightTo) * balTo;
        uint256 tokenOutRatio = bpow(poolRatio, bdiv(BONE, normalizedWeight));
        uint256 newTokenBalanceOut = bmul(tokenOutRatio, tokenBalanceOut);

        uint256 tokenAmountOutBeforeSwapFee = bsub(
            tokenBalanceOut,
            newTokenBalanceOut
        );

        // charge swap fee on the output token side
        //uint tAo = tAoBeforeSwapFee * (1 - (1-weightTo) * swapFee)
        uint256 zaz = bmul(bsub(BONE, normalizedWeight), swapFee);
        tokenAmountOut = bmul(tokenAmountOutBeforeSwapFee, bsub(BONE, zaz));
        return tokenAmountOut;
    }

    /**********************************************************************************************
    // calcPoolInGivenSingleOut                                                                  //
    // pAi = poolAmountIn               // /               tAo             \\     / wO \     \   //
    // bO = tokenBalanceOut            // | bO - -------------------------- |\   | ---- |     \  //
    // tAo = tokenAmountOut      pS - ||   \     1 - ((1 - (tO / tW)) * sF)/  | ^ \ tW /  * pS | //
    // ps = poolSupply                 \\ -----------------------------------/                /  //
    // wO = tokenWeightOut  pAi =       \\               bO                 /                /   //
    // tW = totalWeight           -------------------------------------------------------------  //
    // sF = swapFee                                        ( 1 - eF )                            //
    // eF = exitFee                                                                              //
    **********************************************************************************************/
    function calcPoolInGivenSingleOut(
        uint256 tokenBalanceOut,
        uint256 tokenWeightOut,
        uint256 poolSupply,
        uint256 totalWeight,
        uint256 tokenAmountOut,
        uint256 swapFee
    ) public pure returns (uint256 poolAmountIn) {
        // charge swap fee on the output token side
        uint256 normalizedWeight = bdiv(tokenWeightOut, totalWeight);
        //uint tAoBeforeSwapFee = tAo / (1 - (1-weightTo) * swapFee) ;
        uint256 zoo = bsub(BONE, normalizedWeight);
        uint256 zar = bmul(zoo, swapFee);
        uint256 tokenAmountOutBeforeSwapFee = bdiv(
            tokenAmountOut,
            bsub(BONE, zar)
        );

        uint256 newTokenBalanceOut = bsub(
            tokenBalanceOut,
            tokenAmountOutBeforeSwapFee
        );
        uint256 tokenOutRatio = bdiv(newTokenBalanceOut, tokenBalanceOut);

        //uint newPoolSupply = (ratioTo ^ weightTo) * poolSupply;
        uint256 poolRatio = bpow(tokenOutRatio, normalizedWeight);
        uint256 newPoolSupply = bmul(poolRatio, poolSupply);
        uint256 poolAmountInAfterExitFee = bsub(poolSupply, newPoolSupply);

        // charge exit fee on the pool token side
        // pAi = pAiAfterExitFee/(1-exitFee)
        poolAmountIn = bdiv(poolAmountInAfterExitFee, bsub(BONE, EXIT_FEE));
        return poolAmountIn;
    }

    //rpc savings functions to be called by outside
    // instead of asking caller about tokens balances, denorms, etc we take them from the pool
    function ScalcSpotPrice(address tokenIn, address tokenOut)
        public
        view
        returns (uint256)
    {
        if (_records[tokenIn].bound != true) return (0);
        if (_records[tokenOut].bound != true) return (0);
        return (
            calcSpotPrice(
                _records[tokenIn].balance,
                _records[tokenIn].denorm,
                _records[tokenOut].balance,
                _records[tokenOut].denorm,
                _swapFee
            )
        );
    }

    function ScalcOutGivenIn(
        address tokenIn,
        address tokenOut,
        uint256 tokenAmountIn
    ) public view returns (uint256) {
        if (_records[tokenIn].bound != true) return (0);
        if (_records[tokenOut].bound != true) return (0);
        return (
            calcOutGivenIn(
                _records[tokenIn].balance,
                _records[tokenIn].denorm,
                _records[tokenOut].balance,
                _records[tokenOut].denorm,
                tokenAmountIn,
                _swapFee
            )
        );
    }

    function ScalcInGivenOut(
        address tokenIn,
        address tokenOut,
        uint256 tokenAmountOut
    ) public view returns (uint256) {
        if (_records[tokenIn].bound != true) return (0);
        if (_records[tokenOut].bound != true) return (0);
        return (
            calcInGivenOut(
                _records[tokenIn].balance,
                _records[tokenIn].denorm,
                _records[tokenOut].balance,
                _records[tokenOut].denorm,
                tokenAmountOut,
                _swapFee
            )
        );
    }

    function ScalcPoolOutGivenSingleIn(address tokenIn, uint256 tokenAmountIn)
        public
        view
        returns (uint256)
    {
        if (_records[tokenIn].bound != true) return (0);
        return (
            calcPoolOutGivenSingleIn(
                _records[tokenIn].balance,
                _records[tokenIn].denorm,
                _totalSupply,
                _totalWeight,
                tokenAmountIn,
                _swapFee
            )
        );
    }

    function ScalcSingleInGivenPoolOut(address tokenIn, uint256 poolAmountOut)
        public
        view
        returns (uint256)
    {
        if (_records[tokenIn].bound != true) return (0);
        return (
            calcSingleInGivenPoolOut(
                _records[tokenIn].balance,
                _records[tokenIn].denorm,
                _totalSupply,
                _totalWeight,
                poolAmountOut,
                _swapFee
            )
        );
    }

    function ScalcSingleOutGivenPoolIn(address tokenOut, uint256 poolAmountIn)
        public
        view
        returns (uint256)
    {
        if (_records[tokenOut].bound != true) return (0);
        return (
            calcSingleOutGivenPoolIn(
                _records[tokenOut].balance,
                _records[tokenOut].denorm,
                _totalSupply,
                _totalWeight,
                poolAmountIn,
                _swapFee
            )
        );
    }

    function ScalcPoolInGivenSingleOut(address tokenOut, uint256 tokenAmountOut)
        public
        view
        returns (uint256)
    {
        if (_records[tokenOut].bound != true) return (0);
        return (
            calcPoolInGivenSingleOut(
                _records[tokenOut].balance,
                _records[tokenOut].denorm,
                _totalSupply,
                _totalWeight,
                tokenAmountOut,
                _swapFee
            )
        );
    }
}
