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
    const SSContract = await ethers.getContractFactory("SideStaking");
    const BPool = await ethers.getContractFactory("BPool");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );
    const Dispenser = await ethers.getContractFactory("Dispenser");

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
      .transfer(user4.address, ethers.utils.parseEther("20000"));

    // GET SOME DAI (A NEW TOKEN different from OCEAN)
    const userWithDAI = "0x16de59092dAE5CcF4A1E6439D611fd0653f0Bd01";

    await impersonate(userWithDAI);

    daiContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      daiAddress
    );
    signer = ethers.provider.getSigner(userWithDAI);
    await daiContract
      .connect(signer)
      .transfer(user3.address, ethers.utils.parseEther("100000"));

    await daiContract
      .connect(signer)
      .transfer(user4.address, ethers.utils.parseEther("100000"));

    // GET SOME USDC (token with !18 decimals (6 in this case))
    const userWithUSDC = "0xF977814e90dA44bFA03b6295A0616a897441aceC";

    await impersonate(userWithUSDC);

    usdcContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      usdcAddress
    );

    signer = ethers.provider.getSigner(userWithUSDC);

    const amount = 1e11; // 100000 
    await usdcContract.connect(signer).transfer(user3.address, amount);
    await usdcContract.connect(signer).transfer(user4.address, amount);
    // expect(
    //   await usdcContract.balanceOf(user3.address)).to.equal(amount)

    // expect(
    //     await usdcContract.balanceOf(user4.address)).to.equal(amount)

    data = web3.utils.asciiToHex("SomeData");
    flags = web3.utils.asciiToHex(constants.blob[0]);

    // DEPLOY ROUTER, SETTING OWNER

    poolTemplate = await BPool.deploy();

    router = await Router.deploy(
      owner.address,
      oceanAddress,
      poolTemplate.address,
      opcCollector.address,
      []
    );

    sideStaking = await SSContract.deploy(router.address);

    dispenser = await Dispenser.deploy(router.address);

    fixedRateExchange = await FixedRateExchange.deploy(
      router.address,
      opcCollector.address
    );

    templateERC20 = await ERC20Template.deploy();

    // SETUP ERC721 Factory with template
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      templateERC20.address,
      opcCollector.address,
      router.address
    );

    // SET REQUIRED ADDRESS

    await router.addFactory(factoryERC721.address);

    await router.addFixedRateContract(fixedRateExchange.address);

    await router.addDispenserContract(dispenser.address);

    await router.addSSContract(sideStaking.address);
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
      true
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

  describe("#1 - Pool with ocean token and market fee 0.1%", async () => {
    const swapFee = 1e15;
    const swapOceanFee = 1e15;
    const swapMarketFee = 1e15;

    it("#3 - user3 deploys a new erc20DT, assigning himself as minter", async () => {
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

      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);
    });
    // NOW user3 has 2 options, minting on his own and create custom pool, or using the staking contract and deploy a pool.

    it("#4 - user3 calls deployPool(), we then check ocean and market fee", async () => {
      // user3 hasn't minted any token so he can call deployPool()

      const ssDTBalance = await erc20Token.balanceOf(sideStaking.address);

      const initialOceanLiquidity = web3.utils.toWei("2000");
      const initialDTLiquidity = initialOceanLiquidity;
      // approve exact amount
      await oceanContract
        .connect(user3)
        .approve(router.address, web3.utils.toWei("2000"));

      // we deploy a new pool
      receipt = await (
        await erc20Token.connect(user3).deployPool(
          //  sideStaking.address,
          //  oceanAddress,
          [
            web3.utils.toWei("1"), // rate
            18, // baseTokenDecimals
            vestingAmount,
            2500000, // vested blocks
            initialOceanLiquidity, // baseToken initial pool liquidity
          ],
          //   user3.address,
          [
            swapFee, //
            swapMarketFee, // publishMarketFee
          ],
          //   marketFeeCollector.address,
          //    user3.address// publisher address (vested token)
          [
            sideStaking.address,
            oceanAddress,
            user3.address,
            user3.address,
            marketFeeCollector.address,
            poolTemplate.address,
          ]
        )
      ).wait();

      const PoolEvent = receipt.events.filter((e) => e.event === "NewPool");

      assert(PoolEvent[0].args.ssContract == sideStaking.address);

      bPoolAddress = PoolEvent[0].args.poolAddress;

      bPool = await ethers.getContractAt("BPool", bPoolAddress);

      assert((await bPool.isFinalized()) == true);

      expect(await erc20Token.balanceOf(sideStaking.address)).to.equal(
        "115792089237316195423570985008687907853269984665640564037457584007913129639935"
      );

      expect(await bPool.getOPCFee()).to.equal(1e15);
      expect(await bPool._swapPublishMarketFee()).to.equal(swapMarketFee);

      expect(await bPool.communityFees(oceanAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);
      expect(await bPool.publishMarketFees(oceanAddress)).to.equal(0);
      expect(await bPool.publishMarketFees(erc20Token.address)).to.equal(0);
    });
  });

  describe("#2 - Pool with NO ocean token (DAI 18 decimals) and market fee 0.1%", async () => {
    const swapFee = 1e15;
    const swapOceanFee = 0; // we attemp to set swapOceanFee at 0, will fail
    const swapMarketFee = 1e15;

    it("#4 - user3 deploys a new erc20DT, assigning himself as minter", async () => {
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
          [web3.utils.toWei("1000"), 0],
          []
        );
      const trxReceiptERC20 = await trxERC20.wait();
      const event = getEventFromTx(trxReceiptERC20, "TokenCreated");
      assert(event, "Cannot find TokenCreated event");
      erc20Address = event.args[0];

      erc20Token2 = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token2.permissions(user3.address)).minter == true);
    });

    it("#5 - user3 calls deployPool() and check ocean and market fee", async () => {
      // user3 hasn't minted any token so he can call deployPool()

      const ssDTBalance = await erc20Token.balanceOf(sideStaking.address);

      const initialDAILiquidity = web3.utils.toWei("700");
      const initialDTLiquidity = initialDAILiquidity;
      // approve exact amount
      await daiContract
        .connect(user3)
        .approve(router.address, initialDAILiquidity);

      // we deploy a new pool
      receipt = await (
        await erc20Token2.connect(user3).deployPool(
          //sideStaking.address,
          //  daiAddress,
          [
            web3.utils.toWei("1"), // rate
            18, // baseTokenDecimals
            web3.utils.toWei("100"), //vestingAmount
            2500000, // vested blocks
            initialDAILiquidity, // baseToken initial pool liquidity
          ],
          // user3.address,
          [swapFee, swapMarketFee],
          //  marketFeeCollector.address,
          //  user3.address// publisher address (vested token)
          [
            sideStaking.address,
            daiAddress,
            user3.address,
            user3.address,
            marketFeeCollector.address,
            poolTemplate.address,
          ]
        )
      ).wait();

      const PoolEvent = receipt.events.filter((e) => e.event === "NewPool");

      assert(PoolEvent[0].args.ssContract == sideStaking.address);

      bPoolAddress = PoolEvent[0].args.poolAddress;

      bPool2 = await ethers.getContractAt("BPool", bPoolAddress);

      assert((await bPool2.isFinalized()) == true);

      expect(await erc20Token2.balanceOf(sideStaking.address)).to.equal(
        "115792089237316195423570985008687907853269984665640564038757584007913129639935"
      );

      expect(await bPool2.getSwapFee()).to.equal(swapFee);
      expect(await bPool2.getOPCFee()).to.equal(2e15);
      expect(await bPool2._swapPublishMarketFee()).to.equal(swapMarketFee);

      expect(await bPool2.communityFees(daiAddress)).to.equal(0);
      expect(await bPool2.communityFees(erc20Token.address)).to.equal(0);
      expect(await bPool2.publishMarketFees(daiAddress)).to.equal(0);
      expect(await bPool2.publishMarketFees(erc20Token2.address)).to.equal(0);
    });
  });

  describe("#3 - Pool with NO ocean token (USDC 6 decimals) and market fee 0.1%", async () => {
    const swapFee = 1e15;
    const swapOceanFee = 0; // we attemp to set swapOceanFee at 0, will fail
    const swapMarketFee = 1e15;

    it("#4 - user3 deploys a new erc20DT, assigning himself as minter", async () => {
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

      erc20Token3 = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);
    });

    it("#5 - user3 calls deployPool() and check ocean and market fee", async () => {
      // user3 hasn't minted any token so he can call deployPool()

      const ssDTBalance = await erc20Token.balanceOf(sideStaking.address);

      initialUSDCLiquidity = 88000 * 1e6; // 88000 usdc
      baseTokenDecimals = 6;
      // approve exact amount
      await usdcContract
        .connect(user3)
        .approve(router.address, initialUSDCLiquidity);

      // we deploy a new pool
      receipt = await (
        await erc20Token3.connect(user3).deployPool(
          // sideStaking.address,
          // usdcAddress,
          [
            web3.utils.toWei("1"), // rate
            baseTokenDecimals, // baseTokenDecimals
            vestingAmount, // DT vesting amount
            2500000, // vested blocks
            initialUSDCLiquidity, // baseToken initial pool liquidity
          ],
          //  user3.address,
          [swapFee, swapMarketFee],
          // marketFeeCollector.address,
          //  user3.address// publisher address (vested token)
          [
            sideStaking.address,
            usdcAddress,
            user3.address,
            user3.address,
            marketFeeCollector.address,
            poolTemplate.address,
          ]
        )
      ).wait();

      const PoolEvent = receipt.events.filter((e) => e.event === "NewPool");

      assert(PoolEvent[0].args.ssContract == sideStaking.address);

      bPoolAddress = PoolEvent[0].args.poolAddress;

      bPool3 = await ethers.getContractAt("BPool", bPoolAddress);

      assert((await bPool3.isFinalized()) == true);

      // PROPER BALANCE HAS BEEN DEPOSITED

      expect(await bPool3.getBalance(usdcAddress)).to.equal(
        initialUSDCLiquidity
      );
      expect(await bPool3.getBalance(erc20Token3.address)).to.equal(
        web3.utils.toWei("88000")
      );

      // check the dt balance available for adding liquidity, which includes vesting amount left 

      expect(
        await sideStaking.getDatatokenBalance(erc20Token3.address)
      ).to.equal(
        (await erc20Token3.balanceOf(sideStaking.address))
      );

      expect(await bPool3.getSwapFee()).to.equal(swapFee);
      expect(await bPool3.getOPCFee()).to.equal(2e15);
      expect(await bPool3._swapPublishMarketFee()).to.equal(swapMarketFee);

      expect(await bPool3.communityFees(usdcAddress)).to.equal(0);
      expect(await bPool3.communityFees(erc20Token3.address)).to.equal(0);
      expect(await bPool3.publishMarketFees(usdcAddress)).to.equal(0);
      expect(await bPool3.publishMarketFees(erc20Token.address)).to.equal(0);
    });
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
      console.log(marketFee);

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
      assert((await erc20Token.permissions(user3.address)).minter == true);

      
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
      const operations1 = {
        exchangeIds: keccak256("0x00"), // used only for FixedRate or Dispenser, but needs to be filled even for pool
        source: bPool.address, // pool Address
        operation: 0, //swapExactAmountIn
        tokenIn: oceanContract.address,
        amountsIn: web3.utils.toWei("1"), // when swapExactAmountIn is EXACT amount IN
        tokenOut: erc20Token.address,
        amountsOut: web3.utils.toWei('0.001'), // when swapExactAmountIn is MIN amount OUT
        maxPrice: web3.utils.toWei('100'), // max price (only for pools)
        swapMarketFee:0,
        marketFeeAddress:user5.address
      };
      
      const operations2 = {
        exchangeIds: keccak256("0x00"),
        source: bPool2.address,
        operation: 1, //swapExactAmountOut
        tokenIn: daiContract.address,
        amountsIn: web3.utils.toWei("10"), // when swapExactAmountOut is MAX amount IN
        tokenOut: erc20Token2.address,
        amountsOut: web3.utils.toWei('1'),  // when swapExactAmountOut is EXACT amount OUT
        maxPrice: web3.utils.toWei('100'), // max price (only for pools) but has to be filled in any case,
        swapMarketFee:0,
        marketFeeAddress:user5.address
      };

      const operations3 = {
        exchangeIds: keccak256("0x00"),
        source: bPool3.address,
        operation: 1, //swapExactAmountOut
        tokenIn: usdcContract.address,
        amountsIn: web3.utils.toWei("10"), // when swapExactAmountOut is MAX amount IN
        tokenOut: erc20Token3.address,
        amountsOut: web3.utils.toWei('1'),  // when swapExactAmountOut is EXACT amount OUT
        maxPrice: web3.utils.toWei('100'), // max price (only for pools) but has to be filled in any case,
        swapMarketFee:0,
        marketFeeAddress:user5.address
      };

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

      expect(await erc20Token.balanceOf(user4.address)).to.equal(0)
      expect(await erc20Token.balanceOf(router.address)).to.equal(0)

      expect(await erc20Token2.balanceOf(user4.address)).to.equal(0)
      expect(await erc20Token2.balanceOf(router.address)).to.equal(0)

      expect(await erc20Token3.balanceOf(user4.address)).to.equal(0)
      expect(await erc20Token3.balanceOf(router.address)).to.equal(0)

      expect(await erc20Token4.balanceOf(user4.address)).to.equal(0)
      expect(await erc20Token4.balanceOf(router.address)).to.equal(0)

      expect(await erc20Token5.balanceOf(user4.address)).to.equal(0)
      expect(await erc20Token5.balanceOf(router.address)).to.equal(0)

      await router.connect(user4).buyDTBatch([operations1,operations2,operations3,operations4,operations5]);

      expect(await erc20Token.balanceOf(user4.address)).gt(operations1.amountsOut)
      expect(await erc20Token.balanceOf(router.address)).to.equal(0)

      expect(await erc20Token2.balanceOf(user4.address)).to.equal(operations2.amountsOut)
      expect(await erc20Token2.balanceOf(router.address)).to.equal(0)

      expect(await erc20Token3.balanceOf(user4.address)).to.equal(operations3.amountsOut)
      expect(await erc20Token3.balanceOf(router.address)).to.equal(0)

      expect(await erc20Token4.balanceOf(user4.address)).to.equal(operations4.amountsOut)
      expect(await erc20Token4.balanceOf(router.address)).to.equal(0)

      expect(await erc20Token5.balanceOf(user4.address)).to.equal(operations5.amountsOut)
      expect(await erc20Token5.balanceOf(router.address)).to.equal(0)
    });
  });

  describe("user4 attemps to add liquidity to 3 pools in the same transaction", async () => {
    
    it("#1 - user4 checks he has enough balance in USDC, DAI, and OCEAN, then approves router to spend his tokens", async () => {
      amount = web3.utils.toWei("1");
      usdc_amount = "998996980"
      expect(await usdcContract.balanceOf(user4.address)).gt(usdc_amount);
      expect(await daiContract.balanceOf(user4.address)).gt(amount);
      expect(await oceanContract.balanceOf(user4.address)).gt(amount);

      await usdcContract.connect(user4).approve(router.address, amount);
      await daiContract.connect(user4).approve(router.address, amount);
      await oceanContract.connect(user4).approve(router.address, amount);
    });

    it("#2 - user4 calls stakeBatch", async () => {
      const stake1 = {
        poolAddress: bPool.address, // pool Address
        tokenAmountIn: amount, // when swapExactAmountIn is EXACT amount IN
        minPoolAmountOut:0
      }

      const stake2 = {
        poolAddress: bPool2.address, // pool Address
        tokenAmountIn: amount, // when swapExactAmountIn is EXACT amount IN
        minPoolAmountOut:0
      }

      const stake3 = {
        poolAddress: bPool3.address, // pool Address
        tokenAmountIn: usdc_amount, // when swapExactAmountIn is EXACT amount IN
        minPoolAmountOut:0
      }

      BPool1Token1 = await ethers.getContractAt("ERC20Template", bPool.address);
      BPool1Token2 = await ethers.getContractAt("ERC20Template", bPool2.address);
      BPool1Token3 = await ethers.getContractAt("ERC20Template", bPool3.address);
      //make sure that both router and user4 does not have pool shares
      expect(await BPool1Token1.balanceOf(router.address)).to.equal(0)
      expect(await BPool1Token2.balanceOf(router.address)).to.equal(0)
      expect(await BPool1Token3.balanceOf(router.address)).to.equal(0)
      expect(await BPool1Token1.balanceOf(user4.address)).to.equal(0)
      expect(await BPool1Token2.balanceOf(user4.address)).to.equal(0)
      expect(await BPool1Token3.balanceOf(user4.address)).to.equal(0)

      await router.connect(user4).stakeBatch([stake1,stake2,stake3]);

      //make sure that router has no pool shares
      expect(await BPool1Token1.balanceOf(router.address)).to.equal(0)
      expect(await BPool1Token2.balanceOf(router.address)).to.equal(0)
      expect(await BPool1Token3.balanceOf(router.address)).to.equal(0)
      //make sure that user4 has pool shares
      expect(await BPool1Token1.balanceOf(user4.address)).gt(0)
      expect(await BPool1Token2.balanceOf(user4.address)).gt(0)
      expect(await BPool1Token3.balanceOf(user4.address)).gt(0)
    });
  });
});