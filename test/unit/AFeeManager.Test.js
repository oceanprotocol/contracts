/* eslint-env mocha */
/* global contract, it, beforeEach, assert, artifacts */

const FeeManager = artifacts.require('FeeManager')
const utils = require('../helpers/utils')
const BigNumber = require('bn.js')

contract('FeeManager', async (accounts) => {
    let feeManager,
        sender,
        owner,
        web3,
        value
    beforeEach('init contracts for each test', async () => {
        owner = accounts[0]
        sender = accounts[1]
        value = new BigNumber('5000000000000000000')
        feeManager = await FeeManager.new({from: owner})
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
                assert(new BigNumber(balance), value)
            })
    })

    it('should owner withdraw Eth from fee manager contract', async() => {
        let ownerBalanceAfter, 
        ownerBalanceBefore
        await web3.eth.getBalance(owner)
        .then((ownerBalance) => {
            ownerBalanceBefore = ownerBalance
        })
        
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
        await web3.eth.getBalance(owner)
        .then((ownerBalance) => {
            ownerBalanceAfter = ownerBalance
        })
        
        assert(
            new BigNumber(ownerBalanceBefore) < new BigNumber(ownerBalanceAfter)
        )
    })
})
