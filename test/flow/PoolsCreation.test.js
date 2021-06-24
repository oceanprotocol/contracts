/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

const { impersonate } = require("../helpers/impersonate");
const constants = require("../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const ethers = hre.ethers;

describe("Pools Creation Flow", () => {
  let metadata,
    tokenERC721,
    tokenAddress,
    data,
    flags,
    factoryERC721,
    factoryERC20,
    templateERC721,
    templateERC20,
    erc20Token,
    erc20Token2,
    oceanContract,
    vault,
    pool,
    poolID,
    poolAddress;
 
    const oceanAddress = "0x967da4048cd07ab37855c090aaf366e4ce1b9f48";
    const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
    const balAddress = "0xba100000625a3754423978a60c9317c58a424e3D";
    const vaultAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
    const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
    const OPF_FEE_WITHDRAWAL = 3 // corresponding enum index for ocean community exitKind
    const MP_FEE_WITHDRAWAL = 4 // corresponding enum index for market fee exitKind

  before("init contracts for each test", async () => {
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");
    const ERC20Factory = await ethers.getContractFactory("ERC20Factory");

    const Metadata = await ethers.getContractFactory("Metadata");
    const Router = await ethers.getContractFactory("OceanPoolFactoryRouter");
    const OceanPoolFactory = await ethers.getContractFactory("OceanPoolFactory");

    [owner, reciever, user2, user3, user4, marketFeeCollector, newOwner] = await ethers.getSigners();
    // DEPLOY ROUTER, SETTING OWNER
    router = await Router.deploy(owner.address,oceanAddress)
    // DEPLOY OUR POOL FACTORY
    poolFactory = await OceanPoolFactory.deploy(vaultAddress,router.address,owner.address)
    // ADD THE FACTORY ADDRESS TO THE ROUTER
    await router.addOceanPoolFactory(poolFactory.address);

    vault = await ethers.getContractAt(
      "@balancer-labs/v2-vault/contracts/interfaces/IVault.sol:IVault",
      vaultAddress
    );

    // GET SOME OCEAN TOKEN FROM OUR MAINNET FORK and send them to user3
    const userWithOcean = "0x53aB4a93B31F480d17D3440a6329bDa86869458A";
      await impersonate(userWithOcean);
  
      oceanContract = await ethers.getContractAt(
        "contracts/interfaces/IERC20.sol:IERC20",
        oceanAddress
      );
      signer = ethers.provider.getSigner(userWithOcean);
      await oceanContract
        .connect(signer)
        .transfer(user3.address, ethers.utils.parseEther("10000"));
  
      assert(
        (await oceanContract.balanceOf(user3.address)).toString() ==
          ethers.utils.parseEther("10000")
      );


    data = web3.utils.asciiToHex('SomeData');
    flags = web3.utils.asciiToHex(constants.blob[0]);
    metadata = await Metadata.deploy();
        
    // SETUP ERC20 Factory with template
    templateERC20 = await ERC20Template.deploy();
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );

    // SETUP ERC721 Factory with template
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      communityFeeCollector,
      factoryERC20.address
    );

  
    // SET REQUIRED ADDRESSES
    await metadata.setERC20Factory(factoryERC20.address);
    await factoryERC20.setERC721Factory(factoryERC721.address);

  });

  it("#1 - owner deploys a new ERC721 Contract", async () => {
    // by default connect() in ethers goes with the first address (owner in this case)
    const tx = await factoryERC721
      .deployERC721Contract(
        "NFT",
        "NFTSYMBOL",
        metadata.address,
        data,
        flags,
        1
      );
    const txReceipt = await tx.wait();

    tokenAddress = txReceipt.events[4].args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);

    assert((await tokenERC721.balanceOf(owner.address)) == 1);
  });

  it("#2 - owner adds user2 as manager, which then adds user3 as store updater, metadata updater and erc20 deployer", async () => {
  
    await tokenERC721.addManager(user2.address);
    await tokenERC721.connect(user2).addTo725StoreList(user3.address);
    await tokenERC721.connect(user2).addToCreateERC20List(user3.address);
    await tokenERC721.connect(user2).addToMetadataList(user3.address);

    assert(
      (await tokenERC721._getPermissions(user3.address)).store == true
    );
    assert(
      (await tokenERC721._getPermissions(user3.address)).deployERC20 == true
    );
    assert(
      (await tokenERC721._getPermissions(user3.address)).updateMetadata == true
    );
  });

  it("#3 - user3 deploys a new erc20DT, assigning himself as minter", async () => {
    const trxERC20 = await tokenERC721
    .connect(user3)
    .createERC20("ERC20DT1", "ERC20DT1Symbol", web3.utils.toWei("10000"), 1, user3.address);
      const trxReceiptERC20 = await trxERC20.wait();
    erc20Address = trxReceiptERC20.events[3].args.erc20Address;

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
    assert((await erc20Token.permissions(user3.address)).minter == true);
    
    
  });

  it("#4 - user3 mints new erc20 tokens to himself", async () => {
    await erc20Token.connect(user3).mint(user3.address, web3.utils.toWei("1000"));

    assert(
      (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("1000")
    );
  });

  it("#5 - user3 succeed to deploy a new 2 token Pool WITH OceanToken from our Custom Factory on Balancer V2", async () => {
  
    const tokens = [erc20Token.address, oceanAddress];
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
      await router.connect(user3).deployPool(
        NAME,
        SYMBOL,
        tokens,
        weights,
        swapFeePercentage,
        marketFee,
        user3.address
      )
    ).wait();
    
    const events = receipt.events.filter((e) => e.event === "NewPool");
    poolAddress = events[0].args.poolAddress;
   
    // WE CHECK IF THE POOL WAS DEPLOYED WITH OCEAN TOKEN (ZERO OCEAN FEE)
    assert(events[0].args.isOcean == true)
   
    pool = await ethers.getContractAt('WeightedPool', poolAddress);
    poolID = await pool.getPoolId();
    
    // WE CHECK THAT swapFeeOcean is ZERO
    assert(await pool.swapFeeOcean() == 0)
     // CHECK THAT swapFeeMarket is correct (arbitrary value)
     assert(await pool.swapFeeMarket() == marketFee)
    // WE CHECK IF THE POOL HAS BEEN REGISTERED INTO BALANCER VAULT
    result = await vault.getPool(poolID)
    assert(result[0] == poolAddress)  
  });


  it('#6 - user3 add initial liquidity to the pool he just created', async()=>{
    const tokens = [erc20Token.address, oceanAddress];
    // 1 DT = 10 Ocean
    const initialBalances = [
      ethers.utils.parseEther("100"),
      ethers.utils.parseEther("1000"),
    ];
    const JOIN_KIND_INIT = 0;

    // Construct magic userData
    const initUserData = ethers.utils.defaultAbiCoder.encode(
      ["uint256", "uint256[]"],
      [JOIN_KIND_INIT, initialBalances]
    );
    const joinPoolRequest = {
      assets: tokens,
      maxAmountsIn: initialBalances,
      userData: initUserData,
      fromInternalBalance: false,
    };

    // APPROVE VAULT FOR OCEAN AND ERC20DT
    await oceanContract.connect(user3).approve(
      vaultAddress,
      ethers.utils.parseEther("1000000000")
    );

    await erc20Token.connect(user3).approve(
      vaultAddress,
      ethers.utils.parseEther("1000000000")
    );

    // JOIN POOL (ADD LIQUIDITY)
    const tx = await vault.connect(user3).joinPool(
      poolID,
      user3.address,
      user3.address,
      joinPoolRequest
    );

    receipt = await tx.wait();

    // WE CHECK IF THE POOL HAS BEEN REGISTERED INTO BALANCER VAULT
    result = await vault.getPool(poolID);
    assert(result[0] == poolAddress);
  })
  
  it("#7 - user4 performs a swap from ocean to datatoken", async()=> {
    // user3 sends some ocean token to user4

    await oceanContract.connect(user3).transfer(user4.address, ethers.utils.parseEther('100'))
    assert((await oceanContract.balanceOf(user4.address)).toString() == ethers.utils.parseEther('100').toString())

    // user4 approves the vault to manage ocean tokens
    await oceanContract.connect(user4).approve(
      vaultAddress,
      ethers.utils.parseEther("1000000000")
    );

    const swapStruct= { poolId: poolID, kind:0, assetIn: oceanAddress, assetOut: erc20Token.address, amount: ethers.utils.parseEther("10"), userData: '0x' }
    const fundManagement = { sender: user4.address, fromInternalBalance: false, recipient:  user4.address, toInternalBalance: false}
    const limit = ethers.utils.parseEther("0.5")
    const deadline = Math.round(((new Date()).getTime() / 1000)+600000); // 10 minutes

   
    result = await vault.connect(user4).swap(swapStruct,fundManagement,limit,deadline)
    receipt = await result.wait()
    const events = receipt.events.filter((e) => e.event === "Swap");
   
    //console.log(events)

    const amountIn = events[0].args.amountIn
    const amountOut = events[0].args.amountOut
    console.log(ethers.utils.formatEther(amountOut))
    console.log((await erc20Token.balanceOf(user4.address)).toString())
   // assert((await erc20Token.balanceOf(user4.address)).toString() == amountOut.toString())


  })

  it("#8 - user4 performs a second swap from ocean to datatoken", async()=> {
    

    const swapStruct= { poolId: poolID, kind:0, assetIn: oceanAddress, assetOut: erc20Token.address, amount: ethers.utils.parseEther("10"), userData: '0x' }
    const fundManagement = { sender: user4.address, fromInternalBalance: false, recipient:  user4.address, toInternalBalance: false}
    const limit = ethers.utils.parseEther("0.5")
    const deadline = Math.round(((new Date()).getTime() / 1000)+3600000);

   
    result = await vault.connect(user4).swap(swapStruct,fundManagement,limit,deadline)
    receipt = await result.wait()
    const events = receipt.events.filter((e) => e.event === "Swap");
   
   // console.log(events)

    const amountIn = events[0].args.amountIn
    const amountOut = events[0].args.amountOut
    console.log(ethers.utils.formatEther(amountOut))
    console.log((await erc20Token.balanceOf(user4.address)).toString())
  


  })

  it("#9 - user3 triggers function to exit pools and collecting fees for marketPlace", async()=> {
    // THIS POOL HAS OCEAN TOKEN SO OCEAN COMMUNITY WON'T GET ANY FEES
    // In this pool dt is index 0 and ocean is 1
    const dtIndex = 0
    const oceanIndex = 1

    assert(await pool.communityFees(dtIndex) == 0)  
    assert(await pool.communityFees(oceanIndex) == 0) 
    
    // AT this point we only have fees in Ocean because we only used Ocean as TokenIn
    assert(await pool.marketFees(dtIndex) == 0)
    // current design as marketFeeCollector as address(0). it has to be updated
    await pool.connect(user3).updateMarketCollector(marketFeeCollector.address)
    assert(await pool.marketFeeCollector() == marketFeeCollector.address)
    
    // First we check the total fees in Ocean 
    const totalMarketFeeInOcean = await pool.marketFees(oceanIndex)  
   
    // Creating the arguments for exitPool()
    const tokens = [erc20Token.address, oceanAddress];
    const exitKind = MP_FEE_WITHDRAWAL
      const userData = ethers.utils.defaultAbiCoder.encode(
        ["uint256"],
        [exitKind]
      );
      const ExitPoolRequest = {assets: tokens,
        minAmountsOut:[0,0],
        userData: userData,
        toInternalBalance: false}

      // OCEAN balance in marketFeeCollector
      result = await oceanContract.balanceOf(marketFeeCollector.address)
      assert(result == 0)

      // Market fees collected in Ocean until now, since it's the first time is going to be zero
      assert(await pool.feesCollectedMarket(oceanIndex) == 0)
     // We now EXIT the pool (any user can do it, as long as recipient is marketFeeCollector address)
      await vault.connect(user3).exitPool(poolID,user3.address, marketFeeCollector.address, ExitPoolRequest )
     
      // we check all fees in Ocean for the market where collected 
      assert((await oceanContract.balanceOf(marketFeeCollector.address)).toString() == totalMarketFeeInOcean.toString())
        
      // Since we withdraw the market fee in Ocean, marketFees in Ocean and already collected fees are the same amount
      assert((await pool.feesCollectedMarket(oceanIndex)).toString() == (await pool.marketFees(oceanIndex)).toString())
  })

});
