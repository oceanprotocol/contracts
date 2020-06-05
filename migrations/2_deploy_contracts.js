/* eslint-env mocha */
/* global artifacts */
var FeeManager = artifacts.require('./FeeManager.sol')
var DataTokenTemplate = artifacts.require('./DataTokenTemplate.sol')
var Factory = artifacts.require('./Factory.sol')

module.exports = function(deployer, network, accounts) {
    //deployer.deploy(FeeManager)
    deployer.then(async () => {
        await deployer.deploy(FeeManager);
        await deployer.deploy(
            DataTokenTemplate,
            'DataTokenTemplate',
            'DTT',
            accounts[0],
            10000000,
            'http://oceanprotocol.com',
            FeeManager.address
        )
        await deployer.deploy(
            Factory,
            DataTokenTemplate.address,
            FeeManager.address
        )
    });
}

