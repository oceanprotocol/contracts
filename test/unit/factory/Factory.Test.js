/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach, assert */

const DTFactory = artifacts.require('DTFactory')
const Template = artifacts.require('DataTokenTemplate')
const truffleAssert = require('truffle-assertions')

contract('Factory test', async accounts => {
    let zeroAddress
    let tokenAddress
    let template
    let factory
    let result
    let minter
    let blob
    let cap
    const communityFeeCollector = '0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75'
    beforeEach('init contracts for each test', async function() {
        blob = 'https://example.com/dataset-1'
        minter = accounts[0]
        zeroAddress = '0x0000000000000000000000000000000000000000'
        cap = 1400000000
        template = await Template.new('Template Contract', 'TEMPLATE', minter, cap, blob, communityFeeCollector)
        factory = await DTFactory.new(template.address, communityFeeCollector)
    })

    it('should create a token and check that it is not a zero address', async () => {
        truffleAssert.passes(
            result = await factory.createToken(
                blob, '99-Datatoken', '99-Datatoken', web3.utils.toWei('1000000'),
                {
                    from: minter
                }
            )
        )
        truffleAssert.eventEmitted(result, 'TokenCreated', (ev) => {
            tokenAddress = ev.param1
            return tokenAddress !== zeroAddress
        })
    })

    it('should fail on zero template address factory initialization', async () => {
        truffleAssert.fails(DTFactory.new(zeroAddress, communityFeeCollector),
            truffleAssert.ErrorType.REVERT,
            'DTFactory: Invalid token factory initialization'
        )
    })

    it('should fail on zero minter address initialization', async () => {
        truffleAssert.fails(Template.new('Zero address minter contract', 'ZERO', zeroAddress, cap, blob, communityFeeCollector),
            truffleAssert.ErrorType.REVERT,
            'DataTokenTemplate: Invalid minter,  zero address'
        )
    })

    it('should get the token count', async () => {
        const currentTokenIndex = await factory.getCurrentTokenIndex()
        assert.equal(currentTokenIndex.toNumber(), 1)
    })

    it('should get the token template', async () => {
        const tokenTemplate = await factory.getTokenTemplate()
        assert.equal(template.address, tokenTemplate)
    })
})
