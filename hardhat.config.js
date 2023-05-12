require("@nomiclabs/hardhat-waffle");
require("hardhat-contract-sizer");
require("hardhat-gas-reporter");
require('solidity-coverage');
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-vyper");
// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
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

    ],
    overrides: {},
  },
  vyper: {
    compilers: [{ version: "0.3.1" }, { version: "0.2.15" }, { version: "0.2.7" }, { version: "0.2.4" }],
  },
  networks: {
    hardhat: {
      //allowUnlimitedContractSize: true,
      //forking: {
      //  url: process.env.ALCHEMY_URL,
      //  blockNumber: 12545000,
      //},
      gasPrice:1000000000
    },
    mainnet: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    ropsten: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    rinkeby: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    goerli: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    mumbai: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    moonbase: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    polygon: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    polygonedge: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    bsc: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    energyweb:{
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    moonriver: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    gaiaxtestnet: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    alfajores: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    celo: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    filecointestnet: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    oasis_saphire_testnet: {
      url:
        process.env.NETWORK_RPC_URL !== undefined ? process.env.NETWORK_RPC_URL : "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },

  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
    {
      network: "alfajores",
      chainId: 44787,
      urls: {
          apiURL: "https://api-alfajores.celoscan.io/api",
          browserURL: "https://alfajores.celoscan.io",
      }
    },
    {
      network: "celo",
      chainId: 42220,
      urls: { 
          apiURL: "https://api.celoscan.io/api",
          browserURL: "https://celoscan.io/",
      },
    }
    ] 
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 60,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  }
};
