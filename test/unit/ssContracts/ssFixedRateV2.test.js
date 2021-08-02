/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const ethers = hre.ethers;

describe("ssFixedRateV2", () => {
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
    poolAddress,
    ssFixedRateV2,
    dtIndex = null,
    oceanIndex = null,
    daiIndex = null;

  const oceanAddress = "0x967da4048cd07ab37855c090aaf366e4ce1b9f48";
  const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
  const balAddress = "0xba100000625a3754423978a60c9317c58a424e3D";
  const vaultAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  const OPF_FEE_WITHDRAWAL = 3; // corresponding enum index for ocean community exitKind
  const MP_FEE_WITHDRAWAL = 4; // corresponding enum index for market fee exitKind

  before("initial setup", async () => {
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");
    const ERC20Factory = await ethers.getContractFactory("ERC20Factory");

    const Metadata = await ethers.getContractFactory("Metadata");
    const Router = await ethers.getContractFactory("OceanPoolFactoryRouter");
    const SSFixedRateV2 = await ethers.getContractFactory("ssFixedRateV2");

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

    // DEPLOY ssFixedRateV2 contract
    ssFixedRateV2 = await SSFixedRateV2.deploy()
    // DEPLOY ROUTER, SETTING OWNER
    router = await Router.deploy(owner.address, oceanAddress, vaultAddress,ssFixedRateV2.address);

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

    // SETUP ERC20 Factory with template
    templateERC20 = await ERC20Template.deploy();
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );

    metadata = await Metadata.deploy(factoryERC20.address);

    // SETUP ERC721 Factory with template
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      communityFeeCollector,
      factoryERC20.address,
      metadata.address
    );

    // SET REQUIRED ADDRESS
    await factoryERC20.setERC721Factory(factoryERC721.address);

    // Owner deploys a new ERC721 Contract
    const tx = await factoryERC721.deployERC721Contract(
      "NFT",
      "NFTSYMBOL",
      data,
      flags,
      1
    );
    const txReceipt = await tx.wait();

    tokenAddress = txReceipt.events[4].args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);

    assert((await tokenERC721.balanceOf(owner.address)) == 1);

    // owner adds user2 as manager, which then adds user3 as store updater, metadata updater and erc20 deployer
    await tokenERC721.addManager(user2.address);
    await tokenERC721.connect(user2).addTo725StoreList(user3.address);
    await tokenERC721.connect(user2).addToCreateERC20List(user3.address);
    await tokenERC721.connect(user2).addToMetadataList(user3.address);


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

  describe("POOL #1: 2 Token pool with OCEAN token and market Fee at 0.1%", async () => {
    it("#1 - user3 succeed to deploy a new 2 token Pool WITH OceanToken from our Custom Factory on Balancer V2", async () => {
      const tokens = [erc20Token.address, oceanAddress];
      // tokens must be sorted from smaller to bigger
      let tokensSorted = tokens.sort((a, b) => a - b);

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
            erc20Token.address,
            NAME,
            SYMBOL,
            tokensSorted,
            weights,
            swapFeePercentage,
            marketFee,
            ssFixedRateV2.address
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
      const tokens = (await vault.getPoolTokens(poolID)).tokens;

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
    it("#3 - user3 add initial liquidity using only Ocean token and calling the staking bot", async () => {
      // we mint some dummy DT token for the bot
      await erc20Token
      .connect(user3)
      .mint(ssFixedRateV2.address, web3.utils.toWei("10000"));

    assert(
      (await erc20Token.balanceOf(ssFixedRateV2.address)) == web3.utils.toWei("10000")
    );

     
      const tokens = (await vault.getPoolTokens(poolID)).tokens;
      let tokenIndex;
      if (tokens[0].toString() == oceanAddress.toString()){
        tokenIndex = 0;
      } else {
        tokenIndex = 1
      }
      // console.log(tokens)
      // console.log(tokenIndex)
      // console.log(tokens[0])
      // console.log(oceanAddress)
      let maxBalancesIn
      if(tokenIndex == 1) {

        maxBalancesIn = [
        0,
        ethers.utils.parseEther("1000"),
      ] 
      } else {
        maxBalancesIn = [
          ethers.utils.parseEther("1000"),
          0
        ]
      };
      const JOIN_KIND_INIT = 3;
      const btpOut =  ethers.utils.parseEther("0.0001")
      // Construct magic userData
      const userData = ethers.utils.defaultAbiCoder.encode(
        ["uint256", "uint256", "uint256"],
        [JOIN_KIND_INIT, btpOut, tokenIndex]
      );
      const joinPoolRequest = {
        assets: tokens,
        maxAmountsIn: maxBalancesIn,
        userData: userData,
        fromInternalBalance: false,
      };

    
      // JOIN POOL (ADD LIQUIDITY)
      const tx = await vault
        .connect(user3)
        .joinPool(poolID, user3.address, user3.address, joinPoolRequest);

      receipt = await tx.wait();
      console.log(receipt)
      // WE CHECK IF THE POOL HAS BEEN REGISTERED INTO BALANCER VAULT
      result = await vault.getPool(poolID);
      assert(result[0] == poolAddress);
    });
  });
});
