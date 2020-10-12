/* eslint-env mocha */
/* global artifacts */
const fs = require('fs')
var DataTokenTemplate = artifacts.require('./DataTokenTemplate.sol')
var DTFactory = artifacts.require('./DTFactory.sol')
var BPool = artifacts.require('./BPool.sol')
var BFactory = artifacts.require('./BFactory.sol')
var Metadata = artifacts.require('./Metadata.sol')
var FixedRateExchange = artifacts.require('./FixedRateExchange.sol')
var OPFCommunityFeeCollector = artifacts.require('./OPFCommunityFeeCollector.sol')
// dummy communityFeeCollector, replace with real wallet/owner
const communityCollector = '0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75'
const OPFOwner = '0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75'
module.exports = function(deployer, network, accounts) {
    deployer.then(async () => {
        const addressFile = './artifacts/address.json'
        const oldAddresses = JSON.parse(fs.readFileSync(addressFile))
        const networkName = process.env.NETWORK
        if (!oldAddresses[networkName]) {
            oldAddresses[networkName] = {}
        }
        const addresses = oldAddresses[networkName]

        await deployer.deploy(
            OPFCommunityFeeCollector,
            communityCollector,
            OPFOwner
        )
        await deployer.deploy(
            DataTokenTemplate,
            'DataTokenTemplate',
            'DTT',
            accounts[0],
            10000000,
            'http://oceanprotocol.com',
            OPFCommunityFeeCollector.address
        )
        await deployer.deploy(
            DTFactory,
            DataTokenTemplate.address,
            OPFCommunityFeeCollector.address
        )
        addresses.DTFactory = DTFactory.address
        await deployer.deploy(
            BPool
        )
        await deployer.deploy(
            BFactory,
            BPool.address
        )
        addresses.BFactory = BFactory.address
        await deployer.deploy(
            FixedRateExchange
        )
        addresses.FixedRateExchange = FixedRateExchange.address
        await deployer.deploy(
            Metadata
        )
        addresses.Metadata = Metadata.address

        if (networkName === 'development' || networkName === 'ganache') {
            addresses.Ocean = DataTokenTemplate.address
        }
        console.info('writing address.json file: ' + networkName + JSON.stringify(oldAddresses, null, 2))
        fs.writeFileSync(addressFile, JSON.stringify(oldAddresses, null, 2))
    })
}
