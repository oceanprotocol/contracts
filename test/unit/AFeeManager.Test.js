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
        zeroBalance,
        invalidOwner,
        baseTxCost,
        base,
        mintedTokens,
        mintedTokenRange,
        capRange,
        cap

    beforeEach('init contracts for each test', async () => {
        owner = accounts[0]
        sender = accounts[1]
        value = 1000000000000000000
        zeroBalance = 0
        invalidOwner = accounts[3]
        base = 10
        baseTxCost = 44000
        mintedTokens = 1000000000000
        capRange = 14
        cap = 100000000000000
        mintedTokenRange = 12
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

    it('should non-owner(s) fail(s) to withdraw', async () => {
        await feeManager.send(
            value,
            {
                from: sender
            }
        )

        await assert.isRejected(
            feeManager.withdraw(
                {
                    from: invalidOwner
                }
            ),
            'Ownable: caller is not the owner'
        )
    })

    it('should owner fail to withdraw zero balance', async () => {
        await assert.isRejected(
            feeManager.withdraw(
                {
                    from: owner
                }
            ),
            'FeeManager: Zero balance'
        )
    })

    it('should calculate right range', async () => {
        assert.equal(
            await feeManager.calculateRange(
                mintedTokens
            ),
            mintedTokenRange
        )
    })

    it('should calculate right fee', async () => {
        const expectedFee = Math.floor((mintedTokenRange * baseTxCost) / (capRange * base))
        const actualFee = await feeManager.calculateFee(
            mintedTokens,
            cap
        )

        assert.equal(
            expectedFee,
            actualFee.toNumber()
        )
    })
})
