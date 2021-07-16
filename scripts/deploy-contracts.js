// We require the Hardhat Runtime Environment explicitly here. This is optional 
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const fs = require('fs');
const { address } = require("../test/helpers/constants");
const { Wallet } = require("ethers");
const ethers = hre.ethers;

async function main() {
  const url = process.env.NETWORK_RPC_URL;
  if(!url){
    console.error("Missing NETWORK_RPC_URL. Aborting..");
    return null;
  }
  const provider = new ethers.providers.JsonRpcProvider(url);
  const network = provider.getNetwork()
  let wallet
  if(process.env.MNEMONIC)
    wallet = new Wallet.fromMnemonic(process.env.MNEMONIC)
  if(process.env.PRIVATE_KEY)
    wallet = new Wallet(process.env.PRIVATE_KEY)
  if(!wallet){
    console.error("Missing MNEMONIC or PRIVATE_KEY. Aborting..");
    return null;
  }
  owner = wallet.connect(provider);
  
  const oceanAddress = "0x967da4048cd07ab37855c090aaf366e4ce1b9f48";
  const vaultAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  
  
  const ERC721Template = await ethers.getContractFactory("ERC721Template",owner);
  const ERC20Template = await ethers.getContractFactory("ERC20Template",owner);
  const ERC721Factory = await ethers.getContractFactory("ERC721Factory",owner);
  const ERC20Factory = await ethers.getContractFactory("ERC20Factory",owner);

  const Metadata = await ethers.getContractFactory("Metadata",owner);
  
  const Router = await ethers.getContractFactory("OceanPoolFactoryRouter",owner);

  const ForkFactory = await ethers.getContractFactory("BFactory",owner);
  const PoolForkTemplate = await ethers.getContractFactory("BPool",owner);
  const Ocean = await ethers.getContractFactory('MockOcean',owner)
  
  const templateERC20 = await ERC20Template.deploy();
  const factoryERC20 = await ERC20Factory.deploy(
    templateERC20.address,
    communityFeeCollector
  );
  const metadata = await Metadata.deploy(factoryERC20.address);
  const templateERC721 = await ERC721Template.deploy();
  const factoryERC721 = await ERC721Factory.deploy(
    templateERC721.address,
    communityFeeCollector,
    factoryERC20.address,
    metadata.address
  );


    // WE DEPLOY THE FRIENDLY FORK (BALANCER V1)
    const poolForkTemplate = await PoolForkTemplate.deploy()
    const fork = await ForkFactory.deploy(poolForkTemplate.address)
   // DEPLOY ROUTER, SETTING OWNER
   const router = await Router.deploy(owner.address, oceanAddress,vaultAddress);

   
 // await metadata.setERC20Factory(factoryERC20.address);
  await factoryERC20.setERC721Factory(factoryERC721.address);


  
  
  const ocean = await Ocean.deploy(owner.address)
    
  const addressFile = process.env.ADDRESS_FILE
  if(addressFile){
    let oldAddresses
        try {
            oldAddresses = JSON.parse(fs.readFileSync(addressFile))
        } catch (e) { 
          console.log(e)
          oldAddresses = {} }
    const networkName = 'development'
    if(!oldAddresses[networkName])
      oldAddresses[networkName]={}
    const addresses = oldAddresses[networkName]
    console.log(oldAddresses)
    console.log(addressFile)
    console.log(metadata.address,"METADATA")
    console.log(factoryERC20.address,"FACTORY ERC20")
    console.log(factoryERC721.address, "FACTORY ERC721")
    console.log(router.address,"POOL ROUTER")
    console.log(ocean.address, "OCEAN MOCKED");
    addresses.Metadata = metadata.address
    addresses.ERC721Factory = factoryERC721.address
    addresses.ERC20Factory = factoryERC20.address
    addresses.OceanPoolFactoryRouter = router.address
    addresses.ERC20Template = templateERC20.address
    addresses.Ocean = ocean.address
    addresses.ERC721Template = templateERC721.address
    addresses.FactoryRouter = router.address
    addresses.chainId = network.chainId
    //addresses.Ocean
    oldAddresses[networkName] = addresses
    console.info('writing to ' + addressFile)
    try{
      fs.writeFileSync(addressFile, JSON.stringify(oldAddresses, null, 2))
    }catch(e){
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
