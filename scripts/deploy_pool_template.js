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
  console.log("Using RPC: "+url);
  if (!url) {
    console.error("Missing NETWORK_RPC_URL. Aborting..");
    return null;
  }
  if( !process.env.ADDRESS_FILE){
    console.error("Missing ADDRESS_FILE. Aborting..");
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
  //let OPFOwner = '0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725';
  let gasLimit = 8000000;
  let gasPrice = null;
  let sleepAmount = 10;
  console.log("Using chain "+networkDetails.chainId);
  switch (networkDetails.chainId) {
    case 1:
      networkName = "mainnet";
      productionNetwork = true;
      OPFOwner = "0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725";
      routerOwner = OPFOwner;
      OceanTokenAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
      break;
    case 0x3:
      networkName = "ropsten";
      OceanTokenAddress = "0x5e8DCB2AfA23844bcc311B00Ad1A0C30025aADE9";
      OPFOwner = '0x58F76AE5BC7Fe80D2fb2781d92189e6eE6Eb8F76';
      routerOwner = OPFOwner;
      gasPrice = ethers.utils.parseUnits('25', 'gwei')
      sleepAmount = 1
      break;
    case 0x4:
      networkName = "rinkeby";
      OceanTokenAddress = "0x8967bcf84170c91b0d24d4302c2376283b0b3a07";
      OPFOwner = "0x0e901bC5D49636eC75B3B4fB88238698E5322dE6";
      routerOwner = OPFOwner;
      sleepAmount = 2
      break;
    case 0x89:
      networkName = "polygon";
      productionNetwork = true;
      OceanTokenAddress = "0x282d8efCe846A88B159800bd4130ad77443Fa1A1";
      OPFOwner = "0x6272E00741C16b9A337E29DB672d51Af09eA87dD";
      routerOwner = OPFOwner;
      gasPrice = ethers.utils.parseUnits('220', 'gwei')
      break;
    case 0x507:
      networkName = "moonbase";
      OPFOwner = '0xd8992Ed72C445c35Cb4A2be468568Ed1079357c8';
      OceanTokenAddress = "0xF6410bf5d773C7a41ebFf972f38e7463FA242477";
      routerOwner = OPFOwner;
      sleepAmount = 1
      break;
    case 2021000:
      networkName = "gaiaxtestnet";
      OPFOwner = '0x2112Eb973af1DBf83a4f11eda82f7a7527D7Fde5'
      routerOwner = OPFOwner;
      OceanTokenAddress = "0x80E63f73cAc60c1662f27D2DFd2EA834acddBaa8";
      break;
    case 80001:
      networkName = "mumbai";
      OPFOwner = '0x06100AB868206861a4D7936166A91668c2Ce1312'
      routerOwner = OPFOwner;
      OceanTokenAddress = "0xd8992Ed72C445c35Cb4A2be468568Ed1079357c8";
      gasPrice = ethers.utils.parseUnits('45', 'gwei')
      sleepAmount = 2
      break;
    case 0x38:
      networkName = "bsc";
      productionNetwork = true;
      OPFOwner = '0x30E4CC2C7A9c6aA2b2Ce93586E3Df24a3A00bcDD';
      routerOwner = OPFOwner;
      OceanTokenAddress = "0xdce07662ca8ebc241316a15b611c89711414dd1a";
      break;
    case 2021001:
      networkName = "catenaxtestnet";
      OPFOwner = '0x06100AB868206861a4D7936166A91668c2Ce1312'
      OceanTokenAddress = "0xf26c6C93f9f1d725e149d95f8E7B2334a406aD10";
      routerOwner = OPFOwner;
      break;
    case 0xf6:
      networkName = "energyweb";
      productionNetwork = true;
      OceanTokenAddress = "0x593122aae80a6fc3183b2ac0c4ab3336debee528";
      OPFOwner = "0x06100AB868206861a4D7936166A91668c2Ce1312";
      routerOwner = OPFOwner;
      break;
    case 1285:
      networkName = "moonriver";
      productionNetwork = true;
      OceanTokenAddress = "0x99C409E5f62E4bd2AC142f17caFb6810B8F0BAAE";
      OPFOwner = "0x06100AB868206861a4D7936166A91668c2Ce1312"
      routerOwner = OPFOwner;
      break;
    default:
      OPFOwner = "0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725";
      networkName = "development";
      routerOwner = owner.address;
      shouldDeployOceanMock = true;
      sleepAmount = 0
      break;
  }

  if (!routerOwner || !OPFOwner) {
    console.error("We need OPFOwner and routerOwner in order to deploy!");
    return null;
  }
  let options
  if(gasPrice){
    options = {gasLimit: gasLimit, gasPrice: gasPrice}
  }
  else{
    options = { gasLimit }
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

  if (!addresses || !addresses.chainId) {
    console.error("Missing addresses. Aborting..");
    return null;
  }
  
  
  
  if (logging) console.info("Deploying BPool");
  const BPool = await ethers.getContractFactory("BPool", owner);
  const poolTemplate = await BPool.connect(owner).deploy(options);
  const receipt = await poolTemplate.deployTransaction.wait();
  addresses.poolTemplate = poolTemplate.address;
  if(show_verify){
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network "+networkName+" "+addresses.poolTemplate)
  }
  
  if (addressFile) {
    // write address.json if needed
    oldAddresses[networkName] = addresses;
    if (logging)
      console.info(
        "writing to " +
        addressFile +
        "\r\n" +
        JSON.stringify(oldAddresses, null, 2)
      );
    try {
      fs.writeFileSync(addressFile, JSON.stringify(oldAddresses, null, 2));
    } catch (e) {
      console.error(e);
    }
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
