/* eslint-env mocha */
/* global artifacts, web3 */
const fs = require('fs')
var DataTokenTemplate = artifacts.require('./DataTokenTemplate.sol')
var DTFactory = artifacts.require('./DTFactory.sol')
var BPool = artifacts.require('./BPool.sol')
var BFactory = artifacts.require('./BFactory.sol')
var Metadata = artifacts.require('./Metadata.sol')
var Dispenser = artifacts.require('./Dispenser.sol')
var FixedRateExchange = artifacts.require('./FixedRateExchange.sol')
var OPFCommunityFeeCollector = artifacts.require('./OPFCommunityFeeCollector.sol')
// dummy communityFeeCollector, replace with real wallet/owner
let communityCollector = '0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725'
let OPFOwner = '0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725'
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
        if (networkName === 'moonbeamalpha') {
            communityCollector = '0x06100AB868206861a4D7936166A91668c2Ce1312'
            OPFOwner = '0x06100AB868206861a4D7936166A91668c2Ce1312'
        }
        await deployer.deploy(
            OPFCommunityFeeCollector,
            communityCollector,
            OPFOwner
        )

        let cap = 10000000
        if (networkName === 'development' || networkName === 'ganache') {
            cap = web3.utils.toWei('100000')
        }

        await deployer.deploy(
            DataTokenTemplate,
            'DataTokenTemplate',
            'DTT',
            accounts[0],
            cap,
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
        await deployer.deploy(
            Dispenser
        )
        addresses.Dispenser = Dispenser.address
        if (networkName === 'development' || networkName === 'ganache') {
            addresses.Ocean = DataTokenTemplate.address
        }
        if (networkName === 'mainnet') {
            addresses.Ocean = '0x967da4048cD07aB37855c090aAF366e4ce1b9F48'
        }
        if (networkName === 'polygon') {
            addresses.Ocean = '0x282d8efCe846A88B159800bd4130ad77443Fa1A1'
        }
        if (networkName === 'moonbeamalpha') {
            addresses.Ocean = '0xd8992Ed72C445c35Cb4A2be468568Ed1079357c8'
        }
        console.info('writing address.json file: ' + networkName + JSON.stringify(oldAddresses, null, 2))
        fs.writeFileSync(addressFile, JSON.stringify(oldAddresses, null, 2))
    })
}
