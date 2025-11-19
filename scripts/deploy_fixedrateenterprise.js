// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const fs = require("fs");
const { address } = require("../test/helpers/constants");
const { Wallet } = require("ethers");
const { UV_FS_O_FILEMAP } = require("constants");
const ethers = hre.ethers;
require("dotenv").config();
const logging = true;
const show_verify = true;
const shouldDeployMock20 = false;
async function main() {
  const url = process.env.NETWORK_RPC_URL;
  console.log("Using RPC: " + url);
  if (!url) {
    console.error("Missing NETWORK_RPC_URL. Aborting..");
    return null;
  }
  const provider = new ethers.providers.JsonRpcProvider(url);
  const network = provider.getNetwork();
  // utils
  const networkDetails = await network;

  let wallet;
  if (process.env.MNEMONIC)
    wallet = new Wallet.fromMnemonic(process.env.MNEMONIC);
  if (process.env.PRIVATE_KEY) wallet = new Wallet(process.env.PRIVATE_KEY);
  if (!wallet) {
    console.error("Missing MNEMONIC or PRIVATE_KEY. Aborting..");
    return null;
  }
  owner = wallet.connect(provider);
  let gasLimit = 3000000;
  let gasPrice = null;
  let sleepAmount = 10;
  let OPFOwner = null;
  let RouterAddress = null;
  let OEOwner = "0xFb39309Dd2A218413559d8505f216466C1340387";
  console.log("Using chain " + networkDetails.chainId);
  switch (networkDetails.chainId) {
    case 1:
      networkName = "mainnet";
      gasLimit = 5000000;
      gasPrice = ethers.utils.parseUnits("2.2", "gwei");
      break;
    case 10:
      networkName = "optimism";
      gasPrice = ethers.utils.parseUnits("0.001200495", "gwei");
      gasLimit = 5000000;
      break;
    case 11155111:
      networkName = "sepolia";
      gasPrice = ethers.utils.parseUnits("0.021000011", "gwei");
      gasLimit = 5000000;
      break;
  }

  let options;
  if (gasPrice) {
    options = { gasLimit: gasLimit, gasPrice: gasPrice };
  } else {
    options = { gasLimit };
  }
  const addressFile = process.env.ADDRESS_FILE;
  let oldAddresses;
  if (addressFile) {
    try {
      oldAddresses = JSON.parse(fs.readFileSync(addressFile));
    } catch (e) {
      console.log(e);
      oldAddresses = {};
    }
    if (!oldAddresses[networkName]) oldAddresses[networkName] = {};
    addresses = oldAddresses[networkName];
  }
  if (logging)
    console.info(
      "Use existing addresses:" + JSON.stringify(addresses, null, 2)
    );

  if (!addresses.Router) {
    console.error("Missing Router. Aborting..");
    return null;
  }
  console.log("Deployer nonce:", await owner.getTransactionCount());

  if (!addresses.EnterpriseFeeCollector) {
    if (logging) console.info("Deploying OPE Fee Collector");
    const EnterpriseFeeCollector = await ethers.getContractFactory(
      "EnterpriseFeeCollector",
      owner
    );
    let opefeecollector;
    if (options)
      opefeecollector = await EnterpriseFeeCollector.connect(owner).deploy(
        OEOwner,
        OEOwner,
        options
      );
    else
      opefeecollector = await EnterpriseFeeCollector.connect(owner).deploy(
        OEOwner,
        OEOwner
      );
    await opefeecollector.deployTransaction.wait();
    addresses.EnterpriseFeeCollector = opefeecollector.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log(
        "\tnpx hardhat verify --network " +
          networkName +
          " " +
          opefeecollector.address +
          " " +
          OEOwner +
          " " +
          OEOwner
      );
    }
    if (sleepAmount > 0) await sleep(sleepAmount);
  }

  if (!addresses.FixedPriceEnterprise || true) {
    if (logging) console.info("Deploying FixedrateExchangeEnterprise");
    const FixedrateExchangeEnterprise = await ethers.getContractFactory(
      "FixedRateExchangeEnterprise",
      owner
    );
    let fixedPriceExchangeEnterprise;
    if (options)
      fixedPriceExchangeEnterprise = await FixedrateExchangeEnterprise.connect(
        owner
      ).deploy(addresses.Router, addresses.EnterpriseFeeCollector, options);
    else
      fixedPriceExchangeEnterprise = await FixedrateExchangeEnterprise.connect(
        owner
      ).deploy(addresses.Router, addresses.EnterpriseFeeCollector);
    await fixedPriceExchangeEnterprise.deployTransaction.wait();
    addresses.FixedPriceEnterprise = fixedPriceExchangeEnterprise.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log(
        "\tnpx hardhat verify --network " +
          networkName +
          " " +
          addresses.FixedPriceEnterprise +
          " " +
          addresses.Router +
          " " +
          addresses.EnterpriseFeeCollector
      );
    }
  }

  if (addressFile) {
    // write address.json if needed
    oldAddresses[networkName] = addresses;
    //if (logging)
      //console.info(
       // "writing to " +
         // addressFile +
         // "\r\n" +
         // JSON.stringify(oldAddresses, null, 2)
      //);
    try {
      fs.writeFileSync(addressFile, JSON.stringify(oldAddresses, null, 2));
    } catch (e) {
      console.error(e);
    }
  }
}

async function sleep(s) {
  return new Promise((resolve) => {
    setTimeout(resolve, s * 1000);
  });
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
