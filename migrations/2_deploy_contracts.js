/* eslint-env mocha */
/* global artifacts */
var DataTokenTemplate = artifacts.require('./DataTokenTemplate.sol')
var Factory = artifacts.require('./Factory.sol')

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
            Factory,
            DataTokenTemplate.address
        )
    })
}
