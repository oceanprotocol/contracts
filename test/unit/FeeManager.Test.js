const FeeManager = artifacts.require('FeeManager')
const BigNumber = require('bn.js')

/* eslint-env mocha */
/* global artifacts, contract, it, beforeEach, assert */

contract('FeeManager test', async accounts => {
    let feeManager

    beforeEach('init contracts for each test', async function() {
        feeManager = await FeeManager.new()
    })

    it('calculate fee', async () => {
        const gas = new BigNumber('100000000000000')
        const tokens = 1
        const fee = await feeManager.getFee(gas, tokens)
        assert(fee.toNumber() > 0)
    })
})
