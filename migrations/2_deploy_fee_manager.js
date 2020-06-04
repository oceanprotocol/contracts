/* eslint-env mocha */
/* global artifacts */

var FeeManager = artifacts.require('./FeeManager.sol')

module.exports = function(deployer) {
    // Deploy the FeeManager contract
    deployer.deploy(FeeManager)
        .then(() => FeeManager.deployed())
}
