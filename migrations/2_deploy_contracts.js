/* eslint-env mocha */
/* global artifacts, web3 */
const fs = require('fs')
var DataTokenTemplate = artifacts.require('./DataTokenTemplate.sol')
var DTFactory = artifacts.require('./DTFactory.sol')
var BPool = artifacts.require('./BPool.sol')
var BFactory = artifacts.require('./BFactory.sol')
var Metadata = artifacts.require('./Metadata.sol')
var ssFixedRate = artifacts.require('./ssFixedRate.sol')
var OPFCommunityFeeCollector = artifacts.require('./OPFCommunityFeeCollector.sol')
// dummy communityFeeCollector, replace with real wallet/owner
const communityCollector = '0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725'
const OPFOwner = '0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725'
const shouldDeploy = { // choose what to deploy. if false, will keep the previous deployment from addresses. if that not exists, it will deploy the contract anyway
    OPFCommunityFeeCollector: true,
    DataTokenTemplate: true,
    DTFactory: true,
    BPool: true,
    BFactory: true,
    Metadata: true
}
module.exports = function(deployer, network, accounts) {
    deployer.then(async () => {
        const addressFile = './artifacts/address.json'
        let oldAddresses
        try {
            oldAddresses = JSON.parse(fs.readFileSync(addressFile))
        } catch (e) { oldAddresses = {} }
        const networkName = process.env.NETWORK
        if (!oldAddresses[networkName]) {
            oldAddresses[networkName] = {}
        }
        const addresses = oldAddresses[networkName]

        if (!addresses.OPFCommunityFeeCollector || shouldDeploy.OPFCommunityFeeCollector) {
            await deployer.deploy(
                OPFCommunityFeeCollector,
                communityCollector,
                OPFOwner
            )
            addresses.OPFCommunityFeeCollector = OPFCommunityFeeCollector.address
        }
        if (!addresses.ssFixedRate || shouldDeploy.ssFixedRate) {
            await deployer.deploy(ssFixedRate)
            addresses.ssFixedRate = ssFixedRate.address
        }

        if (!addresses.DataTokenTemplate || shouldDeploy.DataTokenTemplate) {
            let cap = 10000000
            if (networkName === 'development' || networkName === 'ganache') {
                cap = web3.utils.toWei('100000')
            }
            await deployer.deploy(
                DataTokenTemplate,
                'DataTokenTemplate',
                'DTT',
                accounts[0],
                accounts[0],
                cap,
                'http://oceanprotocol.com',
                addresses.OPFCommunityFeeCollector
            )
            addresses.DataTokenTemplate = DataTokenTemplate.address
        }
        if (!addresses.DTFactory || shouldDeploy.DTFactory) {
            await deployer.deploy(
                DTFactory,
                addresses.DataTokenTemplate,
                addresses.OPFCommunityFeeCollector
            )
            addresses.DTFactory = DTFactory.address
        }
        if (!addresses.BPool || shouldDeploy.BPool) {
            await deployer.deploy(
                BPool
            )
            addresses.BPool = BPool.address
        }
        if (!addresses.BFactory || shouldDeploy.BFactory) {
            await deployer.deploy(
                BFactory,
                addresses.BPool
            )
            addresses.BFactory = BFactory.address
        }
        if (!addresses.Metadata || shouldDeploy.Metadata) {
            await deployer.deploy(
                Metadata
            )
            addresses.Metadata = Metadata.address
        }
        if (networkName === 'development' || networkName === 'ganache') {
            addresses.Ocean = DataTokenTemplate.address
        }
        if (networkName === 'mainnet') {
            addresses.Ocean = '0x967da4048cD07aB37855c090aAF366e4ce1b9F48'
        }
        console.info('writing address.json file: ' + networkName + JSON.stringify(oldAddresses, null, 2))
        fs.writeFileSync(addressFile, JSON.stringify(oldAddresses, null, 2))
    })
}
