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
const shouldDeployOPFCommunity = true;
const logging = true;
async function main() {
  const url = process.env.NETWORK_RPC_URL;
  console.log(url);
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
  console.log(owner);
  let oceanAddress;
  let communityCollector;
  let OPFOwner;
  let balancerV1Factory = null;
  switch (network.chainId) {
    default:
      oceanAddress = "0x967da4048cd07ab37855c090aaf366e4ce1b9f48";
      OPFOwner = "0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725";
      networkName = "development";
      routerOwner = owner.address;
      shouldDeployOceanMock = true;
      break;
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

  addresses.chainId = networkDetails.chainId;
  if (shouldDeployOceanMock) {
    if (logging) console.info("Deploying OceanMock");
    const Ocean = await ethers.getContractFactory("MockOcean", owner);
    const ocean = await Ocean.connect(owner).deploy(owner.address);
    addresses.Ocean = ocean.address;
    // DEPLOY DAI and USDC for TEST (barge etc)
    // owner will already have a 10k balance both for DAI and USDC
    const ERC20Mock = await ethers.getContractFactory("MockERC20Decimals");
    if (logging) console.info("Deploying DAI MOCK");
    const DAI = await ERC20Mock.connect(owner).deploy("DAI", "DAI", 18);
    addresses.MockDAI = DAI.address;
    if (logging) console.info("Deploying USDC MOCK");
    const USDC = await ERC20Mock.connect(owner).deploy("USDC", "USDC", 6);
    addresses.MockUSDC = USDC.address;
  
  }
  if (logging) console.info("Deploying OPF Community Fee");
  const OPFCommunityFeeCollector = await ethers.getContractFactory(
    "OPFCommunityFeeCollector",
    owner
  );
  const opfcommunityfeecollector = await OPFCommunityFeeCollector.deploy(
    OPFOwner,
    OPFOwner
  );
  addresses.OPFCommunityFeeCollector = opfcommunityfeecollector.address;

  if (logging) console.info("Deploying V4 contracts");
  // v4 contracts

  // DEPLOY ROUTER, SETTING OWNER

  if (logging) console.info("Deploying BPool");
  const BPool = await ethers.getContractFactory("BPool", owner);
  const poolTemplate = await BPool.deploy();
  addresses.poolTemplate = poolTemplate.address;

  if (logging) console.log("Deploying Router");
  const Router = await ethers.getContractFactory("FactoryRouter", owner);
  const router = await Router.deploy(
    owner.address,
    addresses.Ocean,
    poolTemplate.address,
    addresses.OPFCommunityFeeCollector,
    []
  );
  addresses.Router = router.address;

  if (logging) console.info("Deploying FixedrateExchange");
  const FixedPriceExchange = await ethers.getContractFactory(
    "FixedRateExchange",
    owner
  );
  const fixedPriceExchange = await FixedPriceExchange.deploy(
    router.address,
    addresses.OPFCommunityFeeCollector
  );
  addresses.FixedPrice = fixedPriceExchange.address;

  if (logging) console.info("Deploying StakingContract");
  const SSContract = await ethers.getContractFactory("SideStaking", owner);
  const ssPool = await SSContract.deploy(router.address);
  addresses.Staking = ssPool.address;

  addresses.ERC20Template = {};
  if (logging) console.info("Deploying ERC20 Template");
  const ERC20Template = await ethers.getContractFactory("ERC20Template", owner);
  const templateERC20 = await ERC20Template.deploy();

  if (logging) console.info("Deploying ERC20 Enterprise Template");
  const ERC20TemplateEnterprise = await ethers.getContractFactory(
    "ERC20TemplateEnterprise",
    owner
  );
  const templateERC20Enterprise = await ERC20TemplateEnterprise.deploy();

  addresses.ERC721Template = {};
  if (logging) console.info("Deploying ERC721 Template");
  const ERC721Template = await ethers.getContractFactory(
    "ERC721Template",
    owner
  );
  const templateERC721 = await ERC721Template.deploy();

  if (logging) console.info("Deploying Dispenser");
  const Dispenser = await ethers.getContractFactory("Dispenser", owner);
  const dispenser = await Dispenser.deploy(router.address);
  addresses.Dispenser = dispenser.address;

  if (logging) console.info("Deploying ERC721 Factory");
  const ERC721Factory = await ethers.getContractFactory("ERC721Factory", owner);
  const factoryERC721 = await ERC721Factory.deploy(
    templateERC721.address,
    templateERC20.address,
    addresses.OPFCommunityFeeCollector,
    router.address
  );
  addresses.ERC721Factory = factoryERC721.address;
  const nftCount = await factoryERC721.getCurrentNFTTemplateCount();
  const nftTemplate = await factoryERC721.getNFTTemplate(nftCount);
  addresses.ERC721Template[nftCount.toString()] = templateERC721.address;

  let currentTokenCount = await factoryERC721.getCurrentTemplateCount();
  let tokenTemplate = await factoryERC721.getTokenTemplate(currentTokenCount);
  addresses.ERC20Template[currentTokenCount.toString()] = templateERC20.address;

  if (logging) console.info("Adding ERC20Enterprise to ERC721Factory");
  await factoryERC721.addTokenTemplate(templateERC20Enterprise.address);
  currentTokenCount = await factoryERC721.getCurrentTemplateCount();
  tokenTemplate = await factoryERC721.getTokenTemplate(currentTokenCount);
  addresses.ERC20Template[currentTokenCount.toString()] =
    templateERC20Enterprise.address;

  // SET REQUIRED ADDRESS

  if (logging) console.info("Adding factoryERC721.address");
  await router.connect(owner).addFactory(factoryERC721.address);
  if (logging) console.info("Adding fixedPriceExchange.address");
  await router.connect(owner).addFixedRateContract(fixedPriceExchange.address);
  if (logging) console.info("Adding dispenser.address");
  await router.connect(owner).addDispenserContract(dispenser.address);
  if (logging) console.info("Adding ssPool.address");
  await router.connect(owner).addSSContract(ssPool.address);
  // Avoid setting Owner an account we cannot use on barge for now
  if (logging) console.info("Moving Router ownership")
  await router.connect(owner).changeRouterOwner(routerOwner)

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
