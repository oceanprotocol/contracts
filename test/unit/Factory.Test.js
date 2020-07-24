/* eslint-env mocha */
/* global artifacts, contract, it, beforeEach, assert */

const DTFactory = artifacts.require('DTFactory')
const Template = artifacts.require('DataTokenTemplate')
const FPLPTemplate = artifacts.require('FPLPTemplate')
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
    let basetoken
    let datatoken
    let ratio
    let fplp

    beforeEach('init contracts for each test', async function() {
        blob = 'https://example.com/dataset-1'
        minter = accounts[0]
        zeroAddress = '0x0000000000000000000000000000000000000000'
        cap = 1400000000
        template = await Template.new('Template Contract', 'TEMPLATE', minter, cap, blob)
        basetoken = '0x985dd3d42de1e256d09e1c10f112bccb8015ad41'
        datatoken = '0x6b175474e89094c44da98b954eedeac495271d0f'
        ratio = 1
        fplp = await FPLPTemplate.new(minter, basetoken, datatoken, ratio)
        factory = await DTFactory.new(template.address, fplp.address)
    })

    it('should create a token and check that it is not a zero address', async () => {
        truffleAssert.passes(
            result = await factory.createToken(
                blob,
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
        truffleAssert.fails(DTFactory.new(zeroAddress, fplp.address),
            truffleAssert.ErrorType.REVERT,
            'DTFactory: Invalid token factory initialization'
        )
    })
    it('should fail on zero fplp address factory initialization', async () => {
        truffleAssert.fails(DTFactory.new(template.address, zeroAddress),
            truffleAssert.ErrorType.REVERT,
            'DTFactory: Invalid token factory initialization'
        )
    })

    it('should fail on zero minter address initialization', async () => {
        truffleAssert.fails(Template.new('Zero address minter contract', 'ZERO', zeroAddress, cap, blob),
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
