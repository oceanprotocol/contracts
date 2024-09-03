const hre = require("hardhat");
const fs = require("fs");
const { address } = require("../test/helpers/constants");
const { Wallet } = require("ethers");
const { UV_FS_O_FILEMAP } = require("constants");
const ethers = hre.ethers;

async function main() {
    const networkName = "oasis_saphire_testnet";
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
    const gasPrice = ethers.utils.parseUnits('100', 'gwei')
    const gasLimit = 15000000
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
  
    let wallet;
    if (process.env.MNEMONIC)
      wallet = new Wallet.fromMnemonic(process.env.MNEMONIC);
    if (process.env.PRIVATE_KEY) wallet = new Wallet(process.env.PRIVATE_KEY);
    if (!wallet) {
      console.error("Missing MNEMONIC or PRIVATE_KEY. Aborting..");
      return null;
    }
    owner = wallet.connect(provider);
    const addressFile = process.env.ADDRESS_FILE;
    oldAddresses = JSON.parse(fs.readFileSync(addressFile));
    let addresses=null
    for(addr in oldAddresses){
        if(oldAddresses[addr].chainId==networkDetails.chainId)
            addresses=oldAddresses[addr]
    }
    if (!addresses) {
        console.error("Missing ADDRESS_FILE. Aborting..");
        return null;
    }
    console.log("Using the following as start point:")
    console.log(addresses)
    const factoryERC721 = await ethers.getContractAt("ERC721Factory", addresses["ERC721Factory"]);
    const nftCount = await factoryERC721.connect(owner).getCurrentNFTTemplateCount(options);
    console.log("nftCount")
    console.log(nftCount)
    console.log(await factoryERC721.connect(owner).owner(options));
    
    const currentTokenCount = await factoryERC721.connect(owner).getCurrentTemplateCount(options);
    console.log("currentTokenCount")
    console.log(currentTokenCount)
    for(i=1;i<=currentTokenCount;i++){
        const tokenTemplate = await factoryERC721.connect(owner).getTokenTemplate(i,options);
        console.log("tokenTemplate:"+i)
        console.log(tokenTemplate)
        const erc20Template = await ethers.getContractAt("ERC20Template", tokenTemplate["templateAddress"]);
        const id=await erc20Template.connect(owner).getId()
        console.log(id)
    }
    process.exit(0)
    console.info("Deploying ERC20 Sapphire Template");
    const ERC20Template4 = await ethers.getContractFactory(
        "ERC20Template4",
        owner
      );
    let templateERC20Template4
    if (options) templateERC20Template4 = await ERC20Template4.connect(owner).deploy(options);
    else templateERC20Template4 = await ERC20Template4.connect(owner).deploy();
    await templateERC20Template4.deployTransaction.wait();
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network " + networkName + " " + templateERC20Template4.address)
    

    console.info("Adding ERC20Template4 to ERC721Factory");
    if (options) templateadd = await factoryERC721.connect(owner).addTokenTemplate(templateERC20Template4.address, options);
    else templateadd = await factoryERC721.connect(owner).addTokenTemplate(templateERC20Template4.address);
    await templateadd.wait();
    addresses.ERC20Template[parseInt(currentTokenCount)+1] =
        templateERC20Template4.address;

    // Access lists
    console.info("Deploying Accesslists");
    const AccessListFactory = await ethers.getContractFactory("AccessListFactory");
    const AccessList = await ethers.getContractFactory("AccessList");
    const accessListContract = await AccessList.connect(owner).deploy()
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network " + networkName + " " + accessListContract.address)
  
    const accessListFactoryContract = await AccessListFactory.connect(owner).deploy(accessListContract.address)
    await accessListFactoryContract.deployTransaction.wait();
    addresses.AccessListFactory = accessListFactoryContract.address;
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network " + networkName + " " + addresses.AccessListFactory + " " + accessListContract.address)
    if (owner.address != routerOwner) {
      console.info("Moving ownerships to " + routerOwner)
      const accessListFactoryContractOwnerTx = await accessListFactoryContract.connect(owner).transferOwnership(routerOwner, options)
      await accessListFactoryContractOwnerTx.wait()
    }
    
    if (addressFile) {
          // write address.json if needed
          oldAddresses[networkName] = addresses;
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
