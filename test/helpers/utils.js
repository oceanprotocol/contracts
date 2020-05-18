/* eslint-env mocha */
/* global */

const utils = {
    getEventArgsFromTx: (txReceipt, eventName) => {
        return txReceipt.logs.filter((log) => {
            return log.event === eventName
        })[0].args
    }
}

module.exports = utils
