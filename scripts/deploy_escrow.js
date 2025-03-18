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
    
    case 23294:
        networkName = "oasis_saphire";
        gasPrice = ethers.utils.parseUnits('100', 'gwei')
        gasLimit = 15000000
        break;
    case 23295:
        networkName = "oasis_saphire_testnet";
        gasPrice = ethers.utils.parseUnits('100', 'gwei')
        gasLimit = 28000000
        break;
    case 11155111:
          networkName = "sepolia";
          gasPrice = ethers.utils.parseUnits('1', 'gwei')
          gasLimit = 28000000
          break;
    case 11155420:
        networkName = "optimism_sepolia";
        gasPrice = ethers.utils.parseUnits('1', 'gwei')
        gasLimit = 28000000
        break;
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
  
  
    if (logging) console.info("Deploying Escrow");
    const Escrow = await ethers.getContractFactory(
      "Escrow",
      owner
    );
    
    const deployEscrow = await Escrow.connect(owner).deploy(options)
    await deployEscrow.deployTransaction.wait();
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + deployEscrow.address)
    }
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
