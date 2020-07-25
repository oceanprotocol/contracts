/* eslint-env mocha */
/* global artifacts, contract, it, beforeEach, web3 */

const DDO = artifacts.require('DDO')
const truffleAssert = require('truffle-assertions')
const ddoSample = require('../resources/DDO.json')

contract('DDO test', async accounts => {
    let result
    let ddo

    beforeEach('init contracts for each test', async function() {
        ddo = await DDO.new()
    })

    it('should publish a DDO', async () => {
        const str = JSON.stringify(ddoSample)
        const blob = web3.utils.asciiToHex(str)
        const flags = web3.utils.asciiToHex(0)
        truffleAssert.passes(result = await ddo.newDDO(ddoSample.id, flags, blob))

        truffleAssert.eventEmitted(result, 'newDDOEvent', (ev) => {
            return ev.did !== ddoSample.id
        })
    })
    it('should update a DDO', async () => {
        const str = JSON.stringify(ddoSample)
        const blob = web3.utils.asciiToHex(str)
        const flags = web3.utils.asciiToHex(0)
        truffleAssert.passes(result = await ddo.updateDDO(ddoSample.id, flags, blob))

        truffleAssert.eventEmitted(result, 'updateDDOEvent', (ev) => {
            return ev.did !== ddoSample.id
        })
    })
})
