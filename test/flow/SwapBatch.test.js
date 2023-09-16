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
const { getEventFromTx } = require("../helpers/utils");
const { impersonate } = require("../helpers/impersonate");
const constants = require("../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const {
  ZERO_ADDRESS,
  MAX_INT256,
  MAX_UINT256,
} = require("@openzeppelin/test-helpers/src/constants");
const ether = require("@openzeppelin/test-helpers/src/ether");
const { zeroAddress } = require("ethereumjs-util");
const ethers = hre.ethers;

describe("Batch Swap", () => {
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
    erc20Token3,
    erc20Token4,
    erc20Token5,
    oceanContract,
    daiContract,
    usdcContract,
    sideStaking,
    router,
    poolTemplate,
    bPoolAddress,
    bPool,
    bPool2,
    bPool3,
    signer,
    opcCollector,
    SwapFeesEvent,
    fixedRateExchange,
    baseTokenDecimals,
    exchangeIdFPE,
    exchangeIdDispenser,
    vestingAmount = web3.utils.toWei("10000"),
    SwapEvent;
  (dtIndex = null),
    (oceanIndex = null),
    (daiIndex = null),
    (cap = web3.utils.toWei("100000"));

  const oceanAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
  const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
  const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";

  const provider = new ethers.providers.JsonRpcProvider();

  before("init contracts for each test", async () => {
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");

    const Router = await ethers.getContractFactory("FactoryRouter");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );
    const Dispenser = await ethers.getContractFactory("Dispenser");
    const OceanContract = await ethers.getContractFactory("MockOcean");
    const DaiContract = await ethers.getContractFactory("MockERC20");
    const UsdcContract = await ethers.getContractFactory("MockERC20Decimals");

    //console.log(await provider.getBlockNumber());

    [
      owner, // nft owner, 721 deployer
      reciever,
      user2, // 721Contract manager
      user3, // pool creator and liquidity provider
      user4,
      user5,
      user6,
      marketFeeCollector,
      opcCollector,
    ] = await ethers.getSigners();

    oceanContract = await OceanContract.connect(owner).deploy(owner.address)
    daiContract = await DaiContract.connect(owner).deploy(owner.address, 'DAI', "DAI")
    usdcContract = await UsdcContract.connect(owner).deploy('USDC', "USDC",6)
    await oceanContract
      .connect(owner)
      .transfer(user3.address, ethers.utils.parseEther("10000"));
    await oceanContract
      .connect(owner)
      .transfer(user4.address, ethers.utils.parseEther("20000"));
    await daiContract
      .connect(owner)
      .transfer(user3.address, ethers.utils.parseEther("10000"));
    await daiContract
      .connect(owner)
      .transfer(user4.address, ethers.utils.parseEther("10000"));
    const amount = 1e11; // 100000 
    await usdcContract.connect(owner).transfer(user3.address, amount);
    await usdcContract.connect(owner).transfer(user4.address, amount);
    data = web3.utils.asciiToHex("SomeData");
    flags = web3.utils.asciiToHex(constants.blob[0]);

    // DEPLOY ROUTER, SETTING OWNER

    
    router = await Router.deploy(
      owner.address,
      oceanContract.address,
      '0x000000000000000000000000000000000000dead',
      opcCollector.address,
      []
    );


    dispenser = await Dispenser.deploy(router.address);

    fixedRateExchange = await FixedRateExchange.deploy(
      router.address
    );

    templateERC20 = await ERC20Template.deploy();

    // SETUP ERC721 Factory with template
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      templateERC20.address,
      router.address
    );

    // SET REQUIRED ADDRESS

    await router.addFactory(factoryERC721.address);

    await router.addFixedRateContract(fixedRateExchange.address);

    await router.addDispenserContract(dispenser.address);

  });

  it("#1 - owner deploys a new ERC721 Contract", async () => {
    // by default connect() in ethers goes with the first address (owner in this case)
    const tx = await factoryERC721.deployERC721Contract(
      "NFT",
      "NFTSYMBOL",
      1,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/",
      true,
      owner.address
    );
    const txReceipt = await tx.wait();
    const event = getEventFromTx(txReceipt, "NFTCreated");
    assert(event, "Cannot find NFTCreated event");
    tokenAddress = event.args[0];

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

  describe("#4 - Exchange with baseToken(OCEAN) 18 Decimals and datatoken 18 Decimals, RATE = 1", async () => {
    let amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works
    marketFee = 1e15;
    rate = web3.utils.toWei("1");
    it("#1 - user3 create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721
        .connect(user3)
        .createERC20(
          1,
          ["ERC20DT1", "ERC20DT1Symbol"],
          [
            user3.address,
            user6.address,
            user3.address,
            "0x0000000000000000000000000000000000000000",
          ],
          [cap, 0],
          []
        );
      const trxReceiptERC20 = await trxERC20.wait();
      const event = getEventFromTx(trxReceiptERC20, "TokenCreated");
      assert(event, "Cannot find TokenCreated event");
      erc20Address = event.args[0];

      erc20Token4 = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token4.permissions(user3.address)).minter == true);

      await erc20Token4.connect(user3).mint(user3.address, cap);
      expect(await erc20Token4.balanceOf(user3.address)).to.equal(cap);
    });

    it("#2 - create exchange", async () => {
      marketFee = 1e15;
      receipt = await (
        await erc20Token4.connect(user3).createFixedRate(
          fixedRateExchange.address,
          [oceanContract.address, user3.address, marketFeeCollector.address, ZERO_ADDRESS],
          [18, 18, rate, marketFee, 0, 0]
          // 18,
          // rate,
          // user3.address,
          // marketFee,
          // marketFeeCollector.address
        )
      ).wait(); // from exchangeOwner (user3)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      // commented out for now
      // expect(eventsExchange[0].args.baseToken).to.equal(oceanContract.address);
      // expect(eventsExchange[0].args.owner).to.equal(user3.address);
      expect(eventsExchange[0].args.baseToken).to.equal(oceanContract.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );

      exchangeIdFPE = eventsExchange[0].args.exchangeId
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(0);
      expect(exchangeDetails.btSupply).to.equal(0);
    });

    it("#5 - user3 approves contract to spend tokens", async () => {
      // user3 approves how many DT tokens wants to sell
      // user3 only approves an exact amount so we can check supply etc later in the test
      await erc20Token4
        .connect(user3)
        .approve(fixedRateExchange.address, amountDTtoSell);

     
    });
  });

  describe("#5 - Dispenser", async () => {
    amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works
    marketFee = 0;
    it("#1 - user3 create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721
        .connect(user3)
        .createERC20(
          1,
          ["ERC20DT1", "ERC20DT1Symbol"],
          [
            user3.address,
            user6.address,
            user3.address,
            "0x0000000000000000000000000000000000000000",
          ],
          [cap, 0],
          []
        );
      const trxReceiptERC20 = await trxERC20.wait();
       const event = getEventFromTx(trxReceiptERC20, "TokenCreated");
      assert(event, "Cannot find TokenCreated event");
      erc20Address = event.args[0];

      erc20Token5 = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token5.permissions(user3.address)).minter == true);

      
    });

    it("#2 - create exchange", async () => {
      rate = 0;

      // interface has been modified a bit to be compatible with router etc. if this is going to stay, will update that to be more flexible
      receipt = await (
        await erc20Token5
          .connect(user3)
          .createDispenser(
            dispenser.address, web3.utils.toWei('1'), web3.utils.toWei('1'), true, ZERO_ADDRESS)
          
      ).wait(); // from exchangeOwner (user3)
      const status = await dispenser.status(erc20Token5.address)
      
      expect(status.owner).to.equal(user3.address);
      expect(status.active).to.equal(true);
    });

  });

  describe("user4 attemps to buy 5 different DTs from different type of exchanges", async () => {
    amountDTtoBuy = web3.utils.toWei("10"); // exact amount so that we can check if balances works

    it("#1 - user4 checks he has enough balance in USDC, DAI, and OCEAN, then approves router to spend his tokens", async () => {
      amount = web3.utils.toWei("1000");
      expect(await usdcContract.balanceOf(user4.address)).gt(0);
      expect(await daiContract.balanceOf(user4.address)).gt(amount);
      expect(await oceanContract.balanceOf(user4.address)).gt(amount);

      await usdcContract.connect(user4).approve(router.address, amount);
      await daiContract.connect(user4).approve(router.address, amount);
      await oceanContract.connect(user4).approve(router.address, amount);
    });

    it("#3 - user4 calls buyDTBatch", async () => {
      // operation: 0 - swapExactAmountIn
      // 1 - swapExactAmountOut
      // 2 - FixedRateExchange
      // 3 - Dispenser
      const operations4 = {
        exchangeIds: exchangeIdFPE,
        source: fixedRateExchange.address,
        operation: 2, // FIXED RATE EXCHANGE
        tokenIn: oceanContract.address,
        amountsIn: web3.utils.toWei("10"), // maximum amount of base tokens to spend
        tokenOut: erc20Token4.address,
        amountsOut: web3.utils.toWei('1'),  // how many DT we want to buy
        maxPrice: web3.utils.toWei('100'), // unused in this case,
        swapMarketFee:0,
        marketFeeAddress:user5.address
      };

      const operations5 = {
        exchangeIds: keccak256("0x00"),
        source: dispenser.address,
        operation: 3, // DISPENSER
        tokenIn: oceanContract.address, // unused in this case
        amountsIn: web3.utils.toWei("10"), // unused
        tokenOut: erc20Token5.address,
        amountsOut: web3.utils.toWei('1'),  // how many DT we want to receive
        maxPrice: web3.utils.toWei('100'), // unused in this case,
        swapMarketFee:0,
        marketFeeAddress:user5.address
      };

      expect(await erc20Token4.balanceOf(user4.address)).to.equal(0)
      expect(await erc20Token4.balanceOf(router.address)).to.equal(0)

      expect(await erc20Token5.balanceOf(user4.address)).to.equal(0)
      expect(await erc20Token5.balanceOf(router.address)).to.equal(0)

      await router.connect(user4).buyDTBatch([operations4,operations5]);

      expect(await erc20Token4.balanceOf(user4.address)).to.equal(operations4.amountsOut)
      expect(await erc20Token4.balanceOf(router.address)).to.equal(0)

      expect(await erc20Token5.balanceOf(user4.address)).to.equal(operations5.amountsOut)
      expect(await erc20Token5.balanceOf(router.address)).to.equal(0)
    });
  });

  
});