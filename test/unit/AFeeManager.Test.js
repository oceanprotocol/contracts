/* eslint-env mocha */
/* global contract, it, beforeEach, artifacts */

const chai = require('chai')
const { assert } = chai
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
const FeeManager = artifacts.require('FeeManager')
const utils = require('../helpers/utils')

contract('FeeManager', async (accounts) => {
    let feeManager,
        sender,
        owner,
        web3,
        value,
        zeroBalance

    beforeEach('init contracts for each test', async () => {
        owner = accounts[0]
        sender = accounts[1]
        value = 1000000000000000000
        zeroBalance = 0
        feeManager = await FeeManager.new({ from: owner })
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
                assert(balance, value)
            })
    })

    it('should owner withdraw Eth from fee manager contract', async () => {
        await feeManager.send(
            value,
            {
                from: sender
            }
        )
        await feeManager.withdraw(
            {
                from: owner
            }
        )

        assert.equal(
            await web3.eth.getBalance(feeManager.address),
            zeroBalance
        )
    })
})
