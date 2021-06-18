/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { getContractFactory } = require("@nomiclabs/hardhat-ethers/types");
const ethers = hre.ethers;

describe("OceanFactoryRouter", () => {
  let name,
    symbol,
    owner,
    reciever,
    metadata,
    tokenERC721,
    tokenAddress,
    data,
    flags,
    factoryERC721,
    factoryERC20,
    templateERC721,
    templateERC20,
    newERC721Template,
    router,
    poolFactory,
    oceanContract,
    erc20DTContract,
    vault

  const oceanAddress = "0x967da4048cd07ab37855c090aaf366e4ce1b9f48";
  const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f"
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
  const vaultAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
 

  beforeEach("init contracts for each test", async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/eOqKsGAdsiNLCVm846Vgb-6yY3jlcNEo",
          blockNumber: 12515000,
        }
      }]
    })

    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");
    const ERC20Factory = await ethers.getContractFactory("ERC20Factory");
    const Metadata = await ethers.getContractFactory("Metadata");
    const Router = await ethers.getContractFactory("OceanPoolFactoryRouter");
    const OceanPoolFactory = await ethers.getContractFactory("OceanPoolFactory");
    vault = await ethers.getContractAt("@balancer-labs/v2-vault/contracts/interfaces/IVault.sol:IVault", vaultAddress);

    [owner, reciever, user2, user3] = await ethers.getSigners();
    // DEPLOY ROUTER, SETTING OWNER
    router = await Router.deploy(owner.address,oceanAddress)
    // DEPLOY OUR POOL FACTORY
    poolFactory = await OceanPoolFactory.deploy(vaultAddress,router.address,owner.address)
    // ADD THE FACTORY ADDRESS TO THE ROUTER
    await router.addOceanPoolFactory(poolFactory.address);


    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);
    metadata = await Metadata.deploy();
    
    templateERC20 = await ERC20Template.deploy();
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      communityFeeCollector,
      factoryERC20.address
    );

    newERC721Template = await ERC721Template.deploy();

    await metadata.setERC20Factory(factoryERC20.address);
    await factoryERC20.setERC721Factory(factoryERC721.address);

    const tx = await factoryERC721.deployERC721Contract(
      "DT1",
      "DTSYMBOL",
      metadata.address,
      data,
      flags,
      1
    );
    const txReceipt = await tx.wait();

    tokenAddress = txReceipt.events[4].args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);
    symbol = await tokenERC721.symbol();
    name = await tokenERC721.name();
    assert(name === "DT1");
    assert(symbol === "DTSYMBOL");
    assert((await tokenERC721.balanceOf(owner.address)) == 1);
    
    // INITIAL SET UP, THE MANAGER ADDS A NEW ROLE FOR ITSELF (erc20Deployer role)
    await tokenERC721.addToCreateERC20List(owner.address);
    
    // WE THEN CREATE A NEW ERC20 CONTRACT
    let receipt = await (
    await tokenERC721.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("1000"),
        1
      )
    ).wait();
    const newERC20DT = receipt.events[3].args.erc20Address;

    erc20DTContract = await ethers.getContractAt(
      "ERC20Template",
      newERC20DT
    );

    // WE ADD OURSELF AS MINTER AND THEN MINT SOME ERC20 DATATOKEN.
    await erc20DTContract.addMinter(owner.address);
    await erc20DTContract.mint(owner.address, web3.utils.toWei("100"));
    assert(await erc20DTContract.balanceOf(owner.address) == web3.utils.toWei("100"))


  });

  it("#oceanPoolFactory - should confirm oceanPoolFactory",async () => {
     assert(await router.oceanPoolFactory() == poolFactory.address);
  })

  it("#addOceanPoolFactory - should fail to update poolFactory if NOT Router Owner",async () => {
    await expectRevert(router.connect(user2).addOceanPoolFactory(user2.address), "OceanRouter: NOT OWNER")
  })

  it("#addOceanPoolFactory - should allow to update poolFactory if Router Owner",async () => {
    await router.addOceanPoolFactory(user2.address)
    assert(await router.oceanPoolFactory() == user2.address);
  })

  it("#oceanTokens - should confirm Ocean token has been added to the mapping",async () => {
    assert(await router.oceanTokens(oceanAddress) == true);
  })

  it("#addOceanToken - should add a new token address to the mapping if Router Owner",async () => {
    assert(await router.oceanTokens(user2.address) == false);
    await router.addOceanToken(user2.address)
    assert(await router.oceanTokens(user2.address) == true);
  })

  it("#addOceanToken - should fail to add a new token address to the mapping if NOT Router Owner",async () => {
    await expectRevert(router.connect(user2).addOceanToken(user2.address), "OceanRouter: NOT OWNER")
    assert(await router.oceanTokens(user2.address) == false);
   
  })



  it("#deployPool - should succeed to deploy a new 2 token Pool WITH OceanToken from our Custom Factory on Balancer V2", async () => {
  
    const tokens = [erc20DTContract.address, oceanAddress];
    const weights = [
      ethers.utils.parseEther("0.5"),
      ethers.utils.parseEther("0.5"),
    ];

    const NAME = "Two-token Pool";
    const SYMBOL = "OCEAN-DT-50-50";
    const swapFeePercentage = 3e15; // 0.3%
    const marketFee = 1e15;
   
    // DEPLOY A BALANCER POOL THROUGH THE ROUTER, FROM OCEAN CUSTOM FACTORY
    receipt = await (
      await router.deployPool(
        NAME,
        SYMBOL,
        tokens,
        weights,
        swapFeePercentage,
        marketFee,
        owner.address
      )
    ).wait();
    
    const events = receipt.events.filter((e) => e.event === "NewPool");
    const poolAddress = events[0].args.poolAddress;
   
    // WE CHECK IF THE POOL WAS DEPLOYED WITH OCEAN TOKEN (ZERO OCEAN FEE)
    assert(events[0].args.isOcean == true)
   
    const pool = await ethers.getContractAt('WeightedPool', poolAddress);
    const poolID = await pool.getPoolId();
    
    // WE CHECK THAT swapFeeOcean is ZERO
    assert(await pool.swapFeeOcean() == 0)
    // WE CHECK IF THE POOL HAS BEEN REGISTERED INTO BALANCER VAULT
    result = await vault.getPool(poolID)
    assert(result[0] == poolAddress)  
  });

  it("#deployPool - should succeed to deploy a new 2 token Pool WITHOUT OceanToken from our Custom Factory on Balancer V2", async () => {
    const tokens = [daiAddress, erc20DTContract.address];
    const weights = [
      ethers.utils.parseEther("0.5"),
      ethers.utils.parseEther("0.5"),
    ];

    const NAME = "Two-token Pool";
    const SYMBOL = "DAI-DT-50-50";
    const swapFeePercentage = 3e15; // 0.3%
    const marketFee = 1e15;
   
   // DEPLOY A BALANCER POOL THROUGH THE ROUTER, FROM OCEAN CUSTOM FACTORY
    receipt = await (
      await router.deployPool(
        NAME,
        SYMBOL,
        tokens,
        weights,
        swapFeePercentage,
        marketFee,
        owner.address
      )
    ).wait();
    
    const events = receipt.events.filter((e) => e.event === "NewPool");
    const poolAddress = events[0].args.poolAddress;
    assert(events[0].args.isOcean == false)
   
    const pool = await ethers.getContractAt('WeightedPool', poolAddress);
    const poolID = await pool.getPoolId();
   
    // CHECK THAT swapFeeOcean is 1e15
    assert(await pool.swapFeeOcean() == 1e15)

    // CHECK THAT swapFeeMarket is correct (arbitrary value)
    assert(await pool.swapFeeMarket() == marketFee)

    // WE CHECK IF THE POOL HAS BEEN REGISTERED INTO BALANCER VAULT
    result = await vault.getPool(poolID)
    assert(result[0] == poolAddress)  
  });
  it("#deployPool - should succeed to deploy a new multiple token Pool WITH OceanToken from our Custom Factory on Balancer V2", async () => {
  
    const tokens = [daiAddress, erc20DTContract.address, oceanAddress];
    const weights = [
      ethers.utils.parseEther("0.3"),
      ethers.utils.parseEther("0.5"),
      ethers.utils.parseEther("0.2"),
    ];

    const NAME = "3-token Pool";
    const SYMBOL = "DAI-DT-OCEAN";
    const swapFeePercentage = 3e15; // 0.3%
    const marketFee = 9e15; // 0.9%
   
    // DEPLOY A BALANCER POOL THROUGH THE ROUTER, FROM OCEAN CUSTOM FACTORY
    receipt = await (
      await router.deployPool(
        NAME,
        SYMBOL,
        tokens,
        weights,
        swapFeePercentage,
        marketFee,
        owner.address
      )
    ).wait();
    
    const events = receipt.events.filter((e) => e.event === "NewPool");
    const poolAddress = events[0].args.poolAddress;
    assert(events[0].args.isOcean == true)
   
    const pool = await ethers.getContractAt('WeightedPool', poolAddress);
    const poolID = await pool.getPoolId();
    
     // WE CHECK THAT swapFeeOcean is ZERO
     assert(await pool.swapFeeOcean() == 0)
    
     // CHECK THAT swapFeeMarket is correct (arbitrary value)
    assert(await pool.swapFeeMarket() == marketFee)

    // WE CHECK IF THE POOL HAS BEEN REGISTERED INTO BALANCER VAULT
    result = await vault.getPool(poolID)
    assert(result[0] == poolAddress)  
  });
  it("#deployPool - should succeed to deploy a new multiple token Pool WITHOUT OceanToken from our Custom Factory on Balancer V2", async () => {
  
    const tokens = [daiAddress, erc20DTContract.address, usdcAddress];
    const weights = [
      ethers.utils.parseEther("0.3"),
      ethers.utils.parseEther("0.5"),
      ethers.utils.parseEther("0.2"),
    ];

    const NAME = "3-token Pool";
    const SYMBOL = "DAI-DT-USDC";
    const swapFeePercentage = 3e15; // 0.3%
    const marketFee = 1e14;
   
    // DEPLOY A BALANCER POOL THROUGH THE ROUTER, FROM OCEAN CUSTOM FACTORY
    receipt = await (
      await router.deployPool(
        NAME,
        SYMBOL,
        tokens,
        weights,
        swapFeePercentage,
        marketFee,
        owner.address
      )
    ).wait();
    
    const events = receipt.events.filter((e) => e.event === "NewPool");
    const poolAddress = events[0].args.poolAddress;
    assert(events[0].args.isOcean == false)
   
    const pool = await ethers.getContractAt('WeightedPool', poolAddress);
    const poolID = await pool.getPoolId();
    
     // WE CHECK THAT swapFeeOcean is 1e15
    assert(await pool.swapFeeOcean() == 1e15)
    
     // CHECK THAT swapFeeMarket is correct (arbitrary value)
    assert(await pool.swapFeeMarket() == marketFee)

    // WE CHECK IF THE POOL HAS BEEN REGISTERED INTO BALANCER VAULT
    result = await vault.getPool(poolID)
    assert(result[0] == poolAddress)  
  });
});


