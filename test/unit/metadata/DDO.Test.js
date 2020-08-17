/* eslint-env mocha */
/* global artifacts, contract, it, before, assert, web3 */

const DDO = artifacts.require('DDO')
const constants = require('../../helpers/constants.js')
const testUtils = require('../../helpers/utils')

contract('DDO test', async accounts => {
    let ddo
    let didOwner
    before('init contracts for each test', async function() {
        ddo = await DDO.new()
        didOwner = accounts[0]
    })

    it('should publish a DDO', async () => {
        const did = constants.did[0]
        const blob = web3.utils.asciiToHex(
            constants.blob[0]
        )
        const flags = web3.utils.asciiToHex(
            constants.flags[0]
        )

        const tx = await ddo.create(
            did,
            flags,
            blob,
            {
                from: didOwner
            }
        )
        const DDOCreatedEvent = testUtils.getEventArgsFromTx(tx, 'DDOCreated')
        assert(DDOCreatedEvent.did === did)
    })
    it('should update a DDO', async () => {
        const did = constants.did[0]
        const blob = web3.utils.asciiToHex(
            constants.blob[1]
        )
        const flags = web3.utils.asciiToHex(
            constants.flags[1]
        )
        const tx = await ddo.update(
            did,
            flags,
            blob,
            {
                from: didOwner
            }
        )
        const DDOUpdatedEvent = testUtils.getEventArgsFromTx(tx, 'DDOUpdated')
        assert(DDOUpdatedEvent.did === did)
    })
})
