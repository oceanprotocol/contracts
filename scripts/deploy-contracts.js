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
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD"
let shouldDeployV4 = true;
let shouldDeployDF = true;
let shouldDeployVE = true;
let shouldDeployOceanToken = false;
let shouldDeployMocks = false;
let shouldDeployOPFCommunityFeeCollector = false;
let shouldDeployOPFCommunity = true;
const logging = true;
const show_verify = true;


async function main() {
  const url = process.env.NETWORK_RPC_URL;
  console.log("Using RPC: " + url);
  if (!url) {
    console.error("Missing NETWORK_RPC_URL. Aborting..");
    return null;
  }
  if (!process.env.ADDRESS_FILE) {
    console.error("Missing ADDRESS_FILE. Aborting..");
    return null;
  }
  const connection = {
    url: url,
    headers: { "User-Agent": "Ocean Deployer" }
  };
  const provider = new ethers.providers.StaticJsonRpcProvider(connection);
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
  let OPFOwner = null;
  let routerOwner = null
  let OPFCommunityFeeCollectorAddress;
  let productionNetwork = false;
  let OceanTokenAddress;
  let gasLimit = 8000000;
  let gasPrice = null;
  let sleepAmount = 10;
  let additionalApprovedTokens = []
  console.log("Using chain " + networkDetails.chainId);
  switch (networkDetails.chainId) {
    case 1:
      networkName = "mainnet";
      productionNetwork = true;
      OPFOwner = "0x0d27cd67c4A3fd3Eb9C7C757582f59089F058167";
      routerOwner = OPFOwner;
      OceanTokenAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
      additionalApprovedTokens = ["0x0642026E7f0B6cCaC5925b4E7Fa61384250e1701"];
      gasPrice = ethers.utils.parseUnits('12', 'gwei')
      sleepAmount = 10
      shouldDeployV4 = false;
      shouldDeployDF = true;
      shouldDeployVE = true;
      shouldDeployOPFCommunityFeeCollector = false;
      break;
    case 0x3:
      networkName = "ropsten";
      OceanTokenAddress = "0x5e8DCB2AfA23844bcc311B00Ad1A0C30025aADE9";
      OPFOwner = '0x58F76AE5BC7Fe80D2fb2781d92189e6eE6Eb8F76';
      routerOwner = OPFOwner;
      gasLimit = 6000000;
      gasPrice = ethers.utils.parseUnits('25', 'gwei')
      sleepAmount = 1
      shouldDeployV4 = false;
      shouldDeployDF = true;
      shouldDeployVE = true;
      break;
    case 0x4:
      networkName = "rinkeby";
      OceanTokenAddress = "0x8967bcf84170c91b0d24d4302c2376283b0b3a07";
      OPFOwner = "0x0e901bC5D49636eC75B3B4fB88238698E5322dE6";
      routerOwner = OPFOwner;
      sleepAmount = 2
      shouldDeployV4 = false;
      shouldDeployDF = true;
      shouldDeployVE = true;
      break;
    case 0x5:
      networkName = "goerli";
      OceanTokenAddress = "0xCfDdA22C9837aE76E0faA845354f33C62E03653a";
      OPFOwner = "0xEE1673089A4831D92324932e38e2EBDe6aB17274";
      routerOwner = OPFOwner;
      sleepAmount = 2
      gasPrice = ethers.utils.parseUnits('5', 'gwei')
      shouldDeployV4 = false;
      shouldDeployDF = true;
      shouldDeployVE = true;
      break;
    case 0x89:
      networkName = "polygon";
      productionNetwork = true;
      OceanTokenAddress = "0x282d8efCe846A88B159800bd4130ad77443Fa1A1";
      OPFOwner = "0x6272E00741C16b9A337E29DB672d51Af09eA87dD";
      routerOwner = OPFOwner;
      gasLimit = 19000000;
      gasPrice = ethers.utils.parseUnits('120', 'gwei');
      additionalApprovedTokens = ["0xC5248Aa0629C0b2d6A02834a5f172937Ac83CBD3"];
      break;
    case 81001:
      networkName = "polygonedge";
      OceanTokenAddress = "0x282d8efCe846A88B159800bd4130ad77443Fa1A1";
      OPFOwner = "0xad8a12eB81489FBdfb38B9598e523E5B976BcD04";
      routerOwner = OPFOwner;
      sleepAmount = 10
      shouldDeployOceanToken = true;
      shouldDeployDF = false;
      shouldDeployVE = false;
      gasLimit = 8388608;
      break;
    case 0x507:
      networkName = "moonbase";
      OPFOwner = '0xd8992Ed72C445c35Cb4A2be468568Ed1079357c8';
      OceanTokenAddress = "0xF6410bf5d773C7a41ebFf972f38e7463FA242477";
      routerOwner = OPFOwner;
      sleepAmount = 10
      break;
    case 2021000:
      networkName = "gaiaxtestnet";
      OPFOwner = '0x2112Eb973af1DBf83a4f11eda82f7a7527D7Fde5'
      routerOwner = OPFOwner;
      OceanTokenAddress = "0x80E63f73cAc60c1662f27D2DFd2EA834acddBaa8";
      gasLimit = 6666666
      shouldDeployOceanToken = false;
      shouldDeployDF = false;
      shouldDeployVE = false;
      sleepAmount = 1
      break;
    case 80001:
      networkName = "mumbai";
      OPFOwner = '0x06100AB868206861a4D7936166A91668c2Ce1312'
      routerOwner = OPFOwner;
      OceanTokenAddress = "0xd8992Ed72C445c35Cb4A2be468568Ed1079357c8";
      gasLimit = 15000000
      gasPrice = ethers.utils.parseUnits('45', 'gwei')
      sleepAmount = 2
      shouldDeployOceanToken = false;
      shouldDeployV4 = false;
      shouldDeployDF = true;
      shouldDeployVE = true;
      break;
    case 0x38:
      networkName = "bsc";
      productionNetwork = true;
      OPFOwner = '0x62012804e638A15a5beC5aDE01756A7C8d0E50Cc';
      routerOwner = OPFOwner;
      OceanTokenAddress = "0xdce07662ca8ebc241316a15b611c89711414dd1a";
      gasPrice = ethers.utils.parseUnits('5', 'gwei')
      sleepAmount = 5
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
      OPFOwner = "0xB98f46485e8b9206158D8127BAF81Dbfd6139Cef";
      routerOwner = OPFOwner;
      sleepAmount = 5;
      break;
    case 1285:
      networkName = "moonriver";
      productionNetwork = true;
      OceanTokenAddress = "0x99C409E5f62E4bd2AC142f17caFb6810B8F0BAAE";
      OPFOwner = "0x06100AB868206861a4D7936166A91668c2Ce1312"
      routerOwner = OPFOwner;
      break;
    case 3141:
      networkName = "filecointestnet";
      OPFOwner = '0x06100AB868206861a4D7936166A91668c2Ce1312'
      routerOwner = OPFOwner;
      sleepAmount = 30
      shouldDeployOceanToken = true;
      shouldDeployV4 = true;
      shouldDeployDF = false;
      shouldDeployVE = false;
      gasPrice = null
      gasLimit = null
      break;
    case 44787:
      networkName = "alfajores";
      OPFOwner = '0x06100AB868206861a4D7936166A91668c2Ce1312'
      routerOwner = OPFOwner;
      OceanTokenAddress = "0xd8992Ed72C445c35Cb4A2be468568Ed1079357c8";
      gasLimit = 15000000
      gasPrice = ethers.utils.parseUnits('8', 'gwei')
      sleepAmount = 2
      shouldDeployOceanToken = false;
      shouldDeployV4 = true;
      shouldDeployDF = false;
      shouldDeployVE = false;
      break;

    default:
      OPFOwner = owner.address;
      networkName = "development";
      routerOwner = owner.address;
      shouldDeployMocks = true;
      shouldDeployOceanToken = true;
      sleepAmount = 0
      break;
  }

  if (!routerOwner || !OPFOwner) {
    console.error("We need OPFOwner and routerOwner in order to deploy!");
    return null;
  }
  let options
  if (gasPrice && gasLimit) {
    options = { gasLimit: gasLimit, gasPrice: gasPrice }
  }
  else if (gasPrice && !gasLimit)
    options = { gasPrice: gasPrice }
  else if (gasLimit) {
    options = { gasLimit }
  }
  else
    options = null
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
  if (shouldDeployOceanToken || addresses.Ocean === null) {
    if (logging) console.info("Deploying OceanToken");
    const Ocean = await ethers.getContractFactory("OceanToken", owner);
    let ocean
    if (options) ocean = await Ocean.connect(owner).deploy(owner.address, options);
    else ocean = await Ocean.connect(owner).deploy(owner.address);
    await ocean.deployTransaction.wait();
    addresses.Ocean = ocean.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + ocean.address + " " + owner.address)
    }
    if (OPFOwner != owner.address) {
      let ownershiptx
      if (options) ownershiptx = await ocean.connect(owner).transferOwnership(OPFOwner, options);
      else ownershiptx = await ocean.connect(owner).transferOwnership(OPFOwner);
      await ownershiptx.wait()
    }
  }
  else {
    addresses.Ocean = OceanTokenAddress;
  }
  if (shouldDeployMocks) {
    if (logging) console.info("Deploying Mocks");
    // DEPLOY DAI and USDC for TEST (barge etc)
    // owner will already have a 10k balance both for DAI and USDC
    const ERC20Mock = await ethers.getContractFactory("MockERC20Decimals");
    if (logging) console.info("Deploying DAI MOCK");
    let DAI
    if (options) DAI = await ERC20Mock.connect(owner).deploy("DAI", "DAI", 18, options);
    else DAI = await ERC20Mock.connect(owner).deploy("DAI", "DAI", 18);
    addresses.MockDAI = DAI.address;
    if (logging) console.info("Deploying USDC MOCK");
    let USDC
    if (options) USDC = await ERC20Mock.connect(owner).deploy("USDC", "USDC", 6, options);
    else USDC = await ERC20Mock.connect(owner).deploy("USDC", "USDC", 6);
    addresses.MockUSDC = USDC.address;

  }


  if (shouldDeployOPFCommunityFeeCollector || !addresses.OPFCommunityFeeCollector) {
    if (logging) console.info("Deploying OPF Community Fee");
    const OPFCommunityFeeCollector = await ethers.getContractFactory(
      "OPFCommunityFeeCollector",
      owner
    );
    let opfcommunityfeecollector
    if (options) opfcommunityfeecollector = await OPFCommunityFeeCollector.connect(owner).deploy(
      OPFOwner,
      OPFOwner,
      options
    );
    else opfcommunityfeecollector = await OPFCommunityFeeCollector.connect(owner).deploy(
      OPFOwner,
      OPFOwner)
    await opfcommunityfeecollector.deployTransaction.wait();
    addresses.OPFCommunityFeeCollector = opfcommunityfeecollector.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + opfcommunityfeecollector.address + " " + OPFOwner + " " + OPFOwner)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)
  }

  // v4 contracts
  if (shouldDeployV4) {
    if (logging) console.info("Deploying V4 contracts");
    // DEPLOY ROUTER, SETTING OWNER

    /*if (logging) console.info("Deploying BPool");
    const BPool = await ethers.getContractFactory("BPool", owner);
    const poolTemplate = await BPool.connect(owner).deploy(options);
    const receipt = await poolTemplate.deployTransaction.wait();
    addresses.startBlock = receipt.blockNumber
    addresses.poolTemplate = poolTemplate.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.poolTemplate)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)
    */

    if (logging) console.log("Deploying Router");
    const Router = await ethers.getContractFactory("FactoryRouter", owner);
    let router
    if (options) router = await Router.connect(owner).deploy(
      owner.address,
      addresses.Ocean,
      DEAD_ADDRESS,
      addresses.OPFCommunityFeeCollector,
      [],
      options
    );
    else
      router = await Router.connect(owner).deploy(
        owner.address,
        addresses.Ocean,
        DEAD_ADDRESS,
        addresses.OPFCommunityFeeCollector,
        []);
    const receipt = await router.deployTransaction.wait();
    addresses.startBlock = receipt.blockNumber
    addresses.Router = router.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tcat > args1.js\n");
      console.log("\tmodule.exports=[\n");
      console.log("\t'" + owner.address + "',\n");
      console.log("\t'" + addresses.Ocean + "',\n");
      console.log("\t'" + DEAD_ADDRESS + "',\n");
      console.log("\t'" + addresses.OPFCommunityFeeCollector + "',\n");
      console.log("\t[]\n");
      console.log("\t];");
      console.log("\tCTRL+D");
      console.log("\tnpx hardhat verify --network " + networkName + " --constructor-args args1.js " + addresses.Router)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)
    if (logging) console.info("Deploying FixedrateExchange");
    const FixedPriceExchange = await ethers.getContractFactory(
      "FixedRateExchange",
      owner
    );
    let fixedPriceExchange
    if (options) fixedPriceExchange = await FixedPriceExchange.connect(owner).deploy(
      router.address,
      options
    );
    else
      fixedPriceExchange = await FixedPriceExchange.connect(owner).deploy(
        router.address
      );
    await fixedPriceExchange.deployTransaction.wait();
    addresses.FixedPrice = fixedPriceExchange.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.FixedPrice + " " + router.address)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)
    if (logging) console.info("Deploying StakingContract");
    const SSContract = await ethers.getContractFactory("SideStaking", owner);
    let ssPool
    if (options) ssPool = await SSContract.connect(owner).deploy(router.address, options);
    else ssPool = await SSContract.connect(owner).deploy(router.address);
    await ssPool.deployTransaction.wait();
    addresses.Staking = ssPool.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.Staking + " " + router.address)
    }
    addresses.ERC20Template = {};
    if (sleepAmount > 0) await sleep(sleepAmount)
    if (logging) console.info("Deploying ERC20 Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template", owner);
    let templateERC20
    if (options) templateERC20 = await ERC20Template.connect(owner).deploy(options);
    else templateERC20 = await ERC20Template.connect(owner).deploy();
    await templateERC20.deployTransaction.wait();
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + templateERC20.address)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)
    if (logging) console.info("Deploying ERC20 Enterprise Template");
    const ERC20TemplateEnterprise = await ethers.getContractFactory(
      "ERC20TemplateEnterprise",
      owner
    );
    let templateERC20Enterprise
    if (options) templateERC20Enterprise = await ERC20TemplateEnterprise.connect(owner).deploy(options);
    else templateERC20Enterprise = await ERC20TemplateEnterprise.connect(owner).deploy();
    await templateERC20Enterprise.deployTransaction.wait();
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + templateERC20Enterprise.address)
    }
    addresses.ERC721Template = {};
    if (sleepAmount > 0) await sleep(sleepAmount)
    if (logging) console.info("Deploying ERC721 Template");
    const ERC721Template = await ethers.getContractFactory(
      "ERC721Template",
      owner
    );
    let templateERC721
    if (options) templateERC721 = await ERC721Template.connect(owner).deploy(options);
    else templateERC721 = await ERC721Template.connect(owner).deploy();
    await templateERC721.deployTransaction.wait();
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + templateERC721.address)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)
    if (logging) console.info("Deploying Dispenser");
    const Dispenser = await ethers.getContractFactory("Dispenser", owner);
    let dispenser
    if (options) dispenser = await Dispenser.connect(owner).deploy(router.address, options);
    else dispenser = await Dispenser.connect(owner).deploy(router.address);
    await dispenser.deployTransaction.wait();
    addresses.Dispenser = dispenser.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + dispenser.address + " " + router.address)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)
    if (logging) {
      const params = {

        "ERC721": templateERC721.address,
        "ERC20": templateERC20.address,
        "Router": router.address
      }
      console.info("Deploying ERC721 Factory");
      console.info(params)
    }

    const ERC721Factory = await ethers.getContractFactory("ERC721Factory", owner);
    let factoryERC721
    if (options) factoryERC721 = await ERC721Factory.connect(owner).deploy(
      templateERC721.address,
      templateERC20.address,
      router.address,
      options
    );
    else factoryERC721 = await ERC721Factory.connect(owner).deploy(
      templateERC721.address,
      templateERC20.address,
      router.address);
    await factoryERC721.deployTransaction.wait();
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + factoryERC721.address + " " + templateERC721.address + " " + templateERC20.address + " " + router.address)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)
    addresses.ERC721Factory = factoryERC721.address;



    let nftCount
    if (options) nftCount = await factoryERC721.getCurrentNFTTemplateCount(options);
    else nftCount = await factoryERC721.getCurrentNFTTemplateCount();

    let nftTemplate
    if (options) nftTemplate = await factoryERC721.getNFTTemplate(nftCount, options);
    else nftTemplate = await factoryERC721.getNFTTemplate(nftCount);
    addresses.ERC721Template[nftCount.toString()] = templateERC721.address;
    let currentTokenCount
    if (options) currentTokenCount = await factoryERC721.getCurrentTemplateCount(options);
    else currentTokenCount = await factoryERC721.getCurrentTemplateCount();


    let tokenTemplate
    if (options) tokenTemplate = await factoryERC721.getTokenTemplate(currentTokenCount, options);
    else tokenTemplate = await factoryERC721.getTokenTemplate(currentTokenCount);

    addresses.ERC20Template[currentTokenCount.toString()] = templateERC20.address;
    if (sleepAmount > 0) await sleep(sleepAmount)
    if (logging) console.info("Adding ERC20Enterprise to ERC721Factory");
    let templateadd
    if (options) templateadd = await factoryERC721.connect(owner).addTokenTemplate(templateERC20Enterprise.address, options);
    else templateadd = await factoryERC721.connect(owner).addTokenTemplate(templateERC20Enterprise.address);
    await templateadd.wait();
    if (sleepAmount > 0) await sleep(sleepAmount)
    if (options) currentTokenCount = await factoryERC721.getCurrentTemplateCount(options);
    else currentTokenCount = await factoryERC721.getCurrentTemplateCount(options);

    if (options) tokenTemplate = await factoryERC721.getTokenTemplate(currentTokenCount, options);
    else tokenTemplate = await factoryERC721.getTokenTemplate(currentTokenCount);

    addresses.ERC20Template[currentTokenCount.toString()] =
      templateERC20Enterprise.address;

    // SET REQUIRED ADDRESS
    if (sleepAmount > 0) await sleep(sleepAmount)
    if (logging) console.info("Adding factoryERC721.address(" + factoryERC721.address + ") to router");
    let factoryAddTx
    if (options) factoryAddTx = await router.connect(owner).addFactory(factoryERC721.address, options);
    else factoryAddTx = await router.connect(owner).addFactory(factoryERC721.address);
    await factoryAddTx.wait();
    if (sleepAmount > 0) await sleep(sleepAmount)


    if (logging) console.info("Adding fixedPriceExchange.address(" + fixedPriceExchange.address + ") to router");
    let freAddTx
    if (options) freAddTx = await router.connect(owner).addFixedRateContract(fixedPriceExchange.address, options);
    else freAddTx = await router.connect(owner).addFixedRateContract(fixedPriceExchange.address);
    await freAddTx.wait();
    if (sleepAmount > 0) await sleep(sleepAmount)


    if (logging) console.info("Adding dispenser.address(" + dispenser.address + ") to router");
    let dispenserAddTx
    if (options) dispenserAddTx = await router.connect(owner).addDispenserContract(dispenser.address, options);
    else dispenserAddTx = await router.connect(owner).addDispenserContract(dispenser.address);
    await dispenserAddTx.wait();
    if (sleepAmount > 0) await sleep(sleepAmount)


    if (logging) console.info("Adding ssPool.address(" + ssPool.address + ") to router");
    let ssAddTx
    if (options) ssAddTx = await router.connect(owner).addSSContract(ssPool.address, options);
    else ssAddTx = await router.connect(owner).addSSContract(ssPool.address);
    await ssAddTx.wait();
    if (sleepAmount > 0) await sleep(sleepAmount)

    // add additional tokens
    for (const token of additionalApprovedTokens) {
      if (logging) console.info("Adding " + token + " as approved token");
      let tokenTx
      if (options) tokenTx = await router.connect(owner).addApprovedToken(token, options);
      else tokenTx = await router.connect(owner).addApprovedToken(token);
      await tokenTx.wait();
    }
    // Avoid setting Owner an account we cannot use on barge for now

    if (owner.address != routerOwner) {
      if (logging) console.info("Moving ownerships to " + routerOwner)
      let routerOwnerTx
      if (options) routerOwnerTx = await router.connect(owner).changeRouterOwner(routerOwner, options)
      else routerOwnerTx = await router.connect(owner).changeRouterOwner(routerOwner)
      await routerOwnerTx.wait()

    }
  }

  //VE contracts
  if (shouldDeployVE) {

    //veOCEAN
    if (logging) console.info("Deploying veOCEAN");
    const veOCEAN = await ethers.getContractFactory(
      "veOCEAN",
      owner
    );
    const deployedVEOCEAN = await veOCEAN.connect(owner).deploy(addresses.Ocean, "veOCEAN", "veOCEAN", "0.1.0", options);
    await deployedVEOCEAN.deployTransaction.wait();
    addresses.veOCEAN = deployedVEOCEAN.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.veOCEAN + " " + addresses.Ocean + " veOCEAN veOCEAN 0.1.0")
    }
    if (sleepAmount > 0) await sleep(sleepAmount)

    //veAllocate
    if (logging) console.info("Deploying veAllocate");
    const veAllocate = await ethers.getContractFactory(
      "veAllocate",
      owner
    );
    const deployedVEAllocate = await veAllocate.connect(owner).deploy(options);
    await deployedVEAllocate.deployTransaction.wait();
    addresses.veAllocate = deployedVEAllocate.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.veAllocate)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)

    //veDelegation
    if (logging) console.info("Deploying veDelegation");
    const veDelegation = await ethers.getContractFactory(
      "veDelegation",
      owner
    );
    const deployedVEDelegation = await veDelegation.connect(owner).deploy("Voting Escrow Boost Delegation",
      "veDelegation",
      "",
      addresses.veOCEAN,
      options);
    await deployedVEDelegation.deployTransaction.wait();
    addresses.veDelegation = deployedVEDelegation.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.veDelegation + " \"Voting Escrow Boost Delegation\" \"veDelegation\" \"\" " + addresses.veOCEAN)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)

    //FeeDistributor
    if (logging) console.info("Deploying FeeDistributor");
    const FeeDistributor = await ethers.getContractFactory(
      "veFeeDistributor",
      owner
    );
    const timestamp = Math.floor(new Date().getTime() / 1000)
    const deployedFeeDistributor = await FeeDistributor.connect(owner).deploy(addresses.veOCEAN,
      timestamp,
      addresses.Ocean,
      routerOwner,
      routerOwner, options);
    await deployedFeeDistributor.deployTransaction.wait();
    addresses.veFeeDistributor = deployedFeeDistributor.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.veFeeDistributor + " " + addresses.veOCEAN + " " + timestamp + " " + addresses.Ocean + " " + routerOwner + " " + owner.address)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)

    //DelegationProxy
    if (logging) console.info("Deploying DelegationProxy");
    const DelegationProxy = await ethers.getContractFactory(
      "veDelegationProxy",
      owner
    );
    const deployedDelegationProxy = await DelegationProxy.connect(owner).deploy(addresses.veDelegation,
      routerOwner,
      owner.address, options);
    await deployedDelegationProxy.deployTransaction.wait();
    addresses.veDelegationProxy = deployedDelegationProxy.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.veDelegationProxy + " " + addresses.veDelegation + " " + routerOwner + " " + owner.address)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)

    //veFeeEstimate
    if (logging) console.info("Deploying veFeeEstimate");
    const veFeeEstimate = await ethers.getContractFactory("veFeeEstimate", owner);
    const deployedVeFeeEstimate = await veFeeEstimate.connect(owner).deploy(
      addresses.veOCEAN,
      addresses.veFeeDistributor,
      options);
    await deployedVeFeeEstimate.deployTransaction.wait();
    addresses.veFeeEstimate = deployedVeFeeEstimate.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.veFeeEstimate + " " + addresses.veOCEAN + " " + addresses.veFeeDistributor)
    }


    if (logging) console.info("Deploying SmartWalletChecker");
    const SmartWalletChecker = await ethers.getContractFactory("SmartWalletChecker", owner);
    const deployedSmartWalletChecker = await SmartWalletChecker.connect(owner).deploy(options);
    await deployedSmartWalletChecker.deployTransaction.wait();
    addresses.SmartWalletChecker = deployedSmartWalletChecker.address;
    const commit_checker = await deployedVEOCEAN.connect(owner).commit_smart_wallet_checker(addresses.SmartWalletChecker, options)
    await commit_checker.wait();
    const apply_checker = await deployedVEOCEAN.connect(owner).apply_smart_wallet_checker(options)
    await apply_checker.wait();
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.SmartWalletChecker)
    }

    //ownerships
    if (routerOwner != owner.address) {
      if (logging) console.info("Moving veOcean ownership to " + routerOwner)
      let tx = await deployedVEOCEAN.connect(owner).commit_transfer_ownership(routerOwner, options)
      await tx.wait();
      tx = await deployedVEOCEAN.connect(owner).apply_transfer_ownership(options)
      await tx.wait();
      tx = await deployedSmartWalletChecker.connect(owner).setManager(routerOwner, true, options)
      await tx.wait();
      tx = await deployedSmartWalletChecker.connect(owner).setManager(owner.address, false, options)
      await tx.wait();

    }

  }

  //DF contracts
  if (shouldDeployDF) {
    //DFRewards
    if (logging) console.info("Deploying DFRewards");
    const DFRewards = await ethers.getContractFactory(
      "DFRewards",
      owner
    );
    const deployedDFRewards = await DFRewards.connect(owner).deploy(options);
    await deployedDFRewards.deployTransaction.wait();
    addresses.DFRewards = deployedDFRewards.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.DFRewards)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)

    //DFStrategyV1
    if (logging) console.info("Deploying DFStrategyV1");
    const DFStrategyV1 = await ethers.getContractFactory(
      "DFStrategyV1",
      owner
    );
    const deployedDFStrategyV1 = await DFStrategyV1.connect(owner).deploy(addresses.DFRewards, options);
    await deployedDFStrategyV1.deployTransaction.wait();
    addresses.DFStrategyV1 = deployedDFStrategyV1.address;
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.DFStrategyV1 + " " + addresses.DFRewards)
    }
    if (sleepAmount > 0) await sleep(sleepAmount)
    //add strategy to DFRewards
    const strategyTx = await deployedDFRewards.connect(owner).addStrategy(addresses.DFStrategyV1, options);
    await strategyTx.wait();
    if (owner.address != routerOwner) {
      if (logging) console.info("Moving ownerships to " + routerOwner)
      const DFRewardsOwnerTx = await deployedDFRewards.connect(owner).transferOwnership(routerOwner, options)
      await DFRewardsOwnerTx.wait()
    }
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
    setTimeout(resolve, s * 1000)
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
