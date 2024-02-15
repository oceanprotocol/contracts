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
  let gasLimit = 3000000;
  let gasPrice = null;
  let sleepAmount = 10;
  console.log("Using chain "+networkDetails.chainId);
  switch (networkDetails.chainId) {
    case 1:
      networkName = "mainnet";
      productionNetwork = true;
      OPFOwner = "0x0d27cd67c4A3fd3Eb9C7C757582f59089F058167";
      routerOwner = OPFOwner;
      OceanTokenAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
      gasPrice = ethers.utils.parseUnits('23', 'gwei')
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
  
  
  
    if (logging) console.info("Deploying VestingWallet0");
    const VestingWallet0 = await ethers.getContractFactory(
      "VestingWalletLinear",
      owner
    );
    const block = await provider.getBlock("latest")
    const blockTimestamp = block.timestamp
    const endDate = "2024-03-14"
    const endDateUnix = parseInt(new Date(endDate).getTime() / 1000)
    //vesting A
    //const startTimestamp = 1705017600  // Fri Jan 12 2024 00:00:00 GMT+0000
    //const endTimestamp = 1709856000 // Fri Mar 08 2024 00:00:00 GMT+0000   - this is when we top up last week of DF Main1
    //vesting B
    //const startTimestamp = 1710028800  // Sun Mar 10 2024 00:00:00 GMT+0000
    //const endTimestamp = 1725753600 // Sun Sep 08 2024 00:00:00 GMT+0000   - this is when we top up last week of DF Main2
    //vesting C
    const startTimestamp = 1725753600  // Sun Sep 08 2024 00:00:00 GMT+0000
    const endTimestamp = 1741478400 // Sun Mar 09 2025 00:00:00 GMT+0000   - this is when we top up last week of DF Main3
    

    const vestingPeriod = endTimestamp - startTimestamp
    const deployVestingWallet0 = await VestingWallet0.connect(owner).deploy(addresses.Splitter, startTimestamp, vestingPeriod, options)
    await deployVestingWallet0.deployTransaction.wait();
    addresses.VestingWalletC = deployVestingWallet0.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + deployVestingWallet0.address+" "+addresses.Splitter+" "+blockTimestamp+" "+vestingPeriod)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)
    
    //ownerships    
    if (routerOwner != owner.address) {
      if (logging) console.info("Moving vesting ownership to " + routerOwner)
      tx = await deployVestingWallet0.connect(owner).transferOwnership(routerOwner, options)
      await tx.wait();
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
