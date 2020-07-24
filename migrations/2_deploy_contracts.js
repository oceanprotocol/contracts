/* eslint-env mocha */
/* global artifacts */
var DataTokenTemplate = artifacts.require('./DataTokenTemplate.sol')
var FPLPTemplate = artifacts.require('./FPLPTemplate.sol')
var DTFactory = artifacts.require('./DTFactory.sol')
var SPool = artifacts.require('./SPool.sol')
var SFactory = artifacts.require('./SFactory.sol')

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
            FPLPTemplate,
            accounts[0],
            accounts[1],
            accounts[2],
            1
        )
        await deployer.deploy(
            DTFactory,
            DataTokenTemplate.address,
            FPLPTemplate.address
        )
        await deployer.deploy(
            SPool
        )

        await deployer.deploy(
            SFactory,
            SPool.address
        )
    })
}
