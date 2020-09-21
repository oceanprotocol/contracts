/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const chai = require('chai')
const { assert } = chai
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)

const Template = artifacts.require('DataTokenTemplate')
const DTFactory = artifacts.require('DTFactory')
const Token = artifacts.require('DataTokenTemplate')
const testUtils = require('../../helpers/utils')
const truffleAssert = require('truffle-assertions')
const BigNumber = require('bn.js')
const constants = require('../../helpers/constants')

contract('DataTokenTemplate', async (accounts) => {
    let cap,
        name,
        symbol,
        decimals,
        factory,
        template,
        token,
        tokenAddress,
        ethValue,
        minter,
        newMinter,
        reciever,
        blob,
        orderTxId
    const did = '0x0000000000000000000000000000000000000000000000000000000001111111'
    const communityFeeCollector = '0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75'
    beforeEach('init contracts for each test', async () => {
        blob = 'https://example.com/dataset-1'
        decimals = 18
        minter = accounts[0]
        reciever = accounts[1]
        newMinter = accounts[2]
        cap = new BigNumber('1400000000')
        template = await Template.new('Template', 'TEMPLATE', minter, cap, blob, communityFeeCollector)
        factory = await DTFactory.new(
            template.address,
            communityFeeCollector
        )
        blob = 'https://example.com/dataset-1'
        const trxReceipt = await factory.createToken(blob, 'DT1', 'DT1', web3.utils.toWei('1000000'))
        const TokenCreatedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'TokenCreated')
        tokenAddress = TokenCreatedEventArgs.newTokenAddress
        token = await Token.at(tokenAddress)
        symbol = await token.symbol()
        name = await token.name()
        cap = await token.cap()
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
        truffleAssert.fails(token.initialize('NewName', 'NN', reciever, cap, blob, communityFeeCollector),
            truffleAssert.ErrorType.REVERT,
            'DataTokenTemplate: token instance already initialized')
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
        const isPausedTrue = await token.isPaused()
        assert(isPausedTrue === true)
        await token.unpause({ from: minter })
        const isPausedFalse = await token.isPaused()
        assert(isPausedFalse === false)
    })

    it('should set a new minter', async () => {
        await token.setMinter(newMinter)
        const isMinter = await token.isMinter(newMinter)
        assert(isMinter === true)
    })

    it('should not mint the tokens because of the paused contract', async () => {
        await token.pause({ from: minter })
        truffleAssert.fails(token.mint(reciever, 10, { value: ethValue, from: minter }))
        await token.unpause({ from: minter })
    })

    it('should mint the tokens', async () => {
        const mintedTokens = 10
        truffleAssert.passes(await token.mint(reciever, mintedTokens, { from: minter }))
        const recieverBalance = await token.balanceOf(reciever)
        assert(mintedTokens === recieverBalance.toNumber())
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
        truffleAssert.passes(await token.mint(minter, 10, { from: minter }))
        truffleAssert.passes(await token.transfer(reciever, 1, { from: minter }))
    })

    it('should transfer token tokens to another address', async () => {
        truffleAssert.passes(await token.mint(minter, 10, { from: minter }))
        truffleAssert.passes(await token.approve(reciever, 10, { from: minter }))
        truffleAssert.passes(await token.transferFrom(minter, reciever, 1, { from: reciever }))
    })

    it('should get the total cap', async () => {
        await token.cap()
    })

    it('should get blob', async () => {
        const _blob = await token.blob()
        assert.equal(
            _blob,
            blob
        )
    })
    it('should accept zero marketplace fee', async () => {
        const consumer = accounts[6]
        const marketAddress = constants.address.zero
        const orderDTTokensAmount = 2
        const serviceId = 1
        await token.mint(consumer, 20, { from: minter })
        await token.startOrder(
            orderDTTokensAmount,
            did,
            serviceId,
            marketAddress,
            {
                from: consumer
            }
        )
    })
    it('should start order', async () => {
        const consumer = accounts[9]
        const marketAddress = accounts[7]
        const orderDTTokensAmount = 10
        const serviceId = 1
        const minterBalanceBefore = (await token.balanceOf(minter)).toNumber()
        truffleAssert.passes(await token.mint(consumer, orderDTTokensAmount, { from: minter }))
        orderTxId = await token.startOrder(
            orderDTTokensAmount,
            did,
            serviceId,
            marketAddress,
            {
                from: consumer
            }
        )
        assert(
            minterBalanceBefore < (await token.balanceOf(minter)).toNumber()
        )
    })
    it('should finish order', async () => {
        const consumer = accounts[9]
        const provider = accounts[8]
        const restOfDTTokensAmount = 2
        const serviceId = 1
        truffleAssert.passes(await token.mint(provider, restOfDTTokensAmount, { from: minter }))
        const trxReceipt = await token.finishOrder(
            orderTxId.receipt.transactionHash,
            consumer,
            restOfDTTokensAmount,
            did,
            serviceId,
            {
                from: provider
            }
        )
        const OrderFinishedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'OrderFinished')
        assert(
            (await token.balanceOf(consumer)).toNumber() === (OrderFinishedEventArgs.amount).toNumber()
        )
    })
    it('should calculate total fee', async () => {
        const communityFee = await token.calculateFee(
            30000000,
            web3.utils.toWei('0.001')
        )
        const marketFee = await token.calculateFee(
            30000000,
            web3.utils.toWei('0.001')
        )

        assert(
            marketFee.toNumber() === communityFee.toNumber()
        )
    })
})
