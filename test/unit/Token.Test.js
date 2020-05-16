const Template = artifacts.require('ERC20Template')
const FeeManager = artifacts.require('FeeManager')
const Factory = artifacts.require('Factory')
const Token = artifacts.require('ERC20Template')

const truffleAssert = require('truffle-assertions')
const BigNumber = require('bn.js')

/* eslint-env mocha */
/* global artifacts, contract, it, beforeEach, assert, web3 */

contract('Token test', async accounts => {
    let cap
    let name
    let symbol
    let decimals
    let factory
    let template
    let token
    let feeManager
    let ethValue
    let tokenAddress
    let minter
    let newMinter
    let reciever
    let metadataRef

    beforeEach('init contracts for each test', async function() {
        symbol = 'TDT'
        name = 'TestDataToken'
        decimals = 0
        minter = accounts[0]
        reciever = accounts[1]
        newMinter = accounts[2]
        feeManager = await FeeManager.new()
        template = await Template.new('Template', 'TEMPLATE', minter, feeManager.address)
        factory = await Factory.new(template.address, feeManager.address)
        metadataRef = "https://example.com/dataset-1"
        await factory.createToken(name, symbol, metadataRef, minter)
        tokenAddress = await factory.currentTokenAddress()
        token = await Token.at(tokenAddress)
        ethValue = new BigNumber('100000000000000000')
        cap = new BigNumber('1400000000')
    })

    it('should check that the token contract is initialized', async () => {
        const isInitialized = await token.isInitialized()
        assert(isInitialized === true)
    })

    it('should fail to re-initialize the contracts', async () => {
        truffleAssert.fails(token.initialize('NewName', 'NN', reciever, feeManager.address),
            truffleAssert.ErrorType.REVERT,
            'DataToken: token instance already initialized.')
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
            'DataToken: invalid data token minting fee')
    })

    it('should not mint the tokens due to the cap limit', async () => {
        ethValue = new BigNumber('100000000000000000')
        const one = new BigNumber('1')
        const tokenCap = cap.add(one)

        truffleAssert.fails(token.mint(reciever, tokenCap, { value: ethValue, from: minter }),
            truffleAssert.ErrorType.REVERT,
            'DataToken: cap exceeded.')
    })

    it('should not mint the tokens because of the paused contract', async () => {
        await token.pause()
        truffleAssert.fails(token.mint(reciever, 10, { value: ethValue, from: minter }),
            truffleAssert.ErrorType.REVERT,
            'DataToken: this token contract is paused.')
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

    it('should get the token cap', async () => {
        const tokenCap = await token.cap()
        assert(tokenCap.toString() === cap.toString())
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
