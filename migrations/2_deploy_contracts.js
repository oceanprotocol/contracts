/* eslint-env mocha */
/* global artifacts */
var DataTokenTemplate = artifacts.require('./DataTokenTemplate.sol')
var DTFactory = artifacts.require('./DTFactory.sol')
var BPool = artifacts.require('./BPool.sol')
var BFactory = artifacts.require('./BFactory.sol')
var FixedRateExchange = artifacts.require('./FixedRateExchange.sol')

module.exports = function(deployer, network, accounts) {
    deployer.then(async () => {
        await deployer.deploy(
            DataTokenTemplate,
            'DataTokenTemplate',
            'DTT',
            accounts[0],
            10000000,
            'http://oceanprotocol.com'
        )
        await deployer.deploy(
            DTFactory,
            DataTokenTemplate.address
        )
        await deployer.deploy(
            BPool
        )

        await deployer.deploy(
            BFactory,
            BPool.address
        )

        await deployer.deploy(
            FixedRateExchange
        )
    })
}
