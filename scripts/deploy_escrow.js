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
  let OPFOwner = null;
  let RouterAddress = null;
  console.log("Using chain "+networkDetails.chainId);
  switch (networkDetails.chainId) {
    case 1:
        networkName = "mainnet";
        OPFOwner = "0x0d27cd67c4A3fd3Eb9C7C757582f59089F058167";
        RouterAddress = "0x8149276f275EEFAc110D74AFE8AFECEaeC7d1593";
        gasLimit = 15000000
        gasPrice = ethers.utils.parseUnits('0.4', 'gwei')
        break;
    case 10:
        networkName = "optimism";
        OPFOwner = '0xC7EC1970B09224B317c52d92f37F5e1E4fF6B687'
        RouterAddress = "0xf26c6C93f9f1d725e149d95f8E7B2334a406aD10";
        gasPrice = ethers.utils.parseUnits('0.0010', 'gwei')
        gasLimit = 28000000
        break;
    case 0x89:
        networkName = "polygon";
        OPFOwner = "0x6272E00741C16b9A337E29DB672d51Af09eA87dD";
        RouterAddress = "0x78e1317186786591912A10a7aF2490B8B4697A93";
        gasLimit = 19000000;
        gasPrice = ethers.utils.parseUnits('30', 'gwei');
        break;
    case 8453:
        networkName = "base";
        OPFOwner = '0x4169e846f1524Cf0ac02Bd4B04fa33242709Cf64';
        RouterAddress = "0xEF62FB495266C72a5212A11Dce8baa79Ec0ABeB1";
        gasPrice = ethers.utils.parseUnits('0.009260', 'gwei')
        gasLimit = 28000000
        break;
    case 23294:
        networkName = "oasis_saphire";
        OPFOwner = '0x086E7F0588755af5AF5f8194542Fd8328238F3C1'
        RouterAddress = "0xd8992Ed72C445c35Cb4A2be468568Ed1079357c8";
        gasPrice = ethers.utils.parseUnits('100', 'gwei')
        gasLimit = 15000000
        break;
    case 23295:
        networkName = "oasis_saphire_testnet";
        OPFOwner = '0xC7EC1970B09224B317c52d92f37F5e1E4fF6B687'
        RouterAddress = "0x5FBC2A29f7C8e4533dECD14Dc1c561A8eF0d4e31";
        gasPrice = ethers.utils.parseUnits('100', 'gwei')
        gasLimit = 28000000
        break;
    case 11155111:
        networkName = "sepolia";
        OPFOwner = '0xC7EC1970B09224B317c52d92f37F5e1E4fF6B687';
        RouterAddress = "0x2112Eb973af1DBf83a4f11eda82f7a7527D7Fde5";
        gasPrice = ethers.utils.parseUnits('1', 'gwei')
        gasLimit = 28000000
        break;
    case 11155420:
        networkName = "optimism_sepolia";
        OPFOwner = '0xC7EC1970B09224B317c52d92f37F5e1E4fF6B687';
        RouterAddress = "0x1B083D8584dd3e6Ff37d04a6e7e82b5F622f3985";
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
  
  if (!OPFOwner || !RouterAddress) {
    console.error("Missing OPFOwner or Router. Aborting..");
    return null;
  }
  console.log("Deployer nonce:", await owner.getTransactionCount());

  if (logging) console.info("Deploying Compute Collector");
  const NewCollector = await ethers.getContractFactory("OPFCommunityFeeCollector",
      owner
    );
    
    const deployNewCollector = await NewCollector.connect(owner).deploy(OPFOwner,OPFOwner,options)
    await deployNewCollector.deployTransaction.wait();
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + deployNewCollector.address + " " + OPFOwner + " " + OPFOwner)
      
    }
    if (logging) console.info("Deploying Escrow");
    const Escrow = await ethers.getContractFactory(
      "Escrow",
      owner
    );
    
    const deployEscrow = await Escrow.connect(owner).deploy(RouterAddress,deployNewCollector.address,options)
    await deployEscrow.deployTransaction.wait();
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + deployEscrow.address+ " " + RouterAddress + " " + deployNewCollector.address)
      
    }
    console.log("\r\n\r\n")
    console.log("\"OPFCommunityFeeCollectorCompute\":\""+deployNewCollector.address+"\"")
    console.log("\"Escrow\":\""+deployEscrow.address+"\"")
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
