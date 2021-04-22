const constants = {
    // network: {
    //     nodeUrl: `http://localhost:${process.env.NETWORK_RPC_PORT || '8545'}`
    // },
    did: [
        '0x0000000000000000000000000000000000000000000000000000000001111111',
        '0x319d158c3a5d81d15b0160cf8929916089218bdb4aa78c3ecd16633afd44b8ae'
    ],
    flags: ['0', '1'],
    blob: [
        'f8929916089218bdb4aa78c3ecd16633afd44b8aef89299160',
        'd89219160893184db4aa78d3edd16611afd44b8aef89299162'
    ],
    address: {
        zero: '0x0000000000000000000000000000000000000000',
        one: '0x0000000000000000000000000000000000000001',
        dummy: '0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75'
    },
    sign: {
        bytes32: {
            message: '0x225cded94ed000b85624acb3090384c7676fe920939ba66d994b7fd54459b85a',
            signature: '0x89e0243d7bd929e499b18640565a532bebe490cbe7cfec432462e47e702852' +
                '284e6cc334870e8be586388af53b524ca6773de977270940a0239f06524fcd25891b',
            publicKey: '0x00Bd138aBD70e2F00903268F3Db08f2D25677C9e'
        }
    }
}

module.exports = constants
