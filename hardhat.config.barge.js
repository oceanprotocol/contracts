require("@nomiclabs/hardhat-waffle");
require('solidity-coverage');
//require("@nomiclabs/hardhat-etherscan");
//require("@nomicfoundation/hardhat-verify");
require("@nomiclabs/hardhat-vyper");
// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  defaultNetwork: "ganache",
  solidity: {
    compilers: [
     {
        version: "0.8.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.26",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },

    ],
    overrides: {},
  },
  vyper: {
    compilers: [{ version: "0.3.1" }, { version: "0.2.15" }, { version: "0.2.7" }, { version: "0.2.4" }],
  },
  networks: {
    ganache: {
      chainId: 8996,
      url: process.env.NETWORK_RPC_URL,
      accounts: {
        mnemonic: process.env.GANACHE_MNEMONIC !== undefined ? process.env.GANACHE_MNEMONIC : "taxi music thumb unique chat sand crew more leg another off lamp",
        initialIndex:0,
        count: 50,
      },
      gasPrice: 8000000,
      gas: 2100000
    }
  }
};
