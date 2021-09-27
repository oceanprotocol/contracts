/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect, should, be } = require("chai");
const {
  expectRevert,
  expectEvent,
  time,
} = require("@openzeppelin/test-helpers");

const BN = require("bn.js");

const { impersonate } = require("../helpers/impersonate");
const constants = require("../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const ether = require("@openzeppelin/test-helpers/src/ether");
const ethers = hre.ethers;

describe("Vesting flow", () => {
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
    ssFixedRate,
    router,
    poolTemplate,
    bPoolAddress,
    bPool,
    signer,
    vestingAmount = web3.utils.toWei('10000'),
    vestedBlocks,
    dtIndex = null,
    oceanIndex = null,
    daiIndex = null;

  const oceanAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
  const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
  const balAddress = "0xba100000625a3754423978a60c9317c58a424e3D";
  const vaultAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  const OPF_FEE_WITHDRAWAL = 3; // corresponding enum index for ocean community exitKind
  const MP_FEE_WITHDRAWAL = 4; // corresponding enum index for market fee exitKind
  const provider = new ethers.providers.JsonRpcProvider();

  before("init contracts for each test", async () => {
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");

    const Metadata = await ethers.getContractFactory("Metadata");
    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("ssFixedRate");
    const BPool = await ethers.getContractFactory("BPool");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
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
      pool2MarketFeeCollector,
      opfCollector,
    ] = await ethers.getSigners();

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

    await oceanContract
      .connect(signer)
      .transfer(user4.address, ethers.utils.parseEther("10000"));

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

    data = web3.utils.asciiToHex("SomeData");
    flags = web3.utils.asciiToHex(constants.blob[0]);

    // DEPLOY ROUTER, SETTING OWNER

    poolTemplate = await BPool.deploy();

   

    router = await Router.deploy(
      owner.address,
      oceanAddress,
      poolTemplate.address, 
      opfCollector.address,
      []
    );

    ssFixedRate = await SSContract.deploy(router.address);

    fixedRateExchange = await FixedRateExchange.deploy(
      router.address,
      opfCollector.address
    );

    templateERC20 = await ERC20Template.deploy();

    metadata = await Metadata.deploy();

    // SETUP ERC721 Factory with template
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      templateERC20.address,
      opfCollector.address,
      router.address,
      metadata.address
    );

    // SET REQUIRED ADDRESS

    await metadata.addTokenFactory(factoryERC721.address);

    await router.addFactory(factoryERC721.address);

    await router.addFixedRateContract(fixedRateExchange.address);
    
    await router.addSSContract(ssFixedRate.address)
  });

  it("#1 - owner deploys a new ERC721 Contract", async () => {
    // by default connect() in ethers goes with the first address (owner in this case)
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
  });

  it("#2 - owner adds user2 as manager, which then adds user3 as store updater, metadata updater and erc20 deployer", async () => {
    await tokenERC721.addManager(user2.address);
    await tokenERC721.connect(user2).addTo725StoreList(user3.address);
    await tokenERC721.connect(user2).addToCreateERC20List(user3.address);
    await tokenERC721.connect(user2).addToMetadataList(user3.address);

    assert((await tokenERC721.getPermissions(user3.address)).store == true);
    assert(
      (await tokenERC721.getPermissions(user3.address)).deployERC20 == true
    );
    assert(
      (await tokenERC721.getPermissions(user3.address)).updateMetadata == true
    );
  });

  it("#3 - user3 deploys a new erc20DT, assigning himself as minter", async () => {
    const trxERC20 = await tokenERC721.connect(user3).createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("100000"),
      1,
      user3.address, // minter
      user6.address // feeManager
    );
    const trxReceiptERC20 = await trxERC20.wait();
    erc20Address = trxReceiptERC20.events[3].args.erc20Address;

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
    assert((await erc20Token.permissions(user3.address)).minter == true);
  });

  const swapFee = 1e15;
  const swapOceanFee = 1e15;
  const swapMarketFee = 1e15;

  it("#4 - user3 calls deployPool(), we then check ocean and market fee", async () => {
    // user3 hasn't minted any token so he can call deployPool()

    const ssDTBalance = await erc20Token.balanceOf(ssFixedRate.address);

    const initialOceanLiquidity = web3.utils.toWei("2000");
    const initialDTLiquidity = initialOceanLiquidity;
    // approve exact amount
    await oceanContract
      .connect(user3)
      .approve(router.address, web3.utils.toWei("2000"));

    // we deploy a new pool with burnInEndBlock as 0
    receipt = await (
      await erc20Token.connect(user3).deployPool(
        ssFixedRate.address,
        oceanAddress,
        [
          web3.utils.toWei("1"), // rate
          18, // basetokenDecimals
          web3.utils.toWei('10000'),
          2500000, // vested blocks
          initialOceanLiquidity, // baseToken initial pool liquidity
        ],
        user3.address,
        [
          swapFee, //
          swapMarketFee,
        ],
        marketFeeCollector.address,
        user3.address // publisherAddress (get vested amount)
      )
    ).wait();

    const PoolEvent = receipt.events.filter((e) => e.event === "NewPool");

    assert(PoolEvent[0].args.ssContract == ssFixedRate.address);

    bPoolAddress = PoolEvent[0].args.poolAddress;

    bPool = await ethers.getContractAt("BPool", bPoolAddress);

    assert((await bPool.isFinalized()) == true);

    expect(await erc20Token.balanceOf(ssFixedRate.address)).to.equal(
      web3.utils.toWei("98000")
    );

    expect(await bPool.getOPFFee()).to.equal(0);
    expect(await bPool._swapMarketFee()).to.equal(swapMarketFee);

    expect(await bPool.communityFees(oceanAddress)).to.equal(0);
    expect(await bPool.communityFees(erc20Token.address)).to.equal(0);
    expect(await bPool.marketFees(oceanAddress)).to.equal(0);
    expect(await bPool.marketFees(erc20Token.address)).to.equal(0);
  });

  it("#5 - user3 fails to mints new erc20 tokens even if it's minter", async () => {
    assert((await erc20Token.permissions(user3.address)).minter == true);

    await expectRevert(
      erc20Token.connect(user3).mint(user3.address, web3.utils.toWei("10000")),
      "DataTokenTemplate: cap exceeded"
    );

    assert((await erc20Token.balanceOf(user3.address)) == 0);
  });

  it("#6 - we check vesting amount is correct", async () => {
    expect(await ssFixedRate.getvestingAmount(erc20Token.address)).to.equal(
      vestingAmount
    );

    // //console.log((await ssFixedRate.getvestingAmountSoFar(erc20Token.address)).toString())
    // console.log((await time.latestBlock()).toString());
    // await time.advanceBlockTo(12552485 + 3 * vestedBlocks);
    // console.log((await time.latestBlock()).toString());
  });

  xit("#7 - we check vesting amount is correct", async () => {
    const pubDTbalBEFORE = await erc20Token.balanceOf(tokenERC721.address);
    expect(await ssFixedRate.getvestingAmount(erc20Token.address)).to.equal(
      vestingAmount
    );
    console.log(pubDTbalBEFORE.toString());

    //console.log((await ssFixedRate.getvestingAmountSoFar(erc20Token.address)).toString())
    console.log((await time.latestBlock()).toString());

    console.log((await time.latestBlock()).toString());
    //await ssFixedRate.getVesting(erc20Token.address)

    // to many blocks to advance, previous commit shows it works (500 blocks vesting) 
    // TODO: add test for intermediate steps (50%, etc)
    for (let i = 0; i < 2500000; i++) {
      // each one advance a block
      await signer.sendTransaction({
        to: user4.address,
        value: ethers.utils.parseEther("0.0"),
      });
    }
    await ssFixedRate.getVesting(erc20Token.address);
    const pubDTbalAFTER = await erc20Token.balanceOf(tokenERC721.address);
    console.log(ethers.utils.formatEther(pubDTbalAFTER));
  });
});
