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
  gasLimit = 6500000;
  gasPrice = ethers.utils.parseUnits("1.15", "gwei");
  const networkName = "mainnet";
  let options;
  if (gasPrice) {
    options = { gasLimit: gasLimit, gasPrice: gasPrice };
  } else {
    options = { gasLimit };
  }

  console.log("Deployer nonce:", await owner.getTransactionCount());

  if (logging) console.info("Deploying GrantsToken");
  const GrantsToken = await ethers.getContractFactory("GrantsToken", owner);
  const initialSupply = ethers.utils.parseUnits("1000000", 6); // 1 million
  const cap = ethers.utils.parseUnits("100000000", 6); // 100 million
  const deployGrantsToken = await GrantsToken.connect(owner).deploy(
    initialSupply, //1 million initial supply
    cap, //100 million cap
    options
  );
  await deployGrantsToken.deployTransaction.wait();
  if (show_verify) {
    console.log("\tRun the following to verify on etherscan");
    console.log(
      "\tnpx hardhat verify --network " +
        networkName +
        " " +
        deployGrantsToken.address +
        " " +
        initialSupply.toString() +
        " " +
        cap.toString()
    );
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
