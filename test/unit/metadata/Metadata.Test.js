/* eslint-env mocha */
/* global artifacts, contract, it, before, web3 */

const Metadata = artifacts.require('Metadata')
const constants = require('../../helpers/constants.js')
const testUtils = require('../../helpers/utils')
const DTFactory = artifacts.require('DTFactory')
const Template = artifacts.require('DataTokenTemplate')
const { assert } = require('chai')

contract('Metadata test', async accounts => {
    let metadata
    let minter
    let dataToken
    before('init contracts for each test', async function() {
        metadata = await Metadata.new()
        const blob = 'https://example.com/dataset-1'
        minter = accounts[0]
        const cap = 1400000000
        const communityFeeCollector = accounts[6]
        const template = await Template.new('Template Contract', 'TEMPLATE', minter, cap, blob, communityFeeCollector)
        const factory = await DTFactory.new(template.address, communityFeeCollector)
        const result = await factory.createToken(
            blob,
            '99-Datatoken',
            '99-Datatoken',
            web3.utils.toWei('1000000'),
            {
                from: minter
            }
        )
        const TokenCreatedEventArgs = testUtils.getEventArgsFromTx(result, 'TokenCreated')
        dataToken = TokenCreatedEventArgs.newTokenAddress
    })

    it('should publish a metadata', async () => {
        const blob = web3.utils.asciiToHex(
            constants.blob[0]
        )
        const flags = web3.utils.asciiToHex(
            constants.flags[0]
        )

        const tx = await metadata.create(
            dataToken,
            flags,
            blob,
            {
                from: minter
            }
        )
        const MetadataCreatedEvent = testUtils.getEventArgsFromTx(tx, 'MetadataCreated')
        assert(MetadataCreatedEvent.dataToken === dataToken)
    })
    it('should update a metadata', async () => {
        const blob = web3.utils.asciiToHex(
            constants.blob[1]
        )
        const flags = web3.utils.asciiToHex(
            constants.flags[1]
        )
        const tx = await metadata.update(
            dataToken,
            flags,
            blob,
            {
                from: minter
            }
        )
        const MetadataUpdatedEvent = testUtils.getEventArgsFromTx(tx, 'MetadataUpdated')
        assert(MetadataUpdatedEvent.dataToken === dataToken)
    })
    it('should change minter and update metadata', async () => {
        // const did = constants.did[0]
        // newMinter = accounts[4]
        // const tx = await dataToken.transferOwnership(8889888
        //     did,
        //     newMinter,
        //     {
        //         from: minter
        //     }
        // )
        // const DDOOwnershipTransferredEvent = testUtils.getEventArgsFromTx(tx, 'DDOOwnershipTransferred')
        // assert(DDOOwnershipTransferredEvent.did === did)
        // assert(DDOOwnershipTransferredEvent.owner === accounts[4])
    })
})
