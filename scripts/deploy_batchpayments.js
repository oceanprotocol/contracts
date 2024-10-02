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
const shouldDeployMock20 = false
async function main() {
  const url = process.env.NETWORK_RPC_URL;
  console.log("Using RPC: "+url);
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
  console.log("Using chain "+networkDetails.chainId);
  switch (networkDetails.chainId) {
    default:
      OPFOwner = "0x0d27cd67c4A3fd3Eb9C7C757582f59089F058167";
      networkName = "development";
      routerOwner = OPFOwner;
      shouldDeployOceanMock = true;
      sleepAmount = 0
      break;
  }

  let options
  if(gasPrice){
    options = {gasLimit: gasLimit, gasPrice: gasPrice}
  }
  else{
    options = { gasLimit }
  }
  
  
    if (logging) console.info("Deploying BatchPayment");
    const BatchPayments = await ethers.getContractFactory(
      "BatchPayments",
      owner
    );
    
    const deployBatchPayments = await BatchPayments.connect(owner).deploy(options)
    await deployBatchPayments.deployTransaction.wait();
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + deployBatchPayments.address)
    }
    if (shouldDeployMock20){
      const Mock20 = await ethers.getContractFactory(
        "MockERC20",
        owner
      );
      const deployMock20 = await Mock20.connect(owner).deploy(owner.address,"MockERC20", 'MockERC20',options)
      await deployMock20.deployTransaction.wait();
      if (show_verify) {
        console.log("\tRun the following to verify on etherscan");
        console.log("\tnpx hardhat verify --network " + networkName + " " + deployMock20.address)
      }
    }
    if (sleepAmount > 0) await sleep(sleepAmount)
    
    
}



async function sleep(s) {
  return new Promise((resolve) => {
    setTimeout(resolve, s*1000)
  })
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
