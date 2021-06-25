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
    daiContract,
    vault,
    signer,
    pool,
    poolID,
    poolAddress;

  const oceanAddress = "0x967da4048cd07ab37855c090aaf366e4ce1b9f48";
  const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
  const balAddress = "0xba100000625a3754423978a60c9317c58a424e3D";
  const vaultAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  const OPF_FEE_WITHDRAWAL = 3; // corresponding enum index for ocean community exitKind
  const MP_FEE_WITHDRAWAL = 4; // corresponding enum index for market fee exitKind

  before("init contracts for each test", async () => {
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");
    const ERC20Factory = await ethers.getContractFactory("ERC20Factory");

    const Metadata = await ethers.getContractFactory("Metadata");
    const Router = await ethers.getContractFactory("OceanPoolFactoryRouter");
    const OceanPoolFactory = await ethers.getContractFactory(
      "OceanPoolFactory"
    );

    [
      owner, // nft owner, 721 deployer
      reciever,
      user2, // 721Contract manager
      user3, // pool creator and liquidity provider
      user4, // user that swaps in POOL1
      user5, // user that swaps in POOL2
      user6,
      marketFeeCollector, // POOL1
      newMarketFeeCollector, // POOL1
      pool2MarketFeeCollector, // POOL2
    ] = await ethers.getSigners();

    // DEPLOY ROUTER, SETTING OWNER
    router = await Router.deploy(owner.address, oceanAddress);
    // DEPLOY OUR POOL FACTORY
    poolFactory = await OceanPoolFactory.deploy(
      vaultAddress,
      router.address,
      owner.address
    );
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

    // GET SOME DAI (A NEW TOKEN different from OCEAN)
    const userWithDAI = "0xB09cD60ad551cE7fF6bc97458B483A8D50489Ee7";

    await impersonate(userWithDAI);

    daiContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      daiAddress
    );
    signer = ethers.provider.getSigner(userWithDAI);
    await daiContract
      .connect(signer)
      .transfer(user3.address, ethers.utils.parseEther("10000"));

    console.log((await daiContract.balanceOf(user3.address)).toString());

    assert(
      (await daiContract.balanceOf(user3.address)).toString() ==
        ethers.utils.parseEther("10005")
    );

    data = web3.utils.asciiToHex("SomeData");
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
    const tx = await factoryERC721.deployERC721Contract(
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

    assert((await tokenERC721._getPermissions(user3.address)).store == true);
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
      .createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("100000"),
        1,
        user3.address
      );
    const trxReceiptERC20 = await trxERC20.wait();
    erc20Address = trxReceiptERC20.events[3].args.erc20Address;

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
    assert((await erc20Token.permissions(user3.address)).minter == true);
  });

  it("#4 - user3 mints new erc20 tokens to himself", async () => {
    await erc20Token
      .connect(user3)
      .mint(user3.address, web3.utils.toWei("10000"));

    assert(
      (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("10000")
    );
  });

  describe("POOL #1: 2 Token pool with OCEAN token and market Fee at 0.1%, AmountIn only test", async () => {
    it("#1 - user3 succeed to deploy a new 2 token Pool WITH OceanToken from our Custom Factory on Balancer V2", async () => {
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
        await router
          .connect(user3)
          .deployPool(
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
      assert(events[0].args.isOcean == true);

      pool = await ethers.getContractAt("WeightedPool", poolAddress);
      poolID = await pool.getPoolId();

      // WE CHECK THAT swapFeeOcean is ZERO
      assert((await pool.swapFeeOcean()) == 0);
      // CHECK THAT swapFeeMarket is correct (arbitrary value)
      assert((await pool.swapFeeMarket()) == marketFee);
      // WE CHECK IF THE POOL HAS BEEN REGISTERED INTO BALANCER VAULT
      result = await vault.getPool(poolID);
      assert(result[0] == poolAddress);
    });

    it("#2 - user3 add initial liquidity to the pool he just created", async () => {
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
      await oceanContract
        .connect(user3)
        .approve(vaultAddress, ethers.utils.parseEther("1000000000"));

      await erc20Token
        .connect(user3)
        .approve(vaultAddress, ethers.utils.parseEther("1000000000"));

      // JOIN POOL (ADD LIQUIDITY)
      const tx = await vault
        .connect(user3)
        .joinPool(poolID, user3.address, user3.address, joinPoolRequest);

      receipt = await tx.wait();

      // WE CHECK IF THE POOL HAS BEEN REGISTERED INTO BALANCER VAULT
      result = await vault.getPool(poolID);
      assert(result[0] == poolAddress);
    });

    it("#3 - user4 performs a swap from ocean to datatoken", async () => {
      // user3 sends some ocean token to user4

      await oceanContract
        .connect(user3)
        .transfer(user4.address, ethers.utils.parseEther("100"));
      assert(
        (await oceanContract.balanceOf(user4.address)).toString() ==
          ethers.utils.parseEther("100").toString()
      );

      // user4 approves the vault to manage ocean tokens
      await oceanContract
        .connect(user4)
        .approve(vaultAddress, ethers.utils.parseEther("1000000000"));

      const swapStruct = {
        poolId: poolID,
        kind: 0,
        assetIn: oceanAddress,
        assetOut: erc20Token.address,
        amount: ethers.utils.parseEther("10"),
        userData: "0x",
      };
      const fundManagement = {
        sender: user4.address,
        fromInternalBalance: false,
        recipient: user4.address,
        toInternalBalance: false,
      };
      const limit = ethers.utils.parseEther("0.5");
      const deadline = Math.round(new Date().getTime() / 1000 + 600000); // 10 minutes

      result = await vault
        .connect(user4)
        .swap(swapStruct, fundManagement, limit, deadline);
      receipt = await result.wait();
      const events = receipt.events.filter((e) => e.event === "Swap");

      //console.log(events)

      const amountIn = events[0].args.amountIn;
      const amountOut = events[0].args.amountOut;
      console.log(ethers.utils.formatEther(amountOut));
      console.log((await erc20Token.balanceOf(user4.address)).toString());
      // assert((await erc20Token.balanceOf(user4.address)).toString() == amountOut.toString())
    });

    it("#4 - user4 performs a second swap from ocean to datatoken", async () => {
      const swapStruct = {
        poolId: poolID,
        kind: 0,
        assetIn: oceanAddress,
        assetOut: erc20Token.address,
        amount: ethers.utils.parseEther("10"),
        userData: "0x",
      };
      const fundManagement = {
        sender: user4.address,
        fromInternalBalance: false,
        recipient: user4.address,
        toInternalBalance: false,
      };
      const limit = ethers.utils.parseEther("0.5");
      const deadline = Math.round(new Date().getTime() / 1000 + 3600000);

      result = await vault
        .connect(user4)
        .swap(swapStruct, fundManagement, limit, deadline);
      receipt = await result.wait();
      const events = receipt.events.filter((e) => e.event === "Swap");

      // console.log(events)

      const amountIn = events[0].args.amountIn;
      const amountOut = events[0].args.amountOut;
      console.log(ethers.utils.formatEther(amountOut));
      console.log((await erc20Token.balanceOf(user4.address)).toString());
    });

    it("#5 - user3 triggers function to exit pools and collecting fees for marketPlace", async () => {
      // THIS POOL HAS OCEAN TOKEN SO OCEAN COMMUNITY WON'T GET ANY FEES
      // In this pool dt is index 0 and ocean is 1
      const dtIndex = 0;
      const oceanIndex = 1;

      assert((await pool.communityFees(dtIndex)) == 0);
      assert((await pool.communityFees(oceanIndex)) == 0);

      // AT this point we only have fees in Ocean because we only used Ocean as TokenIn
      assert((await pool.marketFees(dtIndex)) == 0);
      // current design as marketFeeCollector as address(0). it has to be updated
      await pool
        .connect(user3)
        .updateMarketCollector(marketFeeCollector.address);
      assert((await pool.marketFeeCollector()) == marketFeeCollector.address);

      // First we check the total fees in Ocean
      const totalMarketFeeInOcean = await pool.marketFees(oceanIndex);

      // Creating the arguments for exitPool()
      const tokens = [erc20Token.address, oceanAddress];
      const exitKind = MP_FEE_WITHDRAWAL;
      const userData = ethers.utils.defaultAbiCoder.encode(
        ["uint256"],
        [exitKind]
      );
      const ExitPoolRequest = {
        assets: tokens,
        minAmountsOut: [0, 0],
        userData: userData,
        toInternalBalance: false,
      };

      // OCEAN balance in marketFeeCollector
      result = await oceanContract.balanceOf(marketFeeCollector.address);
      assert(result == 0);

      // Market fees collected in Ocean until now, since it's the first time is going to be zero
      assert((await pool.feesCollectedMarket(oceanIndex)) == 0);
      // We now EXIT the pool (any user can do it, as long as recipient is marketFeeCollector address)
      await vault
        .connect(user3)
        .exitPool(
          poolID,
          user3.address,
          marketFeeCollector.address,
          ExitPoolRequest
        );

      // we check all fees in Ocean for the market were collected
      assert(
        (
          await oceanContract.balanceOf(marketFeeCollector.address)
        ).toString() == totalMarketFeeInOcean.toString()
      );

      // Since we withdraw the market fee in Ocean, marketFees in Ocean and already collected fees are the same amount
      assert(
        (await pool.feesCollectedMarket(oceanIndex)).toString() ==
          (await pool.marketFees(oceanIndex)).toString()
      );
    });

    it("#6 - user4 performs 2 additional swaps from datatoken to ocean", async () => {
      // user3 sends some dt token to user4
      await erc20Token
        .connect(user3)
        .transfer(user4.address, web3.utils.toWei("1000"));
      // assert((await erc20Token.balanceOf(user4.address)).toString() >= ethers.utils.parseEther('100').toString())

      // user4 approves the vault to manage datatoken
      await erc20Token
        .connect(user4)
        .approve(vaultAddress, ethers.utils.parseEther("1000000000"));

      const swapStruct = {
        poolId: poolID,
        kind: 0,
        assetIn: erc20Token.address,
        assetOut: oceanAddress,
        amount: ethers.utils.parseEther("10"),
        userData: "0x",
      };
      const fundManagement = {
        sender: user4.address,
        fromInternalBalance: false,
        recipient: user4.address,
        toInternalBalance: false,
      };
      const limit = ethers.utils.parseEther("0.5");
      const deadline = Math.round(new Date().getTime() / 1000 + 600000); // 10 minutes

      result = await vault
        .connect(user4)
        .swap(swapStruct, fundManagement, limit, deadline);
      receipt = await result.wait();
      const events = receipt.events.filter((e) => e.event === "Swap");

      //console.log(events)

      const amountIn = events[0].args.amountIn;
      const amountOut = events[0].args.amountOut;
      console.log(ethers.utils.formatEther(amountOut));
      console.log((await erc20Token.balanceOf(user4.address)).toString());
      // assert((await erc20Token.balanceOf(user4.address)).toString() == amountOut.toString())
    });

    it("#7 - user2(could be any user as long as recipient is marketFeeCollector) triggers function to exit pools and collecting fees for marketPlace", async () => {
      // THIS POOL HAS OCEAN TOKEN SO OCEAN COMMUNITY WON'T GET ANY FEES
      // In this pool dt is index 0 and ocean is 1
      const dtIndex = 0;
      const oceanIndex = 1;

      assert((await pool.communityFees(dtIndex)) == 0);
      assert((await pool.communityFees(oceanIndex)) == 0);

      // First we check the total fees in DT
      const totalMarketFeeInDT = await pool.marketFees(dtIndex);

      // Creating the arguments for exitPool()
      const tokens = [erc20Token.address, oceanAddress];
      const exitKind = MP_FEE_WITHDRAWAL;
      const userData = ethers.utils.defaultAbiCoder.encode(
        ["uint256"],
        [exitKind]
      );
      const ExitPoolRequest = {
        assets: tokens,
        minAmountsOut: [0, 0],
        userData: userData,
        toInternalBalance: false,
      };

      // DT balance in marketFeeCollector
      result = await erc20Token.balanceOf(marketFeeCollector.address);
      assert(result == 0);

      // Market fees collected in DT until now, since it's the first time is going to be zero
      assert((await pool.feesCollectedMarket(dtIndex)) == 0);
      // We now EXIT the pool (any user can do it, as long as recipient is marketFeeCollector address)
      await vault
        .connect(user2)
        .exitPool(
          poolID,
          user2.address,
          marketFeeCollector.address,
          ExitPoolRequest
        );

      // we check all fees in DT for the market were collected
      assert(
        (await erc20Token.balanceOf(marketFeeCollector.address)).toString() ==
          totalMarketFeeInDT.toString()
      );

      // Since we withdraw the market fee in Ocean, marketFees in Ocean and already collected fees are the same amount
      assert(
        (await pool.feesCollectedMarket(dtIndex)).toString() ==
          (await pool.marketFees(dtIndex)).toString()
      );
    });

    it("#8 - user4 performs 2 additional swaps from datatoken to ocean and viceversa", async () => {
      // WE don't need to approve because it has been already done before.

      // Building the arguments for swap
      const swapStructDTOcean = {
        poolId: poolID,
        kind: 0,
        assetIn: erc20Token.address,
        assetOut: oceanAddress,
        amount: ethers.utils.parseEther("10"),
        userData: "0x",
      };
      const swapStructOceanDT = {
        poolId: poolID,
        kind: 0,
        assetIn: oceanAddress,
        assetOut: erc20Token.address,
        amount: ethers.utils.parseEther("10"),
        userData: "0x",
      };
      const fundManagement = {
        sender: user4.address,
        fromInternalBalance: false,
        recipient: user4.address,
        toInternalBalance: false,
      };
      const limit = ethers.utils.parseEther("0.5");
      const deadline = Math.round(new Date().getTime() / 1000 + 600000); // 10 minutes

      await vault
        .connect(user4)
        .swap(swapStructDTOcean, fundManagement, limit, deadline);
      await vault
        .connect(user4)
        .swap(swapStructOceanDT, fundManagement, limit, deadline);
    });

    it("#9 - user2(could be any user as long as recipient is marketFeeCollector) triggers exitPool() and collects fees for marketPlace (Ocean and DT)", async () => {
      // In this pool dt is index 0 and ocean is 1
      const dtIndex = 0;
      const oceanIndex = 1;
      // THIS POOL HAS OCEAN TOKEN SO OCEAN COMMUNITY WON'T GET ANY FEES (checked again just for consistency but we already knew that)
      assert((await pool.communityFees(dtIndex)) == 0);
      assert((await pool.communityFees(oceanIndex)) == 0);

      // First we check the total fees in DT
      const totalMarketFeeInDT = await pool.marketFees(dtIndex);
      const totalMarketFeeInOcean = await pool.marketFees(oceanIndex);
      const alreadyCollectedInDT = await pool.feesCollectedMarket(dtIndex);
      const alreadyCollectedInOcean = await pool.feesCollectedMarket(
        oceanIndex
      );
      // Creating the arguments for exitPool()
      const tokens = [erc20Token.address, oceanAddress];
      const exitKind = MP_FEE_WITHDRAWAL;
      const userData = ethers.utils.defaultAbiCoder.encode(
        ["uint256"],
        [exitKind]
      );
      const ExitPoolRequest = {
        assets: tokens,
        minAmountsOut: [0, 0],
        userData: userData,
        toInternalBalance: false,
      };

      // DT balance in the newMarketFeeCollector is ZERO
      assert((await erc20Token.balanceOf(newMarketFeeCollector.address)) == 0);
      // OCEAN balance in newMarketFeeCollector is ZERO

      // In order to easier calculate the fees, we set a newMarketFeeCollector which has both Ocean and DT balances as ZERO
      // user3 is pool owner
      await pool
        .connect(user3)
        .updateMarketCollector(newMarketFeeCollector.address);

      // if we now attemp to call with the older marketFeeCollector it reverts
      await expectRevert(
        vault.connect(user2).exitPool(
          poolID,
          user2.address,
          marketFeeCollector.address, // old address
          ExitPoolRequest
        ),
        "NOT MP RECIPIENT"
      );
      // We now EXIT the pool (any user can do it, as long as recipient is marketFeeCollector address)
      await vault
        .connect(user2)
        .exitPool(
          poolID,
          user2.address,
          newMarketFeeCollector.address,
          ExitPoolRequest
        );

      // we check all fees in DT for the market were collected
      assert(
        (
          await erc20Token.balanceOf(newMarketFeeCollector.address)
        ).toString() == (totalMarketFeeInDT - alreadyCollectedInDT).toString()
      );
      // we check all fees in OCEAN for the market were collected
      assert(
        (
          await oceanContract.balanceOf(newMarketFeeCollector.address)
        ).toString() ==
          (totalMarketFeeInOcean - alreadyCollectedInOcean).toString()
      );

      // Since we withdraw and no additional swap have been performed,
      // the market fees (in DT and Ocean), and market fees already collected (in Ocean and DT) are the same amount
      assert(
        (await pool.feesCollectedMarket(dtIndex)).toString() ==
          (await pool.marketFees(dtIndex)).toString()
      );
      assert(
        (await pool.feesCollectedMarket(oceanIndex)).toString() ==
          (await pool.marketFees(oceanIndex)).toString()
      );
    });
  });
  describe("POOL #2: 2 Token pool without OCEAN token and market Fee at 0.2%, Exact AmountIn and AmountOut test", async () => {
    it("#1 - user3 succeed to deploy a new 2 token Pool WITH OceanToken from our Custom Factory on Balancer V2", async () => {
      const tokens = [daiAddress, erc20Token.address];
      const weights = [
        ethers.utils.parseEther("0.5"),
        ethers.utils.parseEther("0.5"),
      ];

      const NAME = "Two-token Pool NO Ocean";
      const SYMBOL = "DAI-DT-50-50";
      const swapFeePercentage = 3e15; // 0.3%
      const marketFee = 2e15;
      const swapFeeOcean = 1e15;

      // DEPLOY A BALANCER POOL THROUGH THE ROUTER, FROM OCEAN CUSTOM FACTORY
      receipt = await (
        await router
          .connect(user3)
          .deployPool(
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
      assert(events[0].args.isOcean == false);

      pool = await ethers.getContractAt("WeightedPool", poolAddress);
      poolID = await pool.getPoolId();

      // WE CHECK THAT swapFeeOcean is 1e15 (set automatically)
      assert((await pool.swapFeeOcean()) == swapFeeOcean);
      // CHECK THAT swapFeeMarket is correct (arbitrary value)
      assert((await pool.swapFeeMarket()) == marketFee);
      // WE CHECK IF THE POOL HAS BEEN REGISTERED INTO BALANCER VAULT
      result = await vault.getPool(poolID);
      assert(result[0] == poolAddress);
    });

    it("#2 - user3 add initial liquidity to the pool he just created", async () => {
      const tokens = [daiAddress, erc20Token.address];
      // 1 DT = 10 DAI
      const initialBalances = [
        ethers.utils.parseEther("1000"),
        ethers.utils.parseEther("100"),
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
      await daiContract
        .connect(user3)
        .approve(vaultAddress, ethers.utils.parseEther("1000000000"));

      await erc20Token
        .connect(user3)
        .approve(vaultAddress, ethers.utils.parseEther("1000000000"));

      // JOIN POOL (ADD LIQUIDITY)
      const tx = await vault
        .connect(user3)
        .joinPool(poolID, user3.address, user3.address, joinPoolRequest);

      receipt = await tx.wait();

      // WE CHECK IF THE POOL HAS BEEN REGISTERED INTO BALANCER VAULT
      result = await vault.getPool(poolID);
      assert(result[0] == poolAddress);
    });

    it("#3 - user5 performs a swap from dai to datatoken", async () => {
      // user3 sends some dai token to user5

      await daiContract
        .connect(user3)
        .transfer(user5.address, ethers.utils.parseEther("100"));

      assert(
        (await daiContract.balanceOf(user5.address)).toString() ==
          ethers.utils.parseEther("100").toString()
      );

      // user4 approves the vault to manage dai tokens
      await daiContract
        .connect(user5)
        .approve(vaultAddress, ethers.utils.parseEther("1000000000"));

      const swapStruct = {
        poolId: poolID,
        kind: 0,
        assetIn: daiAddress,
        assetOut: erc20Token.address,
        amount: ethers.utils.parseEther("10"),
        userData: "0x",
      };
      const fundManagement = {
        sender: user5.address,
        fromInternalBalance: false,
        recipient: user5.address,
        toInternalBalance: false,
      };
      const limit = ethers.utils.parseEther("0.5");
      const deadline = Math.round(new Date().getTime() / 1000 + 600000); // 10 minutes

      result = await vault
        .connect(user5)
        .swap(swapStruct, fundManagement, limit, deadline);
      receipt = await result.wait();
      const events = receipt.events.filter((e) => e.event === "Swap");

      //console.log(events)

      const amountIn = events[0].args.amountIn;
      const amountOut = events[0].args.amountOut;
      console.log(ethers.utils.formatEther(amountOut));
      console.log((await erc20Token.balanceOf(user5.address)).toString());
      // assert((await erc20Token.balanceOf(user4.address)).toString() == amountOut.toString())
    });

    it("#4 - user5 performs a second swap from dai to datatoken", async () => {
      const swapStruct = {
        poolId: poolID,
        kind: 0,
        assetIn: daiAddress,
        assetOut: erc20Token.address,
        amount: ethers.utils.parseEther("10"),
        userData: "0x",
      };
      const fundManagement = {
        sender: user5.address,
        fromInternalBalance: false,
        recipient: user5.address,
        toInternalBalance: false,
      };
      const limit = ethers.utils.parseEther("0.5");
      const deadline = Math.round(new Date().getTime() / 1000 + 3600000);

      result = await vault
        .connect(user5)
        .swap(swapStruct, fundManagement, limit, deadline);
      receipt = await result.wait();
      const events = receipt.events.filter((e) => e.event === "Swap");

      // console.log(events)

      const amountIn = events[0].args.amountIn;
      const amountOut = events[0].args.amountOut;
      console.log(ethers.utils.formatEther(amountOut));
      console.log((await erc20Token.balanceOf(user5.address)).toString());
    });

    it("#5 - user3 triggers function to exit pools and collecting fees for marketPlace and Ocean", async () => {
      // In this pool dt is index 1 and dai is 0
      const dtIndex = 1;
      const daiIndex = 0;

      assert((await pool.communityFees(dtIndex)) == 0);
      // fees in DAI have been collected so balance cannot be ZERO
      assert((await pool.communityFees(daiIndex)) != 0);

      // AT this point we only have fees in DAI because we only used DAI as TokenIn
      assert((await pool.marketFees(daiIndex)) != 0);
      assert((await pool.marketFees(dtIndex)) == 0);
      // current design as marketFeeCollector as address(0). it has to be updated
      await pool
        .connect(user3)
        .updateMarketCollector(pool2MarketFeeCollector.address);
      assert(
        (await pool.marketFeeCollector()) == pool2MarketFeeCollector.address
      );

      // First we check the total fees in DAI both for market and ocean
      const totalMarketFeeInDAI = await pool.marketFees(daiIndex);
      const totalOceanFeeInDAI = await pool.communityFees(daiIndex);

      // Creating the arguments for exitPool()
      const tokens = [daiAddress, erc20Token.address];
      const exitKindMarket = MP_FEE_WITHDRAWAL;
      const exitKindOcean = OPF_FEE_WITHDRAWAL;
      const userData = ethers.utils.defaultAbiCoder.encode(
        ["uint256"],
        [exitKindMarket]
      );
      const userDataOcean = ethers.utils.defaultAbiCoder.encode(
        ["uint256"],
        [exitKindOcean]
      );
      const ExitPoolRequestMarket = {
        assets: tokens,
        minAmountsOut: [0, 0],
        userData: userData,
        toInternalBalance: false,
      };

      const ExitPoolRequestOcean = {
        assets: tokens,
        minAmountsOut: [0, 0],
        userData: userDataOcean,
        toInternalBalance: false,
      };

      // DAI balance in marketFeeCollector
      result = await daiContract.balanceOf(pool2MarketFeeCollector.address);
      assert(result == 0);

      result = await daiContract.balanceOf(communityFeeCollector);
      assert(result == 0);
      // Market fees collected in DAI until now, since it's the first time is going to be zero
      assert((await pool.feesCollectedMarket(daiIndex)) == 0);
      assert((await pool.feesCollectedOPF(daiIndex)) == 0);
      // We now EXIT the pool (any user can do it, as long as recipient is marketFeeCollector address or oceanCommunity fee respectively)
      await vault
        .connect(user3)
        .exitPool(
          poolID,
          user3.address,
          pool2MarketFeeCollector.address,
          ExitPoolRequestMarket
        );

      await vault
        .connect(user3)
        .exitPool(
          poolID,
          user3.address,
          communityFeeCollector,
          ExitPoolRequestOcean
        );

      // we check all fees in DAI for the market were collected

      assert(
        (
          await daiContract.balanceOf(pool2MarketFeeCollector.address)
        ).toString() == totalMarketFeeInDAI.toString()
      );

      // we now check all fees in DAI for Ocean Community were collected
      assert(
        (await daiContract.balanceOf(communityFeeCollector)).toString() ==
          totalOceanFeeInDAI.toString()
      );

      // Since we withdraw the market fee in DAI, marketFees in DAI and already collected fees are the same amount
      assert(
        (await pool.feesCollectedMarket(daiIndex)).toString() ==
          (await pool.marketFees(daiIndex)).toString()
      );
      // Same logic for Ocean fee in DAI
      assert(
        (await pool.feesCollectedOPF(daiIndex)).toString() ==
          (await pool.communityFees(daiIndex)).toString()
      );
    });

    it("#6 - user5 now performs a swap from DAI to DT with fixed amount OUT", async () => {
      const swapStruct = {
        poolId: poolID,
        kind: 1, // fixed amount out
        assetIn: daiAddress,
        assetOut: erc20Token.address,
        amount: ethers.utils.parseEther("5"),
        userData: "0x",
      };
      const fundManagement = {
        sender: user5.address,
        fromInternalBalance: false,
        recipient: user5.address,
        toInternalBalance: false,
      };
      const limit = ethers.utils.parseEther("60");
      const deadline = Math.round(new Date().getTime() / 1000 + 3600000);

      const dtBalanceBeforeSwap = await erc20Token.balanceOf(user5.address);

      result = await vault
        .connect(user5)
        .swap(swapStruct, fundManagement, limit, deadline);
      receipt = await result.wait();
      const events = receipt.events.filter((e) => e.event === "Swap");

      // console.log(events)

      const amountIn = events[0].args.amountIn;
      const amountOut = events[0].args.amountOut;
      console.log(ethers.utils.formatEther(amountOut));
      console.log(dtBalanceBeforeSwap.toString(), "before swap");
      console.log(
        (await erc20Token.balanceOf(user5.address)).toString(),
        "after swap"
      );
    });

    it("#7 - user5 now performs a swap from DT to DAI with fixed amount OUT", async () => {
      // user5 approves the vault to manage DT tokens
      await erc20Token
        .connect(user5)
        .approve(vaultAddress, ethers.utils.parseEther("1000000000"));

      const swapStruct = {
        poolId: poolID,
        kind: 1, // fixed amount out
        assetIn: erc20Token.address,
        assetOut: daiAddress,
        amount: ethers.utils.parseEther("30"),
        userData: "0x",
      };
      const fundManagement = {
        sender: user5.address,
        fromInternalBalance: false,
        recipient: user5.address,
        toInternalBalance: false,
      };
      const limit = ethers.utils.parseEther("60");
      const deadline = Math.round(new Date().getTime() / 1000 + 3600000);

      const dtBalanceBeforeSwap = await daiContract.balanceOf(user5.address);

      result = await vault
        .connect(user5)
        .swap(swapStruct, fundManagement, limit, deadline);
      receipt = await result.wait();
      const events = receipt.events.filter((e) => e.event === "Swap");

      // console.log(events)

      const amountIn = events[0].args.amountIn;
      const amountOut = events[0].args.amountOut;
      console.log(ethers.utils.formatEther(amountOut));
      console.log(dtBalanceBeforeSwap.toString(), "before swap");
      console.log(
        (await daiContract.balanceOf(user5.address)).toString(),
        "after swap"
      );
      assert(
        dtBalanceBeforeSwap
          .add(amountOut)
          .eq(await daiContract.balanceOf(user5.address)) == true
      );
    });

    it("#8 - user3 triggers function to exit pools and collecting fees for marketPlace and Ocean in BOTH DAI and DT", async () => {
      // In this pool dt is index 1 and dai is 0
      const dtIndex = 1;
      const daiIndex = 0;

      // confirm marketFeeCollector
      assert(
        (await pool.marketFeeCollector()) == pool2MarketFeeCollector.address
      );

      // First we check the total fees in DAI and DT both for market and ocean, calculating how much we should receive for each of those
      const totalMarketFeeInDAI = await pool.marketFees(daiIndex);
      const totalOceanFeeInDAI = await pool.communityFees(daiIndex);
      const totalMarketFeeInDT = await pool.marketFees(dtIndex);
      const totalOceanFeeInDT = await pool.communityFees(dtIndex);
      const alreadyCollectedMFInDT = await pool.feesCollectedMarket(dtIndex);
      const alreadyCollectedMFinDAI = await pool.feesCollectedMarket(daiIndex);
      const alreadyCollectedOPFInDT = await pool.feesCollectedOPF(dtIndex);
      const alreadyCollectedOPFinDAI = await pool.feesCollectedOPF(daiIndex);

      const feeToCollectMFinDT = totalMarketFeeInDT.sub(alreadyCollectedMFInDT);
      const feeToCollectMFinDAI = totalMarketFeeInDAI.sub(
        alreadyCollectedMFinDAI
      );
      const feeToCollectOPFinDT = totalOceanFeeInDT.sub(
        alreadyCollectedOPFInDT
      );
      const feeToCollectOPFinDAI = totalOceanFeeInDAI.sub(
        alreadyCollectedOPFinDAI
      );
      // Creating the arguments for exitPool()
      const tokens = [daiAddress, erc20Token.address];
      const exitKindMarket = MP_FEE_WITHDRAWAL;
      const exitKindOcean = OPF_FEE_WITHDRAWAL;
      const userData = ethers.utils.defaultAbiCoder.encode(
        ["uint256"],
        [exitKindMarket]
      );
      const userDataOcean = ethers.utils.defaultAbiCoder.encode(
        ["uint256"],
        [exitKindOcean]
      );
      const ExitPoolRequestMarket = {
        assets: tokens,
        minAmountsOut: [0, 0],
        userData: userData,
        toInternalBalance: false,
      };

      const ExitPoolRequestOcean = {
        assets: tokens,
        minAmountsOut: [0, 0],
        userData: userDataOcean,
        toInternalBalance: false,
      };

      // DAI balance in marketFeeCollector
      const initDAIBalanceInMarketCollector = await daiContract.balanceOf(
        pool2MarketFeeCollector.address
      );
      const initDAIBalanceInOceanCollector = await daiContract.balanceOf(
        communityFeeCollector
      );
      const initDTBalanceInMarketCollector = await erc20Token.balanceOf(
        pool2MarketFeeCollector.address
      );
      const initDTBalanceInOceanCollector = await erc20Token.balanceOf(
        communityFeeCollector
      );
      // we haven't collected any DT yet so balance is ZERO both for OPF and MFC
      assert(initDTBalanceInMarketCollector == 0);
      assert(initDTBalanceInOceanCollector == 0);

      // We now EXIT the pool (any user can do it, as long as recipient is marketFeeCollector address or oceanCommunity fee respectively)
      await vault
        .connect(user3)
        .exitPool(
          poolID,
          user3.address,
          pool2MarketFeeCollector.address,
          ExitPoolRequestMarket
        );

      await vault
        .connect(user3)
        .exitPool(
          poolID,
          user3.address,
          communityFeeCollector,
          ExitPoolRequestOcean
        );
     
      // we now check all fees in DAI and DT for Marketplace and Ocean Community were collected

      // DAI fees for MFC
      assert(
        (await daiContract.balanceOf(pool2MarketFeeCollector.address))
          .sub(initDAIBalanceInMarketCollector)
          .eq(feeToCollectMFinDAI) == true
      );

      // DT fees for MFC
      assert(
        (await erc20Token.balanceOf(pool2MarketFeeCollector.address))
          .sub(initDTBalanceInMarketCollector) // this is ZERO (added to display math mechanism)
          .eq(feeToCollectMFinDT) == true
      );

       // DAI fees for OPF
       assert(
        (await daiContract.balanceOf(communityFeeCollector))
          .sub(initDAIBalanceInOceanCollector)
          .eq(feeToCollectOPFinDAI) == true
      );
     
       // DT fees for MFC
       assert(
        (await erc20Token.balanceOf(communityFeeCollector))
          .sub(initDTBalanceInOceanCollector) // this is ZERO (added to display math mechanism)
          .eq(feeToCollectOPFinDT) == true
      );

      // Since we withdraw the market fee in DAI, and no other swaps where performed marketFees in DAI and already collected fees are the same amount
      assert(
        (await pool.feesCollectedMarket(daiIndex)).eq(await pool.marketFees(daiIndex)) == true
      );
      // Same logic for Ocean fee in DAI
      assert(
        (await pool.feesCollectedOPF(daiIndex)).eq(await pool.communityFees(daiIndex)) == true
      );
      
       // Since we withdraw the market fee in DT, and no other swaps where performed marketFees in DT and already collected fees are the same amount
       assert(
        (await pool.feesCollectedMarket(dtIndex)).eq(await pool.marketFees(dtIndex)) == true
      );
      // Same logic for Ocean fee in DT
      assert(
        (await pool.feesCollectedOPF(dtIndex)).eq(await pool.communityFees(dtIndex)) == true
      );


    });
  });
});
