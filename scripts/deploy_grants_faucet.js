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
  let signerAddress = null;
  let compyAddress = null;
  switch (networkDetails.chainId) {
    case 11155111:
      networkName = "sepolia";
      gasPrice = ethers.utils.parseUnits("12", "gwei");
      gasLimit = 6000000;
      compyAddress = "0x973e69303259B0c2543a38665122b773D28405fB";
      signerAddress = "0xDAcDC497AE9a678a78b703cD83B010C8f5c78E37";
      break;
    case 8453:
      networkName = "base";
      gasPrice = ethers.utils.parseUnits("0.02", "gwei");
      gasLimit = 5000000;
      compyAddress = "0x298f163244e0c8cc9316D6E97162e5792ac5d410";
      signerAddress = "0x508F31c8d2a1B8cEE5360FA41bc0469923986C9B";
      break;
  }
  if (!compyAddress || !signerAddress) {
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

  if (logging) console.info("Deploying GrantsTokenFaucet");
  const GrantsTokenFaucet = await ethers.getContractFactory("GrantsTokenFaucet", owner);
  const deployGrantsTokenFaucet = await GrantsTokenFaucet.connect(owner).deploy(
    compyAddress,
    signerAddress,
    options
  );
  await deployGrantsTokenFaucet.deployTransaction.wait(2);
  
  if (logging) console.info("GrantsTokenFaucet deployed at:", deployGrantsTokenFaucet.address);

  if (show_verify) {
    console.log("\tRun the following to verify on etherscan");
    console.log(
      "\tnpx hardhat verify --network " +
        networkName +
        " " +
        deployGrantsTokenFaucet.address +
        " " +
        compyAddress +
        " " +
        signerAddress
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
