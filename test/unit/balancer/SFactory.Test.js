/* eslint-env mocha */
/* global artifacts, contract, it, assert */
const BPool = artifacts.require('SPool')
const BFactory = artifacts.require('SFactory')
const testUtils = require('../../helpers/utils')

contract('SFactory', async (accounts) => {
    describe('SFactory Tests', () => {
        let factory
        let poolTemplate
        const admin = accounts[0]
        before(async () => {
            poolTemplate = await BPool.new()
            factory = await BFactory.new(poolTemplate.address)
        })

        it('should create new SPool', async () => {
            const txReceipt = await factory.newSPool({ from: admin })
            const sPoolEventArgs = testUtils.getEventArgsFromTx(txReceipt, 'SPoolCreated')
            assert(poolTemplate, sPoolEventArgs._spoolTemplate)
        })

        it('should get SPool', async () => {
            const sPoolTemplate = await factory.getSPool()
            assert(poolTemplate, sPoolTemplate)
        })
    })
})
