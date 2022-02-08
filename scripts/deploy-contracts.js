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
const shouldDeployV4 = true;
const shouldDeployV3 = false;
let shouldDeployOceanMock = false;
let shouldDeployOPFCommunityFeeCollector = false;
const shouldDeployOPFCommunity = true;
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
  let OPFOwner = '0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725';
  let routerOwner;
  let OPFCommunityFeeCollectorAddress;
  let productionNetwork = false;
  let OceanTokenAddress;
  let gasLimit 
  console.log("Using chain "+networkDetails.chainId);
  switch (networkDetails.chainId) {
    case 1:
      networkName = "mainnet";
      productionNetwork = true;
      OPFOwner = "0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725";
      OceanTokenAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
      gasLimit = 30000000
      break;
    case 0x3:
      networkName = "ropsten";
      OceanTokenAddress = "0x5e8DCB2AfA23844bcc311B00Ad1A0C30025aADE9";
      gasLimit = 8000000
      break;
    case 0x4:
      networkName = "rinkeby";
      OceanTokenAddress = "0x8967bcf84170c91b0d24d4302c2376283b0b3a07";
      OPFOwner = "0x0e901bC5D49636eC75B3B4fB88238698E5322dE6";
      routerOwner = "0x0e901bC5D49636eC75B3B4fB88238698E5322dE6";
      gasLimit= 30000000
      shouldDeployOceanMock = false;
      break;
    case 0x89:
      networkName = "polygon";
      productionNetwork = true;
      OceanTokenAddress = "0x282d8efCe846A88B159800bd4130ad77443Fa1A1";
      gasLimit = 20000000
      break;
    case 0x507:
      networkName = "moonbeamalpha";
      OPFOwner = '0xd8992Ed72C445c35Cb4A2be468568Ed1079357c8';
      OceanTokenAddress = "0xF6410bf5d773C7a41ebFf972f38e7463FA242477";
      gasLimit 
      break;
    case 2021000:
      networkName = "gaiaxtestnet";
      OPFOwner = '0x2112Eb973af1DBf83a4f11eda82f7a7527D7Fde5'
      OceanTokenAddress = "0x80E63f73cAc60c1662f27D2DFd2EA834acddBaa8";
      gasLimit
      break;
    case 80001:
      networkName = "mumbai";
      OPFOwner = '0x06100AB868206861a4D7936166A91668c2Ce1312'
      OceanTokenAddress = "0xd8992Ed72C445c35Cb4A2be468568Ed1079357c8";
      gasLimit = 20000000
      break;
    case 0x38:
      networkName = "bsc";
      productionNetwork = true;
      OPFOwner = '0x30E4CC2C7A9c6aA2b2Ce93586E3Df24a3A00bcDD'
      OceanTokenAddress = "0xdce07662ca8ebc241316a15b611c89711414dd1a";
      gasLimit = 80000000
      break;
    case 2021001:
      networkName = "catenaxtestnet";
      OPFOwner = '0x06100AB868206861a4D7936166A91668c2Ce1312'
      OceanTokenAddress = "0xf26c6C93f9f1d725e149d95f8E7B2334a406aD10";
      gasLimit 
      break;
    case 0xf6:
      networkName = "energyweb";
      productionNetwork = true;
      OceanTokenAddress = "0x593122aae80a6fc3183b2ac0c4ab3336debee528";
      gasLimit 
      break;
    case 1285:
      networkName = "moonriver";
      productionNetwork = true;
      OceanTokenAddress = "0x99C409E5f62E4bd2AC142f17caFb6810B8F0BAAE";
      gasLimit 
      break;
    default:
      OPFOwner = "0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725";
      networkName = "development";
      routerOwner = owner.address;
      shouldDeployOceanMock = true;
      break;
  }
  // if gasLimit is not set use 8M 
  if (gasLimit == undefined){
    gasLimit = 8000000
  }
  const options = { gasLimit }
  console.log(options)
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

  addresses.chainId = networkDetails.chainId;
  if (shouldDeployOceanMock) {
    if (logging) console.info("Deploying OceanMock");
    const Ocean = await ethers.getContractFactory("MockOcean", owner);
    const ocean = await Ocean.connect(owner).deploy(owner.address,options);
    addresses.Ocean = ocean.address;
    // DEPLOY DAI and USDC for TEST (barge etc)
    // owner will already have a 10k balance both for DAI and USDC
    const ERC20Mock = await ethers.getContractFactory("MockERC20Decimals");
    if (logging) console.info("Deploying DAI MOCK");
    const DAI = await ERC20Mock.connect(owner).deploy("DAI", "DAI", 18,options);
    addresses.MockDAI = DAI.address;
    if (logging) console.info("Deploying USDC MOCK");
    const USDC = await ERC20Mock.connect(owner).deploy("USDC", "USDC", 6,options);
    addresses.MockUSDC = USDC.address;

  }
  else {
    addresses.Ocean = OceanTokenAddress;
  }

  if (shouldDeployOPFCommunityFeeCollector || !OPFCommunityFeeCollectorAddress) {
    if (logging) console.info("Deploying OPF Community Fee");
    const OPFCommunityFeeCollector = await ethers.getContractFactory(
      "OPFCommunityFeeCollector",
      owner
    );
    const opfcommunityfeecollector = await OPFCommunityFeeCollector.deploy(
      OPFOwner,
      OPFOwner,
      options
    );
    await opfcommunityfeecollector.deployTransaction.wait();
    addresses.OPFCommunityFeeCollector = opfcommunityfeecollector.address;
    if(show_verify){
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network "+networkName+" "+opfcommunityfeecollector.address+" "+OPFOwner+" "+OPFOwner)
    }
  }
  else {
    addresses.OPFCommunityFeeCollector = OPFCommunityFeeCollectorAddress;
  }


  if (logging) console.info("Deploying V4 contracts");
  // v4 contracts

  // DEPLOY ROUTER, SETTING OWNER

  if (logging) console.info("Deploying BPool");
  const BPool = await ethers.getContractFactory("BPool", owner);
  const poolTemplate = await BPool.deploy(options);
  const receipt = await poolTemplate.deployTransaction.wait();
  addresses.startBlock = receipt.blockNumber 
  addresses.poolTemplate = poolTemplate.address;
  if(show_verify){
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network "+networkName+" "+addresses.poolTemplate)
  }
  if (logging) console.log("Deploying Router");
  const Router = await ethers.getContractFactory("FactoryRouter", owner);
  const router = await Router.deploy(
    owner.address,
    addresses.Ocean,
    poolTemplate.address,
    addresses.OPFCommunityFeeCollector,
    [],
    options
  );
  await router.deployTransaction.wait();
  addresses.Router = router.address;
  if(show_verify){
    console.log("\tRun the following to verify on etherscan");
    console.log("\tcat > args1.js\n");
    console.log("\tmodule.exports=[\n");
    console.log("\t'"+owner.address+"',\n");
    console.log("\t'"+addresses.Ocean+"',\n");
    console.log("\t'"+poolTemplate.address+"',\n");
    console.log("\t'"+addresses.OPFCommunityFeeCollector+"',\n");
    console.log("\t[]\n");
    console.log("\t];");
    console.log("\tCTRL+D");
    console.log("\tnpx hardhat verify --network "+networkName+" --constructor-args args1.js "+addresses.Router)
  }

  if (logging) console.info("Deploying FixedrateExchange");
  const FixedPriceExchange = await ethers.getContractFactory(
    "FixedRateExchange",
    owner
  );
  const fixedPriceExchange = await FixedPriceExchange.deploy(
    router.address,
    addresses.OPFCommunityFeeCollector,
    options
  );
  await fixedPriceExchange.deployTransaction.wait();
  addresses.FixedPrice = fixedPriceExchange.address;
  if(show_verify){
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network "+networkName+" "+addresses.FixedPrice+" "+router.address+" "+addresses.OPFCommunityFeeCollector)
  }
  if (logging) console.info("Deploying StakingContract");
  const SSContract = await ethers.getContractFactory("SideStaking", owner);
  const ssPool = await SSContract.deploy(router.address,options);
  await ssPool.deployTransaction.wait();
  addresses.Staking = ssPool.address;
  if(show_verify){
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network "+networkName+" "+addresses.Staking+" "+router.address)
  }
  addresses.ERC20Template = {};
  if (logging) console.info("Deploying ERC20 Template");
  const ERC20Template = await ethers.getContractFactory("ERC20Template", owner);
  const templateERC20 = await ERC20Template.deploy(options);
  await templateERC20.deployTransaction.wait();
  if(show_verify){
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network "+networkName+" "+templateERC20.address)
  }
  if (logging) console.info("Deploying ERC20 Enterprise Template");
  const ERC20TemplateEnterprise = await ethers.getContractFactory(
    "ERC20TemplateEnterprise",
    owner
  );
  const templateERC20Enterprise = await ERC20TemplateEnterprise.deploy(options);
  await templateERC20Enterprise.deployTransaction.wait();
  if(show_verify){
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network "+networkName+" "+templateERC20Enterprise.address)
  }
  addresses.ERC721Template = {};
  if (logging) console.info("Deploying ERC721 Template");
  const ERC721Template = await ethers.getContractFactory(
    "ERC721Template",
    owner
  );
  const templateERC721 = await ERC721Template.deploy(options);
  await templateERC721.deployTransaction.wait();
  if(show_verify){
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network "+networkName+" "+templateERC721.address)
  }
  if (logging) console.info("Deploying Dispenser");
  const Dispenser = await ethers.getContractFactory("Dispenser", owner);
  const dispenser = await Dispenser.deploy(router.address,options);
  await dispenser.deployTransaction.wait();
  addresses.Dispenser = dispenser.address;
  if(show_verify){
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network "+networkName+" "+dispenser.address+" "+router.address)
  }
  if (logging) {
    const params = {

    "ERC721": templateERC721.address,
    "ERC20": templateERC20.address,
    "OPFCommunityFeeCollector": addresses.OPFCommunityFeeCollector,
    "Router": router.address
    }
    console.info("Deploying ERC721 Factory");
    console.info(params)
  }
  const ERC721Factory = await ethers.getContractFactory("ERC721Factory", owner);
  const factoryERC721 = await ERC721Factory.deploy(
    templateERC721.address,
    templateERC20.address,
    addresses.OPFCommunityFeeCollector,
    router.address,
    options
  );
  await factoryERC721.deployTransaction.wait();
  if(show_verify){
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network "+networkName+" "+factoryERC721.address+" "+templateERC721.address+" "+templateERC20.address+" "+addresses.OPFCommunityFeeCollector+" "+router.address)
  }
  addresses.ERC721Factory = factoryERC721.address;
  const nftCount = await factoryERC721.getCurrentNFTTemplateCount();
  const nftTemplate = await factoryERC721.getNFTTemplate(nftCount);
  addresses.ERC721Template[nftCount.toString()] = templateERC721.address;

  let currentTokenCount = await factoryERC721.getCurrentTemplateCount();
  let tokenTemplate = await factoryERC721.getTokenTemplate(currentTokenCount);
  addresses.ERC20Template[currentTokenCount.toString()] = templateERC20.address;
  if (logging) console.info("Adding ERC20Enterprise to ERC721Factory");
  const templateadd = await factoryERC721.addTokenTemplate(templateERC20Enterprise.address);
  await templateadd.wait();
  currentTokenCount = await factoryERC721.getCurrentTemplateCount();
  tokenTemplate = await factoryERC721.getTokenTemplate(currentTokenCount);
  addresses.ERC20Template[currentTokenCount.toString()] =
    templateERC20Enterprise.address;
    
  // SET REQUIRED ADDRESS

  if (logging) console.info("Adding factoryERC721.address");
  await router.connect(owner).addFactory(factoryERC721.address,options);
  if (logging) console.info("Adding fixedPriceExchange.address");
  await router.connect(owner).addFixedRateContract(fixedPriceExchange.address,options);
  if (logging) console.info("Adding dispenser.address");
  await router.connect(owner).addDispenserContract(dispenser.address,options);
  if (logging) console.info("Adding ssPool.address");
  await router.connect(owner).addSSContract(ssPool.address,options);
  // Avoid setting Owner an account we cannot use on barge for now
  if (logging) console.info("Moving Router ownership")
  if (owner.address != routerOwner) await router.connect(owner).changeRouterOwner(routerOwner,options)

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

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
