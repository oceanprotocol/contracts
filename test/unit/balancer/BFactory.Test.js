/* eslint-env mocha */
/* global artifacts, contract, it, assert */
const BPool = artifacts.require('BPool')
const BFactory = artifacts.require('BFactory')
const testUtils = require('../../helpers/utils')

contract('BFactory', async (accounts) => {
    describe('BFactory Tests', () => {
        let factory
        let poolTemplate
        const admin = accounts[0]
        before(async () => {
            poolTemplate = await BPool.new()
            factory = await BFactory.new(poolTemplate.address, [])
        })

        it('should create new BPool', async () => {
            const txReceipt = await factory.newBPool({ from: admin })
            const sPoolEventArgs = testUtils.getEventArgsFromTx(txReceipt, 'BPoolCreated')
            assert(poolTemplate, sPoolEventArgs._bpoolTemplate)
        })

        it('should get BPool', async () => {
            const bPoolTemplate = await factory.bpoolTemplate()
            assert(poolTemplate, bPoolTemplate)
        })
    })
})
