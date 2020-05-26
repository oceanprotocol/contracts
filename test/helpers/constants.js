const constants = {
    network: {
        nodeUrl: `http://localhost:${process.env.ETHEREUM_RPC_PORT || '8545'}`
    }
}

module.exports = constants
