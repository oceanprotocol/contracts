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
  let grantsTokenAddress = null;
  let compyAddress = null;
  const grantsOwner = "0x09b575B5eC7Fff24cbccC092DE9E36eADdDbEe71";
  switch (networkDetails.chainId) {
    case 11155111:
      networkName = "sepolia";
      gasPrice = ethers.utils.parseUnits("25", "gwei");
      gasLimit = 6000000;
      compyAddress = "0x92b368055425f34c18e6f7A80DEaB7Ff106C9d05";
      usdcAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
      break;
    case 8453:
      networkName = "base";
      gasPrice = ethers.utils.parseUnits("0.006", "gwei");
      gasLimit = 3000000;
      compyAddress = "0x5494711392a67DA50D3bC7b1fcC2d1877cFaA4d2";
      usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
      break;
  }
  if (!compyAddress) {
    console.error("Invalid network. Aborting..");
    return null;
  }
  let options;
  if (gasPrice) {
    options = { gasLimit: gasLimit, gasPrice: gasPrice };
  } else {
    options = { gasLimit };
  }
  console.log("Deploying contracts with the account:", owner.address);
  console.log("Deployer nonce:", await owner.getTransactionCount());

  if (logging) console.info("Deploying GrantsSwap");
  const GrantsTokenSwap = await ethers.getContractFactory("GrantsSwap", owner);
  const deployGrantsTokenSwap = await GrantsTokenSwap.connect(owner).deploy(
    compyAddress,
    usdcAddress,
    options
  );
  await deployGrantsTokenSwap.deployTransaction.wait(1);
  
  if (logging) console.info("GrantsTokenSwap deployed at:", deployGrantsTokenSwap.address);

  if (show_verify) {
    console.log("\tRun the following to verify on etherscan");
    console.log(
      "\tnpx hardhat verify --network " +
        networkName +
        " " +
        deployGrantsTokenSwap.address +
        " " +
        compyAddress +
        " " +
        usdcAddress
    );
  }
  // Transfer ownership if GRANTS_OWNER is set
  if (grantsOwner) {
    if (logging) console.info("Transferring ownership to:", grantsOwner);
    const transferTx = await deployGrantsTokenSwap.transferOwnership(grantsOwner, options);
    await transferTx.wait(1);
    if (logging) console.info("Ownership transferred successfully");
  } else {
    if (logging) console.warn("GRANTS_OWNER not set. Ownership remains with deployer:", owner.address);
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
