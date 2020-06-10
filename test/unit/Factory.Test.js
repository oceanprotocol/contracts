/* eslint-env mocha */
/* global artifacts, contract, it, beforeEach */

const Factory = artifacts.require('Factory')
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

    beforeEach('init contracts for each test', async function() {
        blob = 'https://example.com/dataset-1'
        minter = accounts[0]
        zeroAddress = '0x0000000000000000000000000000000000000000'
        cap = 1400000000
        template = await Template.new('Template Contract', 'TEMPLATE', minter, cap, blob)
        factory = await Factory.new(template.address)
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

    it('should fail on zero address factory initialization', async () => {
        truffleAssert.fails(Factory.new(zeroAddress),
            truffleAssert.ErrorType.REVERT,
            'Factory: Invalid TokenFactory initialization'
        )
    })

    it('should fail on zero minter address initialization', async () => {
        truffleAssert.fails(Template.new('Zero address minter contract', 'ZERO', zeroAddress, cap, blob),
            truffleAssert.ErrorType.REVERT,
            'DataTokenTemplate: Invalid minter,  zero address'
        )
    })
})
