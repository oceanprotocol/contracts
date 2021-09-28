/* eslint-env mocha */
/* global */

const constants = require('./constants')
const Web3 = require('web3')


const utils = {
    getEventFromTx: (txReceipt, eventName) => {
        return txReceipt.events.filter((log) => {
            return log.event === eventName
        })[0]
    },
    getWeb3: () => {
        return new Web3(new Web3.providers.HttpProvider(constants.network.nodeUrl))
    }
}

module.exports = utils
