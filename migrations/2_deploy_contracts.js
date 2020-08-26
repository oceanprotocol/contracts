/* eslint-env mocha */
/* global artifacts */
var DataTokenTemplate = artifacts.require('./DataTokenTemplate.sol')
var DTFactory = artifacts.require('./DTFactory.sol')
var SPool = artifacts.require('./SPool.sol')
var SFactory = artifacts.require('./SFactory.sol')
var DDO = artifacts.require('./DDO.sol')
var FixedRateExchange = artifacts.require('./FixedRateExchange.sol')
// dummy communityFeeCollector, replace with real wallet/owner
const communityFeeCollector = '0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75'

module.exports = function(deployer, network, accounts) {
    deployer.then(async () => {
        await deployer.deploy(
            DataTokenTemplate,
            'DataTokenTemplate',
            'DTT',
            accounts[0],
            10000000,
            'http://oceanprotocol.com',
            communityFeeCollector
        )
        await deployer.deploy(
            DTFactory,
            DataTokenTemplate.address,
            communityFeeCollector
        )

        await deployer.deploy(
            SPool
        )

        await deployer.deploy(
            SFactory,
            SPool.address
        )

        await deployer.deploy(
            FixedRateExchange
        )

        await deployer.deploy(
            DDO
        )
    })
}
