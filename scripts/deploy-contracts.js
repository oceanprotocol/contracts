// We require the Hardhat Runtime Environment explicitly here. This is optional 
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const fs = require('fs');
const { address } = require("../test/helpers/constants");
const { Wallet } = require("ethers");
const { UV_FS_O_FILEMAP } = require("constants");
const ethers = hre.ethers;

const shouldDeployV4 = true
const shouldDeployV3 = true
const shouldDeployOceanMock = true
const shouldDeployOPFCommunity = true
const logging = true
async function main() {
  const url = process.env.NETWORK_RPC_URL;
  if (!url) {
    console.error("Missing NETWORK_RPC_URL. Aborting..");
    return null;
  }
  const provider = new ethers.providers.JsonRpcProvider(url);
  const network = provider.getNetwork()
  let wallet
  if (process.env.MNEMONIC)
    wallet = new Wallet.fromMnemonic(process.env.MNEMONIC)
  if (process.env.PRIVATE_KEY)
    wallet = new Wallet(process.env.PRIVATE_KEY)
  if (!wallet) {
    console.error("Missing MNEMONIC or PRIVATE_KEY. Aborting..");
    return null;
  }
  owner = wallet.connect(provider);
  let oceanAddress
  let vaultAddress
  let communityCollector
  let OPFOwner
  let balancerV1Factory = null
  switch (network.chainId) {
    default:
      oceanAddress = "0x967da4048cd07ab37855c090aaf366e4ce1b9f48";
      vaultAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
      communityCollector = '0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725';
      OPFOwner = '0x7DF5273aD9A6fCce64D45c64c1E43cfb6F861725';
      networkName = 'development'
      break;
  }

  const addressFile = process.env.ADDRESS_FILE
  let oldAddresses
  let address
  if (addressFile) {
    try {
      oldAddresses = JSON.parse(fs.readFileSync(addressFile))
    } catch (e) {
      console.log(e)
      oldAddresses = {}
    }
    if (!oldAddresses[networkName])
      oldAddresses[networkName] = {}
      addresses = oldAddresses[networkName]
  }
  if (!addresses.v4)
    addresses.v4 = {}
  if (!addresses.v3)
    addresses.v3 = {}
  if(logging)
    console.info("Use existing addresses:" + JSON.stringify(addresses, null, 2))
  
  // utils
  const networkDetails = await network
  addresses.chainId = networkDetails.chainId
  if(shouldDeployOceanMock){
    if(logging) console.info("Deploying OceanMock")
    const Ocean = await ethers.getContractFactory('MockOcean', owner)
    const ocean = await Ocean.deploy(owner.address)
    addresses.Ocean = ocean.address
  }
  if(logging) console.info("Deploying OPF Community Fee")
  const OPFCommunityFeeCollector = await ethers.getContractFactory("OPFCommunityFeeCollector", owner)
  const opfcommunityfeecollector = await OPFCommunityFeeCollector.deploy(communityCollector, OPFOwner)
  addresses.OPFCommunityFeeCollector = opfcommunityfeecollector.address
  

  if (shouldDeployV4) {
    if(logging) console.info("Deploying V4 contracts")
    // v4 contracts
    const ERC721Template = await ethers.getContractFactory("ERC721Template", owner);
    const ERC20Template = await ethers.getContractFactory("ERC20Template", owner);
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory", owner);
    const ERC20Factory = await ethers.getContractFactory("ERC20Factory", owner);
    const Metadata = await ethers.getContractFactory("Metadata", owner);
    
    if(logging) console.info("Deploying ERC20 Template")
    const templateERC20 = await ERC20Template.deploy();
    if(logging) console.info("Deploying ERC20 Factory")
    const factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      addresses.OPFCommunityFeeCollector
    );
    if(logging) console.info("Deploying Metadata")
    const metadata = await Metadata.deploy(factoryERC20.address);
    if(logging) console.info("Deploying ERC721 Template")
    const templateERC721 = await ERC721Template.deploy();
    if(logging) console.info("Deploying ERC721 Factory")
    const factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      addresses.OPFCommunityFeeCollector,
      factoryERC20.address,
      metadata.address
    );
    
    // await metadata.setERC20Factory(factoryERC20.address);
    await factoryERC20.setERC721Factory(factoryERC721.address);
    addresses.v4.Metadata = metadata.address
    addresses.v4.ERC721Factory = factoryERC721.address
    addresses.v4.ERC20Factory = factoryERC20.address
    addresses.v4.ERC20Template = templateERC20.address
    addresses.v4.ERC721Template = templateERC721.address
    
    if (!vaultAddress) {
      // WE DEPLOY THE FRIENDLY FORK (BALANCER V1)
  
    }
    else{
      // DEPLOY ROUTER, SETTING OWNER
      const Router = await ethers.getContractFactory("OceanPoolFactoryRouter", owner);
      const router = await Router.deploy(owner.address, oceanAddress, vaultAddress);
      addresses.v4.FactoryRouter = router.address
      addresses.v4.OceanPoolFactoryRouter = router.address
    }
    if (balancerV1Factory)
      addresses.v4.BFactory = balancerV1Factory.address
  }

  if(shouldDeployV3){
    if(logging) console.info("Deploying V3 contracts")
    // v3 contracts
    const V3DataTokenTemplate = await ethers.getContractFactory("V3DataTokenTemplate", owner);
    const V3DataTokenFactory = await ethers.getContractFactory("V3DTFactory", owner);
    if(logging) console.info("Deploying ERC20 Template")
    const templateERC20 = await V3DataTokenTemplate.deploy(
            'DataTokenTemplate',
            'DTT',
            owner.address,
            100000,
            'http://oceanprotocol.com',
            addresses.OPFCommunityFeeCollector
    );
    if(logging) console.info("Deploying ERC20 Factory")
    const factoryERC20 = await V3DataTokenFactory.deploy(
      templateERC20.address,
      addresses.OPFCommunityFeeCollector
    );
    addresses.v3.DTFactory= factoryERC20.address

    const ForkFactory = await ethers.getContractFactory("V3BFactory", owner);
    const PoolForkTemplate = await ethers.getContractFactory("V3BPool", owner);
    const poolForkTemplate = await PoolForkTemplate.deploy()
    V3balancerFactory = await ForkFactory.deploy(poolForkTemplate.address)
    addresses.v3.BFactory = V3balancerFactory.address

    const FixedRateExchange = await ethers.getContractFactory("FixedRateExchange", owner)
    const fixedRateExchange = await FixedRateExchange.deploy();
    addresses.v3.FixedRateExchange = fixedRateExchange.address
    
    const Dispenser = await ethers.getContractFactory("Dispenser", owner)
    const dispenser = await Dispenser.deploy();
    addresses.v3.Dispenser = dispenser.address

    const V3Metadata = await ethers.getContractFactory("V3Metadata", owner)
    const metadata = await V3Metadata.deploy();
    addresses.v3.Metadata = metadata.address
  }

  if (addressFile) {
    // write address.json if needed
    oldAddresses[networkName] = addresses
    if(logging) console.info('writing to ' + addressFile + '\r\n' + JSON.stringify(oldAddresses, null, 2))
    try {
      fs.writeFileSync(addressFile, JSON.stringify(oldAddresses, null, 2))
    } catch (e) {
      console.error(e)
    }
  }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
