/* eslint-env mocha */
/* global artifacts, contract, it, beforeEach, web3, assert */
const Template = artifacts.require('ERC20Template')
const FeeManager = artifacts.require('FeeManager')
const Factory = artifacts.require('Factory')
const Token = artifacts.require('ERC20Template')
const testUtils = require('../helpers/utils')
const truffleAssert = require('truffle-assertions')
const BigNumber = require('bn.js')

contract('ERC20Template', async (accounts) => {
    let cap,
        name,
        symbol,
        decimals,
        factory,
        template,
        token,
        tokenAddress,
        feeManager,
        ethValue,
        minter,
        newMinter,
        reciever,
        blob

    beforeEach('init contracts for each test', async () => {
        symbol = 'EDT1'
        name = 'ERC20DataToken'
        blob = 'https://example.com/dataset-1'
        decimals = 0
        minter = accounts[0]
        reciever = accounts[1]
        newMinter = accounts[2]
        feeManager = await FeeManager.new()
        cap = new BigNumber('1400000000')
        template = await Template.new('Template', 'TEMPLATE', minter, cap, blob, feeManager.address)
        factory = await Factory.new(template.address, feeManager.address)
        blob = 'https://example.com/dataset-1'
        const trxReceipt = await factory.createToken(name, symbol, blob, minter)
        const TokenCreatedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'TokenCreated')
        tokenAddress = TokenCreatedEventArgs.newTokenAddress
        token = await Token.at(tokenAddress)
        ethValue = new BigNumber('100000000000000000')
    })

    it('should check that the token contract is initialized', async () => {
        const isInitialized = await token.isInitialized()
        assert(
            isInitialized === true,
            'Contract was not initialized correctly!'
        )
    })

    it('should fail to re-initialize the contracts', async () => {
        truffleAssert.fails(token.initialize('NewName', 'NN', reciever, cap, blob, feeManager.address),
            truffleAssert.ErrorType.REVERT,
            'ERC20Template: token instance already initialized')
    })

    it('should check that the token is not paused', async () => {
        const isPaused = await token.isPaused()
        assert(isPaused === false)
    })

    it('should pause the contract', async () => {
        await token.pause({ from: minter })
        const isPaused = await token.isPaused()
        assert(isPaused === true)
    })

    it('should fail to unpause the contract', async () => {
        truffleAssert.fails(token.unpause({ from: minter }))
    })

    it('should unpause the contract', async () => {
        await token.pause({ from: minter })
        await token.unpause({ from: minter })
        const isPaused = await token.isPaused()
        assert(isPaused === false)
    })

    it('should set a new minter', async () => {
        await token.setMinter(newMinter)
        const isMinter = await token.isMinter(newMinter)
        assert(isMinter === true)
    })

    it('should not mint the tokens due to zero message value', async () => {
        truffleAssert.fails(token.mint(reciever, 10, { from: minter }),
            truffleAssert.ErrorType.REVERT,
            'ERC20Template: invalid data token minting fee')
    })

    it('should not mint the tokens because of the paused contract', async () => {
        await token.pause()
        truffleAssert.fails(token.mint(reciever, 10, { value: ethValue, from: minter }),
            truffleAssert.ErrorType.REVERT,
            'ERC20Pausable: this token contract is paused')
    })

    it('should mint the tokens', async () => {
        truffleAssert.passes(await token.mint(reciever, 10, { value: ethValue, from: minter }))
        const feeBalance = await web3.eth.getBalance(feeManager.address)
        assert(feeBalance.toString() === ethValue.toString())
    })

    it('should get the token name', async () => {
        const tokenName = await token.name()
        assert(tokenName === name)
    })

    it('should get the token symbol', async () => {
        const tokenSymbol = await token.symbol()
        assert(tokenSymbol === symbol)
    })

    it('should get the token decimals', async () => {
        const tokenDecimals = await token.decimals()
        assert(tokenDecimals.toNumber() === decimals)
    })

    it('should approve token spending', async () => {
        truffleAssert.passes(await token.approve(reciever, 10, { from: minter }))
    })

    it('should increase token allowance', async () => {
        truffleAssert.passes(await token.approve(reciever, 10, { from: minter }))
        truffleAssert.passes(await token.increaseAllowance(reciever, 1, { from: minter }))
    })

    it('should decrease token allowance', async () => {
        truffleAssert.passes(await token.approve(reciever, 10, { from: minter }))
        truffleAssert.passes(await token.decreaseAllowance(reciever, 1, { from: minter }))
    })

    it('should transfer token tokens to another address', async () => {
        truffleAssert.passes(await token.mint(minter, 10, { value: ethValue, from: minter }))
        truffleAssert.passes(await token.transfer(reciever, 1, { from: minter }))
    })

    it('should transfer token tokens to another address', async () => {
        truffleAssert.passes(await token.mint(minter, 10, { value: ethValue, from: minter }))
        truffleAssert.passes(await token.approve(reciever, 10, { from: minter }))
        truffleAssert.passes(await token.transferFrom(minter, reciever, 1, { from: reciever }))
    })
})
