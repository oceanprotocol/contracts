/* eslint-env mocha */
/* global contract, it, beforeEach, artifacts */

const chai = require('chai')
const { assert } = chai
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
const Converter = artifacts.require('Converter')
// const utils = require('../helpers/utils')

contract('Converter test', async accounts => {
    let converter
    beforeEach('init contracts for each test', async function() {
        converter = await Converter.new()
    })

    it('should convert uint to string', async () => {
        const uintValue = 123
        const strValue = await converter.uintToString(uintValue)
        assert.equal(strValue, '123')
    })

    it('should return zero in case of zero uint', async () => {
        const uintValue = 0
        const strValue = await converter.uintToString(uintValue)
        assert.equal(strValue, '0')
    })
})
