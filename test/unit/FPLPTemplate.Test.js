/* eslint-env mocha */
/* global artifacts, contract, it, beforeEach, web3, assert */
const Template = artifacts.require('DataTokenTemplate')
const FPLPTemplate = artifacts.require('FPLPTemplate')
const DTFactory = artifacts.require('DTFactory')
const Token = artifacts.require('DataTokenTemplate')
const testUtils = require('../helpers/utils')
const truffleAssert = require('truffle-assertions')
const BigNumber = require('bn.js')

/* FLow:
   1. Alice creates datatoken
   2. Bob creates basetoken
   3. Alice creates FPLP between datatoken and basetoken, ratio = 1
   4. Alice mints datatokens
   5. Alice approves FPLP to spend datatokens from her wallet
   6. Bob mints basetokens
   7. Bob buys datatokens using it's own basetokens (through the FPLP contract)
   */
contract('FPLPTemplate', async (accounts) => {
    let cap,
        factory,
        template,
        tokenAddress,
        alice,
        bob,
        blob,
        fplpTemplate,
        fplp,
        fplpAddress,
        basetoken,
        datatoken,
        ratio

    beforeEach('init contracts for each test', async () => {
        blob = 'https://example.com/dataset-1'
        alice = accounts[0]
        bob = accounts[1]
        cap = new BigNumber(web3.utils.toWei('1400000000'))
        template = await Template.new('Template', 'TEMPLATE', alice, cap, blob)
        basetoken = '0x985dd3d42de1e256d09e1c10f112bccb8015ad41'
        datatoken = '0x6b175474e89094c44da98b954eedeac495271d0f'
        ratio = web3.utils.toWei('1')
        fplpTemplate = await FPLPTemplate.new(alice, basetoken, datatoken, ratio)
        factory = await DTFactory.new(template.address, fplpTemplate.address)
        // Bob creates basetokens
        let trxReceipt = await factory.createToken(blob, {
            from: bob
        })
        let TokenCreatedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'TokenCreated')
        tokenAddress = TokenCreatedEventArgs.newTokenAddress
        console.log(tokenAddress)
        basetoken = await Token.at(tokenAddress)
        // ALice creates datatokens
        trxReceipt = await factory.createToken(blob, {
            from: alice
        })
        TokenCreatedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'TokenCreated')
        tokenAddress = TokenCreatedEventArgs.newTokenAddress
        console.log(tokenAddress)
        datatoken = await Token.at(tokenAddress)
        // Alice creates FPLP
        trxReceipt = await factory.createFPLP(alice, basetoken, datatoken, ratio, { from: alice })
        TokenCreatedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'FPLPCreated')
        fplpAddress = TokenCreatedEventArgs.FPLPAddress
        console.log(fplpAddress)
        fplp = await FPLPTemplate.at(fplpAddress)
    })

    it('should check that the basetoken contract is initialized', async () => {
        const isInitialized = await basetoken.isInitialized()
        assert(
            isInitialized === true,
            'Contract was not initialized correctly!'
        )
    })
    it('should check that the datatoken contract is initialized', async () => {
        const isInitialized = await datatoken.isInitialized()
        assert(
            isInitialized === true,
            'Contract was not initialized correctly!'
        )
    })
    it('should check that the FPLP contract is initialized', async () => {
        const isInitialized = await fplp.isInitialized()
        assert(
            isInitialized === true,
            'Contract was not initialized correctly!'
        )
    })

    it('Alice should mint some datatokens', async () => {
        truffleAssert.passes(await datatoken.mint(alice, 10, { from: alice }))
    })
    it('Bob should mint some basetokens', async () => {
        truffleAssert.passes(await basetoken.mint(bob, 10, { from: bob }))
    })

    it('Alice should allow FPLP contract to spend datatokens', async () => {
        truffleAssert.passes(await datatoken.approve(fplpAddress, 10, { from: alice }))
    })

    it('Bob should buy DataTokens using the FPLP contract', async () => {
        truffleAssert.passes(await fplp.buyDataTokens(web3.utils.toWei('1'), { from: bob }))
    })

    it('Bob should have 1 DT in his wallet', async () => {
        const balance = await datatoken.balanceOf(bob)
        truffleAssert.passes(balance > 0)
    })
    it('Alice should have 1 basetoken in her wallet', async () => {
        const balance = await basetoken.balanceOf(alice)
        truffleAssert.passes(balance > 0)
    })
})
