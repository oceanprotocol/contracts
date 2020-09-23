/* eslint-env mocha */
/* global artifacts, contract, it, before, web3 */
const Template = artifacts.require('DataTokenTemplate')
const FixedRateExchange = artifacts.require('FixedRateExchange')
const DTFactory = artifacts.require('DTFactory')
const Token = artifacts.require('DataTokenTemplate')
const testUtils = require('../../helpers/utils')
const truffleAssert = require('truffle-assertions')
const BigNumber = require('bn.js')
const chai = require('chai')
const { assert } = chai

/* FLow:
   1. Alice creates datatoken
   2. Bob creates basetoken
   3. Alice creates FixedRateExchange between datatoken and basetoken, ratio = 1
   4. Alice mints datatokens
   5. Alice approves FPLP to spend datatokens from her wallet
   6. Bob mints basetokens
   7. Bob buys datatokens using it's own basetokens (through the FPLP contract)
   8. Alice changes the exchange rate to 2
   9. Bob buys datatokens with the new ex rate using it's own basetokens (through the FPLP contract)
   */
contract('FixedRateExchange', async (accounts) => {
    let cap,
        factory,
        template,
        tokenAddress,
        alice,
        exchangeOwner,
        bob,
        blob,
        basetoken,
        datatoken,
        fixedRateExchange,
        rate,
        ExchangeCreatedEventArgs,
        approvedDataTokens,
        approvedBaseTokens
    const amountOfMintedTokens = 10

    before('init contracts for each test', async () => {
        blob = 'https://example.com/dataset-1'
        alice = accounts[0]
        bob = accounts[1]
        cap = new BigNumber(web3.utils.toWei('1400000000'))
        exchangeOwner = alice
        const communityFeeCollector = '0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75'
        template = await Template.new('Template', 'TEMPLATE', alice, cap, blob, communityFeeCollector)
        rate = web3.utils.toWei('1')
        fixedRateExchange = await FixedRateExchange.new()
        factory = await DTFactory.new(template.address, communityFeeCollector)
        // Bob creates basetokens
        let trxReceipt = await factory.createToken(blob, 'DT1', 'DT1', web3.utils.toWei('1000000'), {
            from: bob
        })
        let TokenCreatedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'TokenCreated')
        tokenAddress = TokenCreatedEventArgs.newTokenAddress
        basetoken = await Token.at(tokenAddress)
        // ALice creates datatokens
        trxReceipt = await factory.createToken(blob, 'DT2', 'DT2', web3.utils.toWei('1000000'), {
            from: alice
        })
        TokenCreatedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'TokenCreated')
        tokenAddress = TokenCreatedEventArgs.newTokenAddress
        datatoken = await Token.at(tokenAddress)
        // Alice creates fixed rate exchange
        trxReceipt = await fixedRateExchange.create(basetoken.address, datatoken.address, rate, { from: exchangeOwner })
        ExchangeCreatedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'ExchangeCreated')

        assert(
            ExchangeCreatedEventArgs.exchangeOwner === exchangeOwner,
            'Invalid exchange owner'
        )
    })
    it('should check that the basetoken contract is initialized', async () => {
        const isInitialized = await basetoken.isInitialized()
        assert(
            isInitialized === true,
            'Contract was not initialized correctly!'
        )
    })
    it('should check that the datatoken contract is initialized', async () => {
        const isInitialized = await datatoken.isInitialized()
        assert(
            isInitialized === true,
            'Contract was not initialized correctly!'
        )
    })
    it('should check that the fixed rate exchange is activated', async () => {
        const isActive = await fixedRateExchange.isActive(ExchangeCreatedEventArgs.exchangeId)
        assert(
            isActive === true,
            'Exchange was not activated correctly!'
        )
    })
    it('should check that the exchange has no supply yet', async () => {
        const exchangeDetails = await fixedRateExchange.getExchange(ExchangeCreatedEventArgs.exchangeId)
        const supply = web3.utils.fromWei(exchangeDetails.supply)
        assert(
            supply === '0',
            'Exchange has supply !=0'
        )
    })
    it('Alice should mint some datatokens', async () => {
        truffleAssert.passes(await datatoken.mint(alice, amountOfMintedTokens, { from: alice }))
    })
    it('Bob should mint some basetokens, bob allows marketplace withdrawal', async () => {
        truffleAssert.passes(await basetoken.mint(bob, amountOfMintedTokens, { from: bob }))
        approvedBaseTokens = 1
        await basetoken.approve(fixedRateExchange.address, approvedBaseTokens, { from: bob })
    })

    it('Alice should allow fixed rate contract to spend datatokens', async () => {
        approvedDataTokens = 1
        truffleAssert.passes(await datatoken.approve(fixedRateExchange.address, approvedDataTokens, { from: alice }))
    })
    it('should check that the exchange has supply', async () => {
        const exchangeDetails = await fixedRateExchange.getExchange(ExchangeCreatedEventArgs.exchangeId)
        const supply = web3.utils.fromWei(exchangeDetails.supply)
        assert(
            supply !== '0',
            'Exchange has no supply!'
        )
    })
    it('should able to generate exchange id using both baseToken and dataToken', async () => {
        assert(
            ExchangeCreatedEventArgs.exchangeId ===
            await fixedRateExchange.generateExchangeId(
                basetoken.address,
                datatoken.address,
                exchangeOwner
            )
        )
    })

    it('should get the exchange rate', async () => {
        assert(
            web3.utils.toWei(
                web3.utils.fromWei(await fixedRateExchange.getRate(ExchangeCreatedEventArgs.exchangeId))
            ) === rate
        )
    })

    it('should exchange owner able to deactivate', async () => {
        const isActive = await fixedRateExchange.isActive(ExchangeCreatedEventArgs.exchangeId)
        if (isActive === false) {
            // change it to true (deactivate)
            await fixedRateExchange.toggle(
                ExchangeCreatedEventArgs.exchangeId,
                {
                    from: exchangeOwner
                }
            )
        }
        await fixedRateExchange.toggle(
            ExchangeCreatedEventArgs.exchangeId,
            {
                from: exchangeOwner
            }
        ).then(async () => {
            assert(
                await fixedRateExchange.isActive(ExchangeCreatedEventArgs.exchangeId) ===
                false
            )
        })
    })

    it('should exchange owner able to activate', async () => {
        const isActive = await fixedRateExchange.isActive(ExchangeCreatedEventArgs.exchangeId)
        if (isActive) {
            // change it to false (deactivate)
            await fixedRateExchange.toggle(
                ExchangeCreatedEventArgs.exchangeId,
                {
                    from: exchangeOwner
                }
            )
        }
        await fixedRateExchange.toggle(
            ExchangeCreatedEventArgs.exchangeId,
            {
                from: exchangeOwner
            }
        ).then(async () => {
            assert(
                await fixedRateExchange.isActive(ExchangeCreatedEventArgs.exchangeId) ===
                true
            )
        })
    })

    it('Bob should buy DataTokens using the fixed rate exchange contract', async () => {
        await fixedRateExchange.swap(
            ExchangeCreatedEventArgs.exchangeId,
            1,
            {
                from: bob
            }
        ).then(async (txReceipt) => {
            const SwappedEventArgs = testUtils.getEventArgsFromTx(txReceipt, 'Swapped')
            assert(
                SwappedEventArgs.dataTokenSwappedAmount.toNumber() ===
                (await datatoken.balanceOf(bob)).toNumber(),
                'Faild to swap base tokens to base tokens'
            )
            assert(
                SwappedEventArgs.baseTokenSwappedAmount.toNumber() ===
                (await basetoken.balanceOf(exchangeOwner)).toNumber(),
                'Faild to swap data tokens to base tokens'
            )
        })
    })
    it('Exchange owner should change the rate using the fixedRateExchange contract', async () => {
        rate = web3.utils.toWei('2')
        await fixedRateExchange.setRate(
            ExchangeCreatedEventArgs.exchangeId,
            rate,
            {
                from: exchangeOwner
            }
        )
    })
    it('should get the new fixed exchange rate', async () => {
        const newRate = await fixedRateExchange.getRate(
            ExchangeCreatedEventArgs.exchangeId
        )
        assert(
            web3.utils.fromWei(newRate) === web3.utils.fromWei(rate)
        )
    })
    it('Bob should buy DataTokens using the fixed rate exchange contract', async () => {
        approvedBaseTokens = 2
        await basetoken.approve(fixedRateExchange.address, approvedBaseTokens, { from: bob })
        approvedDataTokens = 1
        await datatoken.approve(fixedRateExchange.address, approvedDataTokens, { from: exchangeOwner })

        await fixedRateExchange.swap(
            ExchangeCreatedEventArgs.exchangeId,
            1,
            {
                from: bob
            }
        ).then(async () => {
            assert((await datatoken.balanceOf(bob)).toNumber() === approvedDataTokens + 1)
            assert((await basetoken.balanceOf(exchangeOwner)).toNumber() === approvedBaseTokens + 1)
        })
    })
    it('should get the number of exchanges', async () => {
        assert(
            (await fixedRateExchange.getNumberOfExchanges()).toNumber() === 1,
            'faild to get number of exchanges'
        )
    })
    it('should get exchange information', async () => {
        const exchange = await fixedRateExchange.getExchange(
            ExchangeCreatedEventArgs.exchangeId
        )
        assert(
            exchange.exchangeOwner === exchangeOwner
        )
        assert(
            exchange.dataToken === datatoken.address
        )
        assert(
            exchange.baseToken === basetoken.address
        )
        assert(
            web3.utils.fromWei(exchange.fixedRate) === web3.utils.fromWei(rate)
        )
        assert(
            exchange.active === true
        )
    })
    it('should get all exchange IDs', async () => {
        assert(
            (await fixedRateExchange.getExchanges()).length === 1
        )
    })
    it('should fail to create exchange with non-ERC20 compatiable token', async () => {
        const invalidERC20Token = accounts[4]
        await assert.isRejected(
            fixedRateExchange.create(basetoken.address, invalidERC20Token, rate, { from: exchangeOwner })
        )
    })
    it('should fail to create the same exchange by the same user', async () => {
        await assert.isRejected(
            fixedRateExchange.create(basetoken.address, datatoken.address, rate, { from: exchangeOwner })
        )
    })
    it('should fail to create new exchange with zero rate', async () => {
        const zeroRate = 0
        const newExchangeOwner = accounts[9]
        await assert.isRejected(
            fixedRateExchange.create(basetoken.address, datatoken, zeroRate, { from: newExchangeOwner })
        )
    })
})
