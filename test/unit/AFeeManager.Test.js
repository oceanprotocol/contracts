/* eslint-env mocha */
/* global contract, it, beforeEach, assert */

const FeeManager = artifacts.require('FeeManager')
const utils = require('../helpers/utils')
const BigNumber = require('bn.js')

contract('FeeManager', async (accounts) => {
    let feeManager,
        sender,
        web3
    beforeEach('init contracts for each test', async () => {
        sender = accounts[0]
        value = new BigNumber('100000000000000000')
        feeManager = await FeeManager.new()
        web3 = await utils.getWeb3()
    })

    it('should fee manager accept Eth', async () => {
        await feeManager.send(
            value,
            {
                from: sender
            }
        )
        await web3.eth.getBalance(feeManager.address)
            .then((balance) => {
                console.log(balance, value)
                assert(value == balance)
            })
    })
})
