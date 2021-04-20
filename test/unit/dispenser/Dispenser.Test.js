/* eslint-env mocha */
/* global artifacts, contract, it, before, web3 */
const Template = artifacts.require('DataTokenTemplate')
const Dispenser = artifacts.require('Dispenser')
const DTFactory = artifacts.require('DTFactory')
const Token = artifacts.require('DataTokenTemplate')
const testUtils = require('../../helpers/utils')
const truffleAssert = require('truffle-assertions')
const BigNumber = require('bn.js')
const chai = require('chai')
const { assert } = chai

contract('Dispenser', async (accounts) => {
    let cap,
        factory,
        template,
        blob,
        alice,
        bob,
        charlie,
        datatoken1,
        datatoken2,
        datatoken3,
        dispenser

    before('Alice creates datatokens', async () => {
        blob = 'https://example.com/dataset-1'
        alice = accounts[0]
        bob = accounts[1]
        charlie = accounts[2]
        cap = new BigNumber(web3.utils.toWei('1400000000'))
        const communityFeeCollector = '0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75'
        template = await Template.new('Template', 'TEMPLATE', alice, cap, blob, communityFeeCollector)
        dispenser = await Dispenser.new()
        factory = await DTFactory.new(template.address, communityFeeCollector)
        // ALice creates datatokens
        let trxReceipt, TokenCreatedEventArgs
        trxReceipt = await factory.createToken(blob, 'DT1', 'DT1', web3.utils.toWei('1000000'), {
            from: alice
        })
        TokenCreatedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'TokenCreated')
        datatoken1 = TokenCreatedEventArgs.newTokenAddress
        trxReceipt = await factory.createToken(blob, 'DT2', 'DT2', web3.utils.toWei('1000000'), {
            from: alice
        })
        TokenCreatedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'TokenCreated')
        datatoken2 = TokenCreatedEventArgs.newTokenAddress
        trxReceipt = await factory.createToken(blob, 'DT3', 'DT3', web3.utils.toWei('1000000'), {
            from: alice
        })
        TokenCreatedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'TokenCreated')
        datatoken3 = TokenCreatedEventArgs.newTokenAddress
    })
    it('Alice creates a dispenser with minter role', async () => {
        let tx = await dispenser.activate(datatoken1, web3.utils.toWei('1'), web3.utils.toWei('1'))
        assert(tx,
            'Cannot activate dispenser')
        const dt = await Token.at(datatoken1)
        tx = await dt.proposeMinter(dispenser.address, { from: alice })
        tx = await dispenser.acceptMinter(datatoken1)
        assert(tx,
            'Cannot make dispenser a minter')
    })
    it('Alice gets the dispenser status', async () => {
        const status = await dispenser.status(datatoken1)
        assert(status.active === true, 'Dispenser not active')
        assert(status.owner === alice, 'Dispenser owner is not alice')
        assert(status.minterApproved === true, 'Dispenser is not a minter')
    })

    it('Bob requests more datatokens then allowed', async () => {
        truffleAssert.fails(dispenser.dispense(datatoken1, web3.utils.toWei('10'), {
            from: bob
        }), truffleAssert.ErrorType.REVERT, 'Amount too high')
    })
    it('Bob requests datatokens', async () => {
        const tx = await dispenser.dispense(datatoken1, web3.utils.toWei('1'), {
            from: bob
        })
        assert(tx,
            'Bob failed to get 1DT')
    })
    it('Bob requests more datatokens but he exceeds maxBalance', async () => {
        truffleAssert.fails(dispenser.dispense(datatoken1, web3.utils.toWei('1'), {
            from: bob
        }), truffleAssert.ErrorType.REVERT, 'Caller balance too high')
    })
    it('Alice deactivates the dispenser', async () => {
        await dispenser.deactivate(datatoken1)
        const status = await dispenser.status(datatoken1)
        assert(status.active === false, 'Dispenser is still active')
    })
    it('Charlie should fail to get datatokens', async () => {
        truffleAssert.fails(dispenser.dispense(datatoken1, web3.utils.toWei('1'), {
            from: charlie
        }), truffleAssert.ErrorType.REVERT, 'Dispenser not active')
    })
    it('Alice calls removeMinter role and checks if she is the new minter', async () => {
        const dt = await Token.at(datatoken1)
        await dispenser.removeMinter(datatoken1, { from: alice })
        await dt.approveMinter({ from: alice })
        const status = await dispenser.status(datatoken1)
        assert(status.minterApproved === false, 'Dispenser is still a minter')
        assert(status.owner === alice, 'Dispenser is not owned by Alice')
        const isMinter = await dt.isMinter(alice)
        assert(isMinter === true, 'ALice is not the minter')
    })
    it('Bob should fail to activate a dispenser for a token for he is not a mineter', async () => {
        truffleAssert.fails(dispenser.activate(datatoken3, web3.utils.toWei('1'), web3.utils.toWei('1'), {
            from: bob
        }), truffleAssert.ErrorType.REVERT, 'Sender does not have the minter role')
    })
    it('Alice creates a dispenser without minter role', async () => {
        const tx = await dispenser.activate(datatoken2, web3.utils.toWei('1'), web3.utils.toWei('1'))
        assert(tx,
            'Cannot activate dispenser')
    })
    it('Bob requests datatokens but there are none', async () => {
        truffleAssert.fails(dispenser.dispense(datatoken2, web3.utils.toWei('1'), {
            from: bob
        }), truffleAssert.ErrorType.REVERT, 'Not enough reserves')
    })
    it('Alice mints tokens and transfer them to the dispenser.', async () => {
        const dt = await Token.at(datatoken2)
        truffleAssert.passes(await dt.mint(dispenser.address, web3.utils.toWei('10'), { from: alice }))
        const status = await dispenser.status(datatoken2)
        const contractBalance = web3.utils.fromWei(status.balance)
        const balance = web3.utils.fromWei(await dt.balanceOf(dispenser.address))
        assert(contractBalance === balance, 'Balances do not match')
    })
    it('Bob requests datatokens', async () => {
        const tx = await dispenser.dispense(datatoken2, web3.utils.toWei('1'), {
            from: bob
        })
        assert(tx,
            'Bob failed to get 1DT')
    })
    it('Bob tries to withdraw all datatokens', async () => {
        truffleAssert.fails(dispenser.ownerWithdraw(datatoken2, {
            from: bob
        }), truffleAssert.ErrorType.REVERT, 'Invalid owner')
    })
    it('Alice withdraws all datatokens', async () => {
        const tx = await dispenser.ownerWithdraw(datatoken2, {
            from: alice
        })
        assert(tx,
            'ALice failed to withdraw all datatokens')
        const status = await dispenser.status(datatoken2)
        const contractBalance = web3.utils.fromWei(status.balance)
        assert(contractBalance === '0', 'Balance > 0')
    })
})
