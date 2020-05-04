module.exports = {
    compileCommand: 'npm run compile -- --all',
    testCommand: 'export ETHEREUM_RPC_PORT=8555&& npm run test:fast -- --network coverage --timeout 10000',
    copyPackages: [
        'openzeppelin-eth'
    ],
    skipFiles: [
        'test'
    ],
}