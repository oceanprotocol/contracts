const Factory = artifacts.require('Factory')
const Template = artifacts.require('ERC20Template')
const FeeManager = artifacts.require('FeeManager')
const truffleAssert = require('truffle-assertions')

/* eslint-env mocha */
/* global artifacts, contract, it, beforeEach */

contract('Factory test', async accounts => {
    let name
    let symbol
    let zeroAddress
    let tokenAddress
    let feeManager
    let template
    let factory
    let result
    let minter

    beforeEach('init contracts for each test', async function() {
        symbol = 'TDT'
        name = 'TestDataToken'
        minter = accounts[0]
        zeroAddress = '0x0000000000000000000000000000000000000000'
        feeManager = await FeeManager.new()
        template = await Template.new('Template Contract', 'TEMPLATE', minter, feeManager.address)
        factory = await Factory.new(template.address, feeManager.address)
    })

    it('should create a token and check that it is not a zero address', async () => {
        truffleAssert.passes(
            result = await factory.createToken(name, symbol, minter)
        )
        truffleAssert.eventEmitted(result, 'TokenCreated', (ev) => {
            tokenAddress = ev.param1
            return tokenAddress !== zeroAddress
        })
    })

    it('should fail on zero address factory initialization', async () => {
        truffleAssert.fails(Factory.new(zeroAddress, feeManager.address),
            truffleAssert.ErrorType.REVERT,
            'Invalid TokenFactory initialization')
    })

    it('should fail on zero minter address initialization', async () => {
        truffleAssert.fails(Template.new('Zero address minter contract', 'ZERO', zeroAddress, feeManager.address),
            truffleAssert.ErrorType.REVERT,
            'Invalid minter:  address(0)')
    })

    it('should fail on zero feeManager address initialization', async () => {
        truffleAssert.fails(Template.new('Zero address minter contract', 'ZERO', minter, zeroAddress),
            truffleAssert.ErrorType.REVERT,
            'Invalid feeManager:  address(0)')
    })
})
