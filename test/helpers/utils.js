/* eslint-env mocha */
/* global */

const constants = require('./constants')
const Web3 = require('web3')

console.log()
const utils = {
    getEventArgsFromTx: (txReceipt, eventName) => {
        return txReceipt.logs.filter((log) => {
            return log.event === eventName
        })[0].args
    },
    getWeb3: () => {
        return new Web3(new Web3.providers.HttpProvider(constants.network.nodeUrl))
    }
}

module.exports = utils
