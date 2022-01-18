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

describe("Swap Fees", () => {
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
    usdcContract,
    sideStaking,
    router,
    poolTemplate,
    bPoolAddress,
    bPool,
    signer,
    opfCollector,
    SwapFeesEvent,
    fixedRateExchange,
    basetokenDecimals,
    vestingAmount = web3.utils.toWei("1000"),
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
      .transfer(user4.address, ethers.utils.parseEther("10000"));

    // GET SOME USDC (token with !18 decimals (6 in this case))
    const userWithUSDC = "0xF977814e90dA44bFA03b6295A0616a897441aceC";

    await impersonate(userWithUSDC);

    usdcContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      usdcAddress
    );

    signer = ethers.provider.getSigner(userWithUSDC);

    const amount = 1e12; // 100000 USDC
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
      poolTemplate.address, // pooltemplate field, unused in this test
      opfCollector.address,
      []
    );

    sideStaking = await SSContract.deploy(router.address);

    fixedRateExchange = await FixedRateExchange.deploy(
      router.address,
      opfCollector.address
    );

    templateERC20 = await ERC20Template.deploy();

    // SETUP ERC721 Factory with template
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      templateERC20.address,
      opfCollector.address,
      router.address
    );

    // SET REQUIRED ADDRESS

    await router.addFactory(factoryERC721.address);

    await router.addFixedRateContract(fixedRateExchange.address);

    await router.addSSContract(sideStaking.address);
  });

  it("#1 - owner deploys a new ERC721 Contract", async () => {
    // by default connect() in ethers goes with the first address (owner in this case)
    const tx = await factoryERC721.deployERC721Contract(
      "NFT",
      "NFTSYMBOL",
      1,
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/"
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

  describe(" Pool with Ocean token and Publish Market fee 0.1%", async () => {
    const swapFee = 1e15;
    const swapPublishMarketFee = 1e15;

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
            18, // basetokenDecimals
            vestingAmount,
            2500000, // vested blocks
            initialOceanLiquidity, // baseToken initial pool liquidity
          ],
          //   user3.address,
          [
            swapFee, //
            swapPublishMarketFee,
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
        web3.utils.toWei("98000")
      );

      expect(await bPool.getOPFFee()).to.equal(0);
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );

      expect(await bPool.communityFees(oceanAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);
      expect(await bPool.publishMarketFees(oceanAddress)).to.equal(0);
      expect(await bPool.publishMarketFees(erc20Token.address)).to.equal(0);

      // CHECK LIQUIDITY VIEW FUNCTIONS AND VALUE
      expect(
        await bPool.calcPoolInSingleOut(
          erc20Token.address,
          web3.utils.toWei("10")
        )
      ).to.equal(
        await bPool.calcPoolInSingleOut(oceanAddress, web3.utils.toWei("10"))
      );
      expect(
        await bPool.calcPoolOutSingleIn(
          erc20Token.address,
          web3.utils.toWei("10")
        )
      ).to.equal(
        await bPool.calcPoolOutSingleIn(oceanAddress, web3.utils.toWei("10"))
      );

      expect(
        await bPool.calcSingleOutPoolIn(
          erc20Token.address,
          web3.utils.toWei("10")
        )
      ).to.equal(
        await bPool.calcSingleOutPoolIn(oceanAddress, web3.utils.toWei("10"))
      );
      expect(
        await bPool.calcSingleInPoolOut(
          erc20Token.address,
          web3.utils.toWei("10")
        )
      ).to.equal(
        await bPool.calcSingleInPoolOut(oceanAddress, web3.utils.toWei("10"))
      );
    });

    it("#5 - user4 buys some DT - exactAmountIn", async () => {
      // pool has initial ocean tokens at the beginning
      assert(
        (await oceanContract.balanceOf(bPoolAddress)) ==
          web3.utils.toWei("2000")
      );

      // we approve the pool to move Ocean tokens
      await oceanContract
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000"));

      // user4 has no DT before swap
      assert((await erc20Token.balanceOf(user4.address)) == 0);

      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4OceanBalance = await oceanContract.balanceOf(user4.address);
      const dtMarketFeeBal = await bPool.publishMarketFees(erc20Token.address);
      const oceanMarketFeeBal = await bPool.publishMarketFees(oceanAddress);
      // we prepare the arrays, user5 is going to receive the dynamic market fee
      amountIn = web3.utils.toWei("10");
      minAmountOut = web3.utils.toWei("1");
      maxPrice = web3.utils.toWei("10");
      // we set a dynamic market fee
      marketFee = 1e15; //0.1%
      const tokenInOutMarket = [
        oceanAddress,
        erc20Token.address,
        user5.address,
      ]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [amountIn, minAmountOut, maxPrice, marketFee]; // [exactAmountIn,minAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      // user4 got his DT
      assert((await erc20Token.balanceOf(user4.address)) > 0);

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // marketFee have been calculated properly - ocean fee is zero
      expect(web3.utils.toWei("0.01")).to.equal(args.marketFeeAmount);

      // publishMarketFees accounting increased as expected , in OCEAN
      expect(oceanAddress).to.equal(args.tokenFees);
      expect(oceanMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.publishMarketFees(args.tokenFees)
      );
      // check user5 balance (market fee receiver)
      expect(await oceanContract.balanceOf(user5.address)).to.equal(web3.utils.toWei("0.01"))

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      // CHECK SWAP BALANCES
      // user 4 OCEAN balance decresead properly
      expect(
        (await oceanContract.balanceOf(user4.address)).add(
          swapArgs.tokenAmountIn
        )
      ).to.equal(user4OceanBalance);
      // user 4 DT balance increased properly
      expect(user4DTbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await erc20Token.balanceOf(user4.address)
      );

      // CHECK MARKET FEES:
      MarketFeeEvent = receipt.events.filter((e) => e.event === "MarketFees");
      const marketFeeArgs = MarketFeeEvent[0].args;
      expect(marketFeeArgs.to).to.equal(user5.address)
      expect(marketFeeArgs.token).to.equal(oceanAddress)
      expect(marketFeeArgs.amount).to.equal(web3.utils.toWei("0.01"))
        // FEE is 0.1% 
        expect(marketFeeArgs.amount.mul(1000)).to.be.equal(swapArgs.tokenAmountIn)
    });

    it("#6 - user4 buys some DT - exactAmountOut", async () => {
      // we already approved pool to withdraw Ocean tokens

      // user only has DT from previous test
      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4OceanBalance = await oceanContract.balanceOf(user4.address);

      const dtMarketFeeBal = await bPool.publishMarketFees(erc20Token.address);
      const oceanMarketFeeBal = await bPool.publishMarketFees(oceanAddress);

      const user5BalBefore = await oceanContract.balanceOf(user5.address)
      // we prepare the arrays, user5 is going to receive the dynamic market fee
      maxAmountIn = web3.utils.toWei("100");
      amountOut = web3.utils.toWei("10");
      maxPrice = web3.utils.toWei("10");
      marketFee = 1e15; // 0.1%
      const tokenInOutMarket = [
        oceanAddress,
        erc20Token.address,
        user5.address,
      ]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [maxAmountIn, amountOut, maxPrice, marketFee]; // [maxAmountIn,exactAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;
      
      

      // CHECK SWAP BALANCES
      // user 4 DT balance increased properly
      expect(user4DTbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await erc20Token.balanceOf(user4.address)
      );
      // user 4 Ocean balance decreased properly
      expect(user4OceanBalance.sub(swapArgs.tokenAmountIn)).to.equal(
        await oceanContract.balanceOf(user4.address)
      );

      // check user5 balance (market fee receiver)
      expect(await oceanContract.balanceOf(user5.address)).gt(user5BalBefore)

      // WE NOW CHECK FEES
      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // marketFee have been calculated properly - ocean fee is zero
      expect(0).to.equal(args.oceanFeeAmount);

      // publishMarketFees accounting increased as expected (fees are taken from the amountIn so OCEAN IN THIS CASE)
      expect(oceanMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.publishMarketFees(args.tokenFees)
      );
      expect(dtMarketFeeBal).to.equal(
        await bPool.publishMarketFees(erc20Token.address)
      );

      // FEES HAVE BEEN CALCULATED PROPERLY
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );

       // CHECK MARKET FEES:
       MarketFeeEvent = receipt.events.filter((e) => e.event === "MarketFees");
       const marketFeeArgs = MarketFeeEvent[0].args;
       expect(marketFeeArgs.to).to.equal(user5.address)
       expect(marketFeeArgs.token).to.equal(oceanAddress)
       expect(marketFeeArgs.amount).to.equal((await oceanContract.balanceOf(user5.address)).sub(user5BalBefore))
        // FEE is 0.1% 
        expect(marketFeeArgs.amount.mul(1000)).to.be.closeTo(swapArgs.tokenAmountIn,5)
    });

    it("#7 - user4 swaps some DT back to Ocean with swapExactAmountIn, check swap custom fees", async () => {
      assert((await bPool.isFinalized()) == true);

      await erc20Token
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4Oceanbalance = await oceanContract.balanceOf(user4.address);

      const dtMarketFeeBal = await bPool.publishMarketFees(erc20Token.address);
      const oceanMarketFeeBal = await bPool.publishMarketFees(oceanAddress);

      expect(await bPool.communityFees(oceanAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);

      expect(await bPool.publishMarketFees(erc20Token.address)).to.equal(0);

      // we prepare the arrays, user5 is going to receive the dynamic market fee
      amountIn = web3.utils.toWei("10");
      minAmountOut = web3.utils.toWei("1");
      maxPrice = web3.utils.toWei("10");
      marketFee = web3.utils.toWei("0.01"); //1% 1e16
      const tokenInOutMarket = [
        erc20Token.address,
        oceanAddress,
        user5.address,
      ]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [amountIn, minAmountOut, maxPrice, marketFee]; // [exactAmountIn,minAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

       // check user5 balance (market fee receiver)
       expect(await erc20Token.balanceOf(user5.address)).to.equal(web3.utils.toWei("0.1"))

      const args = SwapFeesEvent[0].args;

      // marketFee have been calculated properly - ocean fee is zero
      expect(web3.utils.toWei("0.01")).to.equal(args.marketFeeAmount);
      // expect(oceanMarketFeeBal).to.equal(args.oceanFeeAmount)

      // publishMarketFees accounting increased as expected
      expect(dtMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.publishMarketFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      // CHECK SWAP BALANCES
      // user 4 DT balance decresead properly
      expect(
        (await erc20Token.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DTbalance);
      // user 4 Ocean balance increased properly
      expect(user4Oceanbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await oceanContract.balanceOf(user4.address)
      );

      // FEES HAVE BEEN CALCULATED PROPERLY
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );

       // CHECK MARKET FEES:
       MarketFeeEvent = receipt.events.filter((e) => e.event === "MarketFees");
       const marketFeeArgs = MarketFeeEvent[0].args;
       expect(marketFeeArgs.to).to.equal(user5.address)
       expect(marketFeeArgs.token).to.equal(erc20Token.address)
       expect(marketFeeArgs.amount).to.equal(web3.utils.toWei("0.1"))
    });

    it("#8 - user4 swaps some DT back to Ocean with swapExactAmountOut, check swap custom fees", async () => {
      await erc20Token
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4Oceanbalance = await oceanContract.balanceOf(user4.address);

      const dtMarketFeeBal = await bPool.publishMarketFees(erc20Token.address);
      const oceanMarketFeeBal = await bPool.publishMarketFees(oceanAddress);

      const user5BalBefore = await erc20Token.balanceOf(user5.address)
      expect(await bPool.communityFees(oceanAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);

      // we prepare the arrays, user5 is going to receive the dynamic market fee
      maxAmountIn = web3.utils.toWei("10");
      amountOut = web3.utils.toWei("1");
      maxPrice = web3.utils.toWei("10");
      marketFee = web3.utils.toWei("0.1"); // 10%
      const tokenInOutMarket = [
        erc20Token.address,
        oceanAddress,
        user5.address,
      ]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [maxAmountIn, amountOut, maxPrice, marketFee]; // [maxAmountIn,exactAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

         // check user5 balance (market fee receiver)
       expect(await erc20Token.balanceOf(user5.address)).gt(user5BalBefore)
      // publishMarketFees accounting increased as expected
      expect(dtMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.publishMarketFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      // CHECK SWAP BALANCES
      // user 4 DT balance decresead properly
      expect(
        (await erc20Token.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DTbalance);
      // user 4 Ocean balance increased properly
      expect(user4Oceanbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await oceanContract.balanceOf(user4.address)
      );

      // FEES HAVE BEEN CALCULATED PROPERLY
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );
       // CHECK MARKET FEES:
       MarketFeeEvent = receipt.events.filter((e) => e.event === "MarketFees");
       const marketFeeArgs = MarketFeeEvent[0].args;
       expect(marketFeeArgs.to).to.equal(user5.address)
       expect(marketFeeArgs.token).to.equal(erc20Token.address)
       expect(marketFeeArgs.amount).to.equal((await erc20Token.balanceOf(user5.address)).sub(user5BalBefore))
       // FEE is 10% 
       expect(marketFeeArgs.amount.mul(10)).to.be.closeTo(swapArgs.tokenAmountIn,5)
    });

    it("#9 - user4 adds more liquidity with joinPool() (adding both tokens)", async () => {
      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4Oceanbalance = await oceanContract.balanceOf(user4.address);
      const user4BPTbalance = await bPool.balanceOf(user4.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      const BPTAmountOut = web3.utils.toWei("0.01");
      const maxAmountsIn = [
        web3.utils.toWei("50"), // Amounts IN
        web3.utils.toWei("50"), // Amounts IN
      ];
      await oceanContract
        .connect(user4)
        .approve(bPool.address, web3.utils.toWei("50"));

      await erc20Token
        .connect(user4)
        .approve(bPool.address, web3.utils.toWei("50"));

      receipt = await (
        await bPool.connect(user4).joinPool(
          BPTAmountOut, // exactBPT OUT token OUT
          maxAmountsIn
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");
      expect(JoinEvent[0].args.tokenIn).to.equal(erc20Token.address);
      expect(JoinEvent[1].args.tokenIn).to.equal(oceanAddress);

      // we check all balances
      expect(
        JoinEvent[0].args.tokenAmountIn.add(
          await erc20Token.balanceOf(user4.address)
        )
      ).to.equal(user4DTbalance);
      expect(
        JoinEvent[1].args.tokenAmountIn.add(
          await oceanContract.balanceOf(user4.address)
        )
      ).to.equal(user4Oceanbalance);

      expect(user4BPTbalance.add(BPTAmountOut)).to.equal(
        await bPool.balanceOf(user4.address)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#10 - user3 adds more liquidity with joinswapExternAmountIn (only OCEAN)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      const dtBalanceBeforeJoin = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );

      await oceanContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const oceanAmountIn = web3.utils.toWei("100");
      const minBPTOut = web3.utils.toWei("0.1");

      receipt = await (
        await bPool.connect(user3).joinswapExternAmountIn(
          oceanAddress, //token IN
          oceanAmountIn, // amount In (ocean tokens)
          minBPTOut // BPT token out
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(oceanAddress);

      expect(JoinEvent[0].args.tokenAmountIn).to.equal(oceanAmountIn);

      expect(JoinEvent[1].args.tokenIn).to.equal(erc20Token.address);

      const sideStakingAmountIn = ssContractDTbalance.sub(
        await erc20Token.balanceOf(sideStaking.address)
      );
      console.log(ethers.utils.formatEther(sideStakingAmountIn));
      console.log(ethers.utils.formatEther(oceanAmountIn));
      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeJoin.sub(sideStakingAmountIn));
      expect(JoinEvent[1].args.tokenAmountIn).to.equal(sideStakingAmountIn);

      // we check ssContract actually moved DT and got back BPT
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance.sub(sideStakingAmountIn));

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(BPTEvent[0].args.bptAmount.add(ssContractBPTbalance)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      // no dt token where taken from user3
      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );
    });

    it("#11 - user3 adds more liquidity with joinswapPoolAmountOut (only OCEAN)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      await oceanContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const dtBalanceBeforeJoin = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      const BPTAmountOut = ethers.utils.parseEther("0.1");
      const maxOceanIn = ethers.utils.parseEther("100");

      receipt = await (
        await bPool.connect(user3).joinswapPoolAmountOut(
          oceanAddress, //token IN
          BPTAmountOut, // exact lp token out
          maxOceanIn // max ocean tokens IN
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(oceanAddress);
      expect(JoinEvent[1].args.tokenIn).to.equal(erc20Token.address);
      console.log(
        ethers.utils.formatEther(JoinEvent[0].args.tokenAmountIn),
        "ocean in"
      );
      console.log(
        ethers.utils.formatEther(JoinEvent[1].args.tokenAmountIn),
        "dt in"
      );
      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeJoin.sub(JoinEvent[1].args.tokenAmountIn));
      // check balances (ocean and bpt)
      expect(
        JoinEvent[0].args.tokenAmountIn.add(
          await oceanContract.balanceOf(user3.address)
        )
      ).to.equal(user3Oceanbalance);

      expect(BPTAmountOut.add(user3BPTbalance)).to.equal(
        await bPool.balanceOf(user3.address)
      );

      // we check ssContract received the same amount of BPT
      expect(ssContractBPTbalance.add(BPTAmountOut)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      // and also that DT balance lowered in the ssContract
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );

      // no token where taken from user3.
      expect(user3DTbalance).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
    });
    it("#12 - user3 removes liquidity with ExitPool, receiving both tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const dtBalanceBeforeExit = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );

      const BPTAmountIn = ethers.utils.parseEther("0.5");
      const minAmountOut = [
        web3.utils.toWei("1"), // min amount out for OCEAN AND DT
        web3.utils.toWei("1"),
      ];
      receipt = await (
        await bPool.connect(user3).exitPool(
          BPTAmountIn, //exact BPT token IN
          minAmountOut
        )
      ).wait();

      const ExitEvents = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check all balances (DT,OCEAN,BPT)
      expect(ExitEvents[0].args.tokenOut).to.equal(erc20Token.address);
      expect(ExitEvents[1].args.tokenOut).to.equal(oceanAddress);

      expect(ExitEvents[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
      expect(ExitEvents[1].args.tokenAmountOut.add(user3Oceanbalance)).to.equal(
        await oceanContract.balanceOf(user3.address)
      );

      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeExit);

      expect((await bPool.balanceOf(user3.address)).add(BPTAmountIn)).to.equal(
        user3BPTbalance
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#13 - user3 removes liquidity with exitswapPoolAmountIn, receiving only OCEAN tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required
      const dtBalanceBeforeExit = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const BPTAmountIn = ethers.utils.parseEther("0.5");
      const minOceanOut = web3.utils.toWei("0.5");

      receipt = await (
        await bPool.connect(user3).exitswapPoolAmountIn(
          oceanAddress,
          BPTAmountIn, //BPT token IN
          minOceanOut // min amount OCEAN out
        )
      ).wait();

      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(oceanContract.address);
      expect(ExitEvent[1].args.tokenOut).to.equal(erc20Token.address);
      console.log(
        ethers.utils.formatEther(ExitEvent[0].args.tokenAmountOut),
        "ocean out"
      );
      console.log(
        ethers.utils.formatEther(ExitEvent[1].args.tokenAmountOut),
        "dt out"
      );
      // we check user3 OCEAN balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3Oceanbalance)).to.equal(
        await oceanContract.balanceOf(user3.address)
      );

      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeExit.add(ExitEvent[1].args.tokenAmountOut));
      // we also check user3 BPT balance before and after
      expect(user3BPTbalance).to.equal(
        (await bPool.balanceOf(user3.address)).add(BPTAmountIn)
      );

      // NOW we check the ssContract BPT balance decresead as expected
      expect(ssContractBPTbalance).to.equal(
        (await bPool.balanceOf(sideStaking.address)).add(BPTAmountIn)
      );
      // and that ssContract got back his dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(sideStaking.address));
    });

    it("#14 - user3 removes liquidity with exitswapPoolAmountIn, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      // NO APPROVAL FOR BPT is required
      const dtBalanceBeforeExit = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      const user3BPTbalance = await bPool.balanceOf(user3.address);
      console.log("user BPT Balance", user3BPTbalance.toString());

      const BPTAmountIn = ethers.utils.parseEther("0.2");
      const minDTOut = ethers.utils.parseEther("0.5");
      receipt = await (
        await bPool.connect(user3).exitswapPoolAmountIn(
          erc20Token.address,
          BPTAmountIn, //BPT token IN
          minDTOut // min amount DT out
        )
      ).wait();

      expect(await oceanContract.balanceOf(user3.address)).to.equal(
        user3Oceanbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      assert(ExitEvent[0].args.caller == user3.address);
      assert(ExitEvent[0].args.tokenOut == erc20Token.address);
      console.log(
        ethers.utils.formatEther(ExitEvent[0].args.tokenAmountOut),
        "dt out"
      );

      // we check user3 DT balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );

      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeExit);

      // we also check user3 BPT balance before and after
      expect(user3BPTbalance).to.equal(
        (await bPool.balanceOf(user3.address)).add(BPTAmountIn)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });
    it("#15 - user3 removes liquidity with exitswapExternAmountOut, receiving only OCEAN tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required
      const dtBalanceBeforeExit = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const maxBTPIn = ethers.utils.parseEther("0.5");
      const exactOceanOut = ethers.utils.parseEther("1");

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          oceanAddress,
          exactOceanOut, // exact amount OCEAN out
          maxBTPIn //max BPT token IN
        )
      ).wait();

      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(oceanContract.address);
      expect(ExitEvent[1].args.tokenOut).to.equal(erc20Token.address);
      console.log(
        ethers.utils.formatEther(ExitEvent[0].args.tokenAmountOut),
        "ocean out"
      );
      console.log(
        ethers.utils.formatEther(ExitEvent[1].args.tokenAmountOut),
        "dt out"
      );
      // we check user3 OCEAN balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3Oceanbalance)).to.equal(
        await oceanContract.balanceOf(user3.address)
      );
      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeExit.add(ExitEvent[1].args.tokenAmountOut));
      // NOW we check the ssContract BPT balance
      expect(ssContractBPTbalance.sub(BPTEvent[0].args.bptAmount)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );
      // and that we got back some dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(sideStaking.address));
    });

    it("#16 - user3 removes liquidity with exitswapExternAmountOut, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      // NO APPROVAL FOR BPT is required
      const dtBalanceBeforeExit = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      const user3BPTbalance = await bPool.balanceOf(user3.address);

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          erc20Token.address,
          ethers.utils.parseEther("0.5"), // exact amount DT out
          web3.utils.toWei("1") //max BPT token IN
        )
      ).wait();

      // OCEAN BALANCE DOESN"T CHANGE
      expect(await oceanContract.balanceOf(user3.address)).to.equal(
        user3Oceanbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");
      // BPT balance decrease
      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(erc20Token.address);
      console.log(
        ethers.utils.formatEther(ExitEvent[0].args.tokenAmountOut),
        "dt out"
      );
      // we check user3 DT balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeExit);
      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#17 - we check again no ocean and market fees were accounted", async () => {
      expect(await bPool.getOPFFee()).to.equal(0);
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );

      expect(await bPool.communityFees(oceanAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);

      // market fee actually collected some fees
      assert((await bPool.publishMarketFees(oceanAddress)).gt(0) == true);
      assert((await bPool.publishMarketFees(erc20Token.address)).gt(0) == true);
    });

    it("#18 - market collector withdraws fees", async () => {
      assert((await bPool.publishMarketFees(oceanAddress)).gt(0) == true);
      assert((await bPool.publishMarketFees(erc20Token.address)).gt(0) == true);

      expect(await erc20Token.balanceOf(user2.address)).to.equal(0);
      expect(await oceanContract.balanceOf(user2.address)).to.equal(0);

      await bPool.connect(marketFeeCollector).collectMarketFee();
    });
    it("#19 - can change fees", async () => {
      expect(await bPool.getSwapFee()).to.equal(swapFee);
      const newSwapFee = 2e15;
      await sideStaking.connect(user3).setPoolSwapFee(erc20Token.address,bPool.address, newSwapFee);
      expect(await bPool.getSwapFee()).to.equal(newSwapFee);
    });
  });

  describe(" Pool with NO Ocean token (DAI 18 decimals) and Publish Market fee 0.1%", async () => {
    const swapFee = 1e15;
    const swapOceanFee = 0; // we attemp to set swapOceanFee at 0, will fail
    const swapPublishMarketFee = 1e15;
    const swapMarketFee = 0;

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

      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);
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
        await erc20Token.connect(user3).deployPool(
          //sideStaking.address,
          //  daiAddress,
          [
            web3.utils.toWei("1"), // rate
            18, // basetokenDecimals
            web3.utils.toWei("100"), //vestingAmount
            2500000, // vested blocks
            initialDAILiquidity, // baseToken initial pool liquidity
          ],
          // user3.address,
          [swapFee, swapPublishMarketFee],
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

      bPool = await ethers.getContractAt("BPool", bPoolAddress);

      assert((await bPool.isFinalized()) == true);

      expect(await erc20Token.balanceOf(sideStaking.address)).to.equal(
        web3.utils.toWei("300")
      );

      expect(await bPool.getSwapFee()).to.equal(swapFee);
      expect(await bPool.getOPFFee()).to.equal(1e15);
      expect(await bPool.getMarketFee()).to.equal(swapPublishMarketFee);

      expect(await bPool.communityFees(daiAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);
      expect(await bPool.publishMarketFees(daiAddress)).to.equal(0);
      expect(await bPool.publishMarketFees(erc20Token.address)).to.equal(0);

      // same amount of token out for dai and dt
      expect(
        await bPool.calcPoolInSingleOut(
          erc20Token.address,
          web3.utils.toWei("10")
        )
      ).to.equal(
        await bPool.calcPoolInSingleOut(daiAddress, web3.utils.toWei("10"))
      );

      // same amount of pool out for dai and dt amount in
      expect(
        await bPool.calcPoolOutSingleIn(
          erc20Token.address,
          web3.utils.toWei("10")
        )
      ).to.equal(
        await bPool.calcPoolOutSingleIn(daiAddress, web3.utils.toWei("10"))
      );

      // same amount of token out for dai and dt exact pool amount in
      expect(
        await bPool.calcSingleOutPoolIn(
          erc20Token.address,
          web3.utils.toWei("10")
        )
      ).to.equal(
        await bPool.calcSingleOutPoolIn(daiAddress, web3.utils.toWei("10"))
      );
      // same amount of token in for dai and dt to get exact pool amount out
      expect(
        await bPool.calcSingleInPoolOut(
          erc20Token.address,
          web3.utils.toWei("10")
        )
      ).to.equal(
        await bPool.calcSingleInPoolOut(daiAddress, web3.utils.toWei("10"))
      );

      // we check swap math
      expect(
        await bPool.getAmountOutExactIn(
          daiAddress,
          erc20Token.address,
          web3.utils.toWei("1"),
          swapMarketFee
        )
      ).to.equal(
        await bPool.getAmountOutExactIn(
          erc20Token.address,
          daiAddress,
          web3.utils.toWei("1"),
          swapMarketFee
        )
      );
      expect(
        await bPool.getAmountInExactOut(
          erc20Token.address,
          daiAddress,
          web3.utils.toWei("1"),
          swapMarketFee
        )
      ).to.equal(
        await bPool.getAmountInExactOut(
          daiAddress,
          erc20Token.address,
          web3.utils.toWei("1"),
          swapMarketFee
        )
      );
    });
    it("#6 - user4 buys some DT - exactAmountIn", async () => {
      // pool has initial ocean tokens at the beginning
      assert(
        (await daiContract.balanceOf(bPoolAddress)) == web3.utils.toWei("700")
      );

      // we approve the pool to move dai tokens
      await daiContract
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000"));

      // user4 has no DT before swap
      assert((await erc20Token.balanceOf(user4.address)) == 0);

      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4DAIBalance = await daiContract.balanceOf(user4.address);
      const dtMarketFeeBal = await bPool.publishMarketFees(erc20Token.address);
      const daiMarketFeeBal = await bPool.publishMarketFees(daiAddress);
      const dtOPFFeeBal = await bPool.communityFees(erc20Token.address);
      const daiOPFFeeBal = await bPool.communityFees(daiAddress);
      // we prepare the arrays, user5 is going to receive the dynamic market fee
      amountIn = web3.utils.toWei("10");
      minAmountOut = web3.utils.toWei("1");
      maxPrice = web3.utils.toWei("10");
      marketFee = 0;
      const tokenInOutMarket = [daiAddress, erc20Token.address, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [amountIn, minAmountOut, maxPrice, marketFee]; // [exactAmountIn,minAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // marketFeeAmount and oceanFeeAmont have been calculated properly - ocean fee is 0.1% (set by the contracts)
      expect(web3.utils.toWei("0.01")).to.equal(args.marketFeeAmount);
      expect(web3.utils.toWei("0.01")).to.equal(args.oceanFeeAmount);
      expect(args.oceanFeeAmount).to.equal(args.swapFeeAmount);
      expect(web3.utils.toWei("0.01")).to.equal(args.swapFeeAmount);

      // publishMarketFees and opfFees accounting increased as expected , in DAI
      expect(daiAddress).to.equal(args.tokenFees);
      expect(daiMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.publishMarketFees(args.tokenFees)
      );
      expect(daiOPFFeeBal.add(args.oceanFeeAmount)).to.equal(
        await bPool.communityFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      // CHECK SWAP BALANCES

      // user 4 DAI balance decresead properly
      expect(
        (await daiContract.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DAIBalance);
      // user 4 DT balance increased properly
      expect(user4DTbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await erc20Token.balanceOf(user4.address)
      );
      console.log(swapArgs.tokenAmountOut.toString(), "amount out");
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1000)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );
    });

    it("#7 - user4 buys some DT  - exactAmountOut", async () => {
      // we already approved pool to withdraw Ocean tokens

      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4DAIBalance = await daiContract.balanceOf(user4.address);
      const dtMarketFeeBal = await bPool.publishMarketFees(erc20Token.address);
      const daiMarketFeeBal = await bPool.publishMarketFees(daiAddress);
      const dtOPFFeeBal = await bPool.communityFees(erc20Token.address);
      const daiOPFFeeBal = await bPool.communityFees(daiAddress);

      // we prepare the arrays, user5 is going to receive the dynamic market fee
      maxAmountIn = web3.utils.toWei("100");
      amountOut = web3.utils.toWei("10");
      maxPrice = web3.utils.toWei("10");
      marketFee = 0;
      const tokenInOutMarket = [daiAddress, erc20Token.address, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [maxAmountIn, amountOut, maxPrice, marketFee]; // [maxAmountIn,exactAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // publishMarketFees and opfFees accounting increased as expected , in DAI
      expect(daiAddress).to.equal(args.tokenFees);
      expect(daiMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.publishMarketFees(args.tokenFees)
      );
      expect(daiOPFFeeBal.add(args.oceanFeeAmount)).to.equal(
        await bPool.communityFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;
      // marketFeeAmount and oceanFeeAmont have been calculated properly - ocean fee is 0.1% (set by the contracts)
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1000)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );

      // CHECK SWAP BALANCES

      // user 4 DAI balance decresead properly
      expect(
        (await daiContract.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DAIBalance);
      // user 4 DT balance increased properly
      expect(user4DTbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await erc20Token.balanceOf(user4.address)
      );
    });

    it("#8 - user4 swaps some DT back to DAI swapExactAmountIn", async () => {
      assert((await bPool.isFinalized()) == true);

      await erc20Token
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4DAIbalance = await daiContract.balanceOf(user4.address);

      // we prepare the arrays, user5 is going to receive the dynamic market fee
      amountIn = web3.utils.toWei("10");
      minAmountOut = web3.utils.toWei("1");
      maxPrice = web3.utils.toWei("10");
      marketFee = 0;
      const tokenInOutMarket = [erc20Token.address, daiAddress, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [amountIn, minAmountOut, maxPrice, marketFee]; // [exactAmountIn,minAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      expect(
        (await erc20Token.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DTbalance);

      expect(await daiContract.balanceOf(user4.address)).to.equal(
        user4DAIbalance.add(swapArgs.tokenAmountOut)
      );

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // WE CHECK FEES WERE CALCULATED PROPERLY
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1000)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );
    });

    it("#9 - user4 swaps some DT back to DAI swapExactAmountOut", async () => {
      assert((await bPool.isFinalized()) == true);

      await erc20Token
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4DAIbalance = await daiContract.balanceOf(user4.address);

      // we prepare the arrays, user5 is going to receive the dynamic market fee
      maxAmountIn = web3.utils.toWei("10");
      amountOut = web3.utils.toWei("1");
      maxPrice = web3.utils.toWei("10");
      marketFee = 0;
      const tokenInOutMarket = [erc20Token.address, daiAddress, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [maxAmountIn, amountOut, maxPrice, marketFee]; // [maxAmountIn,exactAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      expect(
        (await erc20Token.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DTbalance);

      expect(await daiContract.balanceOf(user4.address)).to.equal(
        user4DAIbalance.add(swapArgs.tokenAmountOut)
      );

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // WE CHECK FEES WERE CALCULATED PROPERLY
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1000)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );
    });

    it("#9 - user4 adds more liquidity with joinPool() (adding both tokens)", async () => {
      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4DAIbalance = await daiContract.balanceOf(user4.address);
      const user4BPTbalance = await bPool.balanceOf(user4.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      const BPTAmountOut = web3.utils.toWei("0.01");
      const maxAmountsIn = [
        web3.utils.toWei("50"), // Amounts IN
        web3.utils.toWei("50"), // Amounts IN
      ];
      await daiContract
        .connect(user4)
        .approve(bPool.address, web3.utils.toWei("50"));

      await erc20Token
        .connect(user4)
        .approve(bPool.address, web3.utils.toWei("50"));

      receipt = await (
        await bPool.connect(user4).joinPool(
          BPTAmountOut, // exactBPT OUT token OUT
          maxAmountsIn
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");
      expect(JoinEvent[0].args.tokenIn).to.equal(erc20Token.address);
      expect(JoinEvent[1].args.tokenIn).to.equal(daiAddress);
      console.log(
        ethers.utils.formatEther(JoinEvent[0].args.tokenAmountIn),
        "dt in"
      );
      console.log(
        ethers.utils.formatEther(JoinEvent[1].args.tokenAmountIn),
        "dai in"
      );
      // we check all balances
      expect(
        JoinEvent[0].args.tokenAmountIn.add(
          await erc20Token.balanceOf(user4.address)
        )
      ).to.equal(user4DTbalance);
      expect(
        JoinEvent[1].args.tokenAmountIn.add(
          await daiContract.balanceOf(user4.address)
        )
      ).to.equal(user4DAIbalance);

      expect(user4BPTbalance.add(BPTAmountOut)).to.equal(
        await bPool.balanceOf(user4.address)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#10 - user3 adds more liquidity with joinswapExternAmountIn (only DAI)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      //const user3Oceanbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      await daiContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const daiAmountIn = web3.utils.toWei("100");
      const minBPTOut = web3.utils.toWei("0.1");

      receipt = await (
        await bPool.connect(user3).joinswapExternAmountIn(
          daiAddress, //token IN
          daiAmountIn, // amount In (dai tokens)
          minBPTOut // BPT token out
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(daiAddress);

      expect(JoinEvent[0].args.tokenAmountIn).to.equal(daiAmountIn);

      expect(JoinEvent[1].args.tokenIn).to.equal(erc20Token.address);
      console.log(
        ethers.utils.formatEther(JoinEvent[0].args.tokenAmountIn),
        "dai in"
      );
      console.log(
        ethers.utils.formatEther(JoinEvent[1].args.tokenAmountIn),
        "dt in"
      );
      const sideStakingAmountIn = ssContractDTbalance.sub(
        await erc20Token.balanceOf(sideStaking.address)
      );

      expect(JoinEvent[1].args.tokenAmountIn).to.equal(sideStakingAmountIn);
      console.log(sideStakingAmountIn.toString());
      console.log(JoinEvent[0].args.tokenAmountIn.toString());
      console.log(JoinEvent[1].args.tokenAmountIn.toString());

      // we check ssContract actually moved DT and got back BPT
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance.sub(sideStakingAmountIn));

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(BPTEvent[0].args.bptAmount.add(ssContractBPTbalance)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      // no dt token where taken from user3
      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );
    });

    it("#11 - user3 adds more liquidity with joinswapPoolAmountOut (only DAI)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      await daiContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const BPTAmountOut = ethers.utils.parseEther("0.1");
      const maxOceanIn = ethers.utils.parseEther("100");

      receipt = await (
        await bPool.connect(user3).joinswapPoolAmountOut(
          daiAddress, //token IN
          BPTAmountOut, // exact lp token out
          maxOceanIn // max ocean tokens IN
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(daiAddress);
      expect(JoinEvent[1].args.tokenIn).to.equal(erc20Token.address);
      console.log(
        ethers.utils.formatEther(JoinEvent[0].args.tokenAmountIn),
        "dai in"
      );
      console.log(
        ethers.utils.formatEther(JoinEvent[1].args.tokenAmountIn),
        "dt in"
      );
      // check balances (ocean and bpt)
      expect(
        JoinEvent[0].args.tokenAmountIn.add(
          await daiContract.balanceOf(user3.address)
        )
      ).to.equal(user3DAIbalance);

      expect(BPTAmountOut.add(user3BPTbalance)).to.equal(
        await bPool.balanceOf(user3.address)
      );

      // we check ssContract received the same amount of BPT
      expect(ssContractBPTbalance.add(BPTAmountOut)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      // and also that DT balance lowered in the ssContract
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );

      // no token where taken from user3.
      expect(user3DTbalance).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
    });
    it("#12 - user3 removes liquidity with ExitPool, receiving both tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);

      const BPTAmountIn = ethers.utils.parseEther("0.5");
      const minAmountOut = [
        web3.utils.toWei("1"), // min amount out for OCEAN AND DT
        web3.utils.toWei("1"),
      ];
      receipt = await (
        await bPool.connect(user3).exitPool(
          BPTAmountIn, //exact BPT token IN
          minAmountOut
        )
      ).wait();

      const ExitEvents = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check all balances (DT,OCEAN,BPT)
      expect(ExitEvents[0].args.tokenOut).to.equal(erc20Token.address);
      expect(ExitEvents[1].args.tokenOut).to.equal(daiAddress);

      expect(ExitEvents[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
      expect(ExitEvents[1].args.tokenAmountOut.add(user3DAIbalance)).to.equal(
        await daiContract.balanceOf(user3.address)
      );

      expect((await bPool.balanceOf(user3.address)).add(BPTAmountIn)).to.equal(
        user3BPTbalance
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#13 - user3 removes liquidity with exitswapPoolAmountIn, receiving only DAI tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const BPTAmountIn = ethers.utils.parseEther("0.5");
      const minDAIOut = web3.utils.toWei("0.5");

      receipt = await (
        await bPool.connect(user3).exitswapPoolAmountIn(
          daiAddress,
          BPTAmountIn, //BPT token IN
          minDAIOut // min amount DAI out
        )
      ).wait();

      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(daiContract.address);
      expect(ExitEvent[1].args.tokenOut).to.equal(erc20Token.address);
      // we check user3 DAI balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DAIbalance)).to.equal(
        await daiContract.balanceOf(user3.address)
      );
      console.log(
        ethers.utils.formatEther(ExitEvent[0].args.tokenAmountOut),
        "dai out"
      );
      console.log(
        ethers.utils.formatEther(ExitEvent[1].args.tokenAmountOut),
        "dt out"
      );
      // we also check user3 BPT balance before and after
      expect(user3BPTbalance).to.equal(
        (await bPool.balanceOf(user3.address)).add(BPTAmountIn)
      );

      // NOW we check the ssContract BPT balance
      expect(ssContractBPTbalance).to.equal(
        (await bPool.balanceOf(sideStaking.address)).add(BPTAmountIn)
      );
      // and that ssContract got back his dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(sideStaking.address));
    });

    it("#14 - user3 removes liquidity with exitswapPoolAmountIn, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      console.log("user BPT Balance", user3BPTbalance.toString());

      const BPTAmountIn = ethers.utils.parseEther("0.2");
      const minDTOut = ethers.utils.parseEther("0.5");
      receipt = await (
        await bPool.connect(user3).exitswapPoolAmountIn(
          erc20Token.address,
          BPTAmountIn, //BPT token IN
          minDTOut // min amount DT out
        )
      ).wait();

      expect(await daiContract.balanceOf(user3.address)).to.equal(
        user3DAIbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      assert(ExitEvent[0].args.caller == user3.address);
      assert(ExitEvent[0].args.tokenOut == erc20Token.address);
      console.log(
        ethers.utils.formatEther(ExitEvent[0].args.tokenAmountOut),
        "dt out"
      );
      assert(ExitEvent[1] == null);

      // we check user3 DT balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );

      // we also check user3 BPT balance before and after
      expect(user3BPTbalance).to.equal(
        (await bPool.balanceOf(user3.address)).add(BPTAmountIn)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });
    it("#15 - user3 removes liquidity with exitswapExternAmountOut, receiving only DAI tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const maxBTPIn = ethers.utils.parseEther("0.5");
      const exactDAIOut = ethers.utils.parseEther("1");

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          daiAddress,
          exactDAIOut, // exact amount DAI out
          maxBTPIn //max BPT token IN
        )
      ).wait();

      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(daiContract.address);
      expect(ExitEvent[1].args.tokenOut).to.equal(erc20Token.address);
      console.log(
        ethers.utils.formatEther(ExitEvent[0].args.tokenAmountOut),
        "dai out"
      );
      console.log(
        ethers.utils.formatEther(ExitEvent[1].args.tokenAmountOut),
        "dt out"
      );
      // we check user3 OCEAN balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DAIbalance)).to.equal(
        await daiContract.balanceOf(user3.address)
      );

      // NOW we check the ssContract BPT balance
      expect(ssContractBPTbalance.sub(BPTEvent[0].args.bptAmount)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );
      // and that we got back some dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(sideStaking.address));
    });

    it("#16 - user3 removes liquidity with exitswapExternAmountOut, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          erc20Token.address,
          ethers.utils.parseEther("0.5"), // exact amount DT out
          web3.utils.toWei("1") //max BPT token IN
        )
      ).wait();

      // DAI BALANCE DOESN"T CHANGE
      expect(await daiContract.balanceOf(user3.address)).to.equal(
        user3DAIbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");
      // BPT balance decrease
      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(erc20Token.address);
      console.log(
        ethers.utils.formatEther(ExitEvent[0].args.tokenAmountOut),
        "dt out"
      );
      assert(ExitEvent[1] == null);
      // we check user3 DT balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("Check for fees", async () => {
      const publishMarketFees = await bPool.getCurrentMarketFees();
      assert(publishMarketFees[0].length === 2);
      assert(publishMarketFees[1].length === 2);
      const opfFees = await bPool.getCurrentOPFFees();
      assert(opfFees[0].length === 2);
      assert(opfFees[1].length === 2);
    });
    it("#17 - we check again ocean and market fees were accounted", async () => {
      expect(await bPool.getOPFFee()).to.equal(1e15);
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );

      // ocean fee actually collected some fees
      assert((await bPool.communityFees(daiAddress)).gt(0) == true);
      assert((await bPool.communityFees(erc20Token.address)).gt(0) == true);
      // market fee actually collected some fees

      assert((await bPool.publishMarketFees(daiAddress)).gt(0) == true);
      assert((await bPool.publishMarketFees(erc20Token.address)).gt(0) == true);
    });

    it("#18 - market collector withdraws fees", async () => {
      // no fees for OPF or MARKET WERE COLLECTED AT THIS POINT
      // user2 has no DT nor DAI
      expect(await erc20Token.balanceOf(user2.address)).to.equal(0);
      expect(await daiContract.balanceOf(user2.address)).to.equal(0);

      await bPool.connect(marketFeeCollector).collectMarketFee();

      assert((await bPool.publishMarketFees(usdcAddress)) == 0);
      assert((await bPool.publishMarketFees(erc20Token.address)) == 0);
    });

    it("#19 - OPF collector withdraws fees", async () => {
      // no fees for OPF WERE COLLECTED AT THIS POINT

      // any user can call collectOPF
      await bPool.connect(user3).collectOPF();

      assert((await bPool.communityFees(daiAddress)) == 0);
      assert((await bPool.communityFees(erc20Token.address)) == 0);
    });
    it("#20 - user3 attemps to add more than available liquidity, check vesting still available", async () => {
      // TODO: add detailed balance check for vesting amount, review !18 decimals (USDC TEST)

      const dtSSContractBalance = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      console.log(
        ethers.utils.formatEther(dtSSContractBalance),
        "dt available"
      );
      const user3DTbalance = await erc20Token.balanceOf(user3.address);

      const ssContractDTBalBefore = await erc20Token.balanceOf(
        sideStaking.address
      );

      console.log(
        ethers.utils.formatEther(ssContractDTBalBefore),
        "dt contract balance"
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      await daiContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("250"));

      const daiAmountIn = web3.utils.toWei("250"); // this requires more DT than available but enough in the contract(vesting)). so it shouldn't deposit any DT
      const minBPTOut = web3.utils.toWei("0.001");
        console.log("daiAMountIn:"+daiAmountIn)
        console.log("dtSSContractBalance:"+dtSSContractBalance)
      assert(daiAmountIn > dtSSContractBalance);
      receipt = await (
        await bPool.connect(user3).joinswapExternAmountIn(
          daiAddress, //token IN
          daiAmountIn, // amount In (dai tokens)
          minBPTOut // BPT token out
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(daiAddress);

      expect(JoinEvent[0].args.tokenAmountIn).to.equal(daiAmountIn);

      // no dt where added
      assert(JoinEvent[1] == null);
      expect(ssContractDTBalBefore).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });
  });

  describe(" Pool with NO Ocean token (USDC 6 decimals) and Publish Market fee 0.1%", async () => {
    const swapFee = 1e15;
    const swapMarketFee = 0;
    const swapPublishMarketFee = 1e15;

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

      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);
    });

    it("#5 - user3 calls deployPool() and check ocean and market fee", async () => {
      // user3 hasn't minted any token so he can call deployPool()

      const ssDTBalance = await erc20Token.balanceOf(sideStaking.address);

      initialUSDCLiquidity = 88000 * 1e6; // 88000 usdc
      basetokenDecimals = 6;
      // approve exact amount
      await usdcContract
        .connect(user3)
        .approve(router.address, initialUSDCLiquidity);

      // we deploy a new pool
      receipt = await (
        await erc20Token.connect(user3).deployPool(
          // sideStaking.address,
          // usdcAddress,
          [
            web3.utils.toWei("1"), // rate
            basetokenDecimals, // basetokenDecimals
            vestingAmount, // DT vesting amount
            2500000, // vested blocks
            initialUSDCLiquidity, // baseToken initial pool liquidity
          ],
          //  user3.address,
          [swapFee, swapPublishMarketFee],
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

      bPool = await ethers.getContractAt("BPool", bPoolAddress);

      assert((await bPool.isFinalized()) == true);

      // PROPER BALANCE HAS BEEN DEPOSITED

      expect(await bPool.getBalance(usdcAddress)).to.equal(
        initialUSDCLiquidity
      );
      expect(await bPool.getBalance(erc20Token.address)).to.equal(
        web3.utils.toWei("88000")
      );

      // check the dt balance available for adding liquidity doesn't account for vesting amount

      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(
        (await erc20Token.balanceOf(sideStaking.address))
      );

      expect(await bPool.getSwapFee()).to.equal(swapFee);
      expect(await bPool.getOPFFee()).to.equal(1e15);
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );

      expect(await bPool.communityFees(usdcAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);
      expect(await bPool.publishMarketFees(usdcAddress)).to.equal(0);
      expect(await bPool.publishMarketFees(erc20Token.address)).to.equal(0);

      // with diff decimals the Pool in slightly different <1e9 in a 18 decimlals token(BPT)
      expect(
        await bPool.calcPoolInSingleOut(
          erc20Token.address,
          web3.utils.toWei("10")
        )
      ).to.be.closeTo(
        await bPool.calcPoolInSingleOut(usdcAddress, 10 * 1e6),
        1e9
      );

      // same pool out for same amount In
      expect(
        await bPool.calcPoolOutSingleIn(
          erc20Token.address,
          web3.utils.toWei("10")
        )
      ).to.equal(await bPool.calcPoolOutSingleIn(usdcAddress, 10 * 1e6));

      // equivalent token out for pool amount in
      expect(
        (
          await bPool.calcSingleOutPoolIn(
            erc20Token.address,
            web3.utils.toWei("10")
          )
        ).div(1e12)
      ).to.equal(
        await bPool.calcSingleOutPoolIn(usdcAddress, web3.utils.toWei("10"))
      );

      //  almost equal token in (1 unit difference) for exact pool amount out
      expect(
        (
          await bPool.calcSingleInPoolOut(
            erc20Token.address,
            web3.utils.toWei("10")
          )
        ).div(1e12)
      ).to.closeTo(
        await bPool.calcSingleInPoolOut(usdcAddress, web3.utils.toWei("10")),
        1
      );
      // we check swap math
      expect(
        (
          await bPool.getAmountOutExactIn(
            usdcAddress,
            erc20Token.address,
            1e6,
            swapMarketFee
          )
        ).div(1e12)
      ).to.be.closeTo(
        await bPool.getAmountOutExactIn(
          erc20Token.address,
          usdcAddress,
          web3.utils.toWei("1"),
          swapMarketFee
        ),
        1
      );
      expect(
        (
          await bPool.getAmountInExactOut(
            erc20Token.address,
            usdcAddress,
            1e6,
            swapMarketFee
          )
        ).div(1e12)
      ).to.be.closeTo(
        await bPool.getAmountInExactOut(
          usdcAddress,
          erc20Token.address,
          web3.utils.toWei("1"),
          swapMarketFee
        ),
        1
      );
    });

    it("#6 - user4 buys some DT - exactAmountIn", async () => {
      // pool has initial ocean tokens at the beginning
      assert(
        (await usdcContract.balanceOf(bPoolAddress)) == initialUSDCLiquidity // 88000 USDC
      );

      // we approve the pool to move usdc tokens
      await usdcContract
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000"));

      // user4 has no DT before swap
      assert((await erc20Token.balanceOf(user4.address)) == 0);

      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4USDCBalance = await usdcContract.balanceOf(user4.address);
      const dtMarketFeeBal = await bPool.publishMarketFees(erc20Token.address);
      const usdcMarketFeeBal = await bPool.publishMarketFees(usdcAddress);
      const dtOPFFeeBal = await bPool.communityFees(erc20Token.address);
      const usdcOPFFeeBal = await bPool.communityFees(usdcAddress);

      const usdcAmountIn = 1e7; // 10 usdc
      // we prepare the arrays, user5 is going to receive the dynamic market fee

      minAmountOut = web3.utils.toWei("1");
      maxPrice = web3.utils.toWei("5");
      marketFee = 0;
      const tokenInOutMarket = [usdcAddress, erc20Token.address, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [
        usdcAmountIn,
        minAmountOut,
        maxPrice,
        marketFee,
      ]; // [exactAmountIn,minAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // marketFeeAmount and oceanFeeAmont have been calculated properly - ocean fee is 0.1% (set by the contracts)
      expect(1e4).to.equal(args.marketFeeAmount);
      expect(1e4).to.equal(args.oceanFeeAmount);
      expect(args.oceanFeeAmount).to.equal(args.swapFeeAmount);
      expect(1e4).to.equal(args.swapFeeAmount);

      // publishMarketFees and opfFees accounting increased as expected , in USDC

      console.log(usdcAddress);
      console.log(args.tokenFees);
      expect(usdcAddress).to.equal(args.tokenFees);
      expect(usdcMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.publishMarketFees(args.tokenFees)
      );
      expect(usdcOPFFeeBal.add(args.oceanFeeAmount)).to.equal(
        await bPool.communityFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      // CHECK SWAP BALANCES

      // user 4 usdc balance decresead properly
      expect(
        (await usdcContract.balanceOf(user4.address)).add(
          swapArgs.tokenAmountIn
        )
      ).to.equal(user4USDCBalance);
      // user 4 DT balance increased properly
      expect(user4DTbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await erc20Token.balanceOf(user4.address)
      );

      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1000)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );

      const spotPriceDT = await bPool.getSpotPrice(
        usdcAddress,
        erc20Token.address,
        swapMarketFee
      );
      console.log("spotprice DT", spotPriceDT.toString());
      const spotPriceUSDC = await bPool.getSpotPrice(
        erc20Token.address,
        usdcAddress,
        swapMarketFee
      );
      console.log("spotprice USDC", spotPriceUSDC.toString());

      console.log(swapArgs.tokenAmountIn.toString(), "usdc amount in");
      console.log(
        ethers.utils.formatEther(swapArgs.tokenAmountOut.toString()),
        "dt amount out"
      );
      const tokenBalanceUSDC = await bPool.getBalance(usdcAddress);
      const tokenBalanceDT = await bPool.getBalance(erc20Token.address);
      console.log(tokenBalanceUSDC.toString(), "after swap usdc balance");
      console.log(
        ethers.utils.formatEther(tokenBalanceDT),
        "after swap dt balance"
      );
    });

    it("#7 - user4 buys some DT  - exactAmountOut", async () => {
      // we already approved pool to withdraw Ocean tokens

      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4USDCBalance = await usdcContract.balanceOf(user4.address);
      const dtMarketFeeBal = await bPool.publishMarketFees(erc20Token.address);
      const usdcMarketFeeBal = await bPool.publishMarketFees(usdcAddress);
      const dtOPFFeeBal = await bPool.communityFees(erc20Token.address);
      const usdcOPFFeeBal = await bPool.communityFees(usdcAddress);

      maxAmountIn = 1e8;
      amountOut = web3.utils.toWei("10");
      maxPrice = web3.utils.toWei("10");
      marketFee = 0;
      const tokenInOutMarket = [usdcAddress, erc20Token.address, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [maxAmountIn, amountOut, maxPrice, marketFee]; // [maxAmountIn,exactAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // publishMarketFees and opfFees accounting increased as expected , in usdc
      expect(usdcAddress).to.equal(args.tokenFees);
      expect(usdcMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.publishMarketFees(args.tokenFees)
      );
      expect(usdcOPFFeeBal.add(args.oceanFeeAmount)).to.equal(
        await bPool.communityFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;
      // marketFeeAmount and oceanFeeAmont have been calculated properly - ocean fee is 0.1% (set by the contracts)
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1000)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );

      // CHECK SWAP BALANCES

      // user 4 USDC balance decresead properly
      expect(
        (await usdcContract.balanceOf(user4.address)).add(
          swapArgs.tokenAmountIn
        )
      ).to.equal(user4USDCBalance);
      // user 4 DT balance increased properly
      expect(user4DTbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await erc20Token.balanceOf(user4.address)
      );
      const spotPriceDT = await bPool.getSpotPrice(
        usdcAddress,
        erc20Token.address,
        swapMarketFee
      );
      console.log("spotprice DT", spotPriceDT.toString());
      const spotPriceUSDC = await bPool.getSpotPrice(
        erc20Token.address,
        usdcAddress,
        swapMarketFee
      );
      console.log("spotprice USDC", spotPriceUSDC.toString());

      console.log(swapArgs.tokenAmountIn.toString(), "usdc");
      console.log(
        ethers.utils.formatEther(swapArgs.tokenAmountOut.toString()),
        "dt"
      );
    });

    it("#8 - user4 swaps some DT back to USDC swapExactAmountIn", async () => {
      assert((await bPool.isFinalized()) == true);

      await erc20Token
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4USDCbalance = await usdcContract.balanceOf(user4.address);

      // we prepare the arrays, user5 is going to receive the dynamic market fee
      amountIn = web3.utils.toWei("10");
      (minAmountOut = 1e6), // minAmountOut 1 USDC
        (maxPrice = web3.utils.toWei("10000000000000")); // maxPrice;
      marketFee = 0;
      const tokenInOutMarket = [erc20Token.address, usdcAddress, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [amountIn, minAmountOut, maxPrice, marketFee]; // [exactAmountIn,minAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      expect(
        (await erc20Token.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DTbalance);

      expect(await usdcContract.balanceOf(user4.address)).to.equal(
        user4USDCbalance.add(swapArgs.tokenAmountOut)
      );

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // WE CHECK FEES WERE CALCULATED PROPERLY
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1000)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );

      console.log(
        ethers.utils.formatEther(swapArgs.tokenAmountIn.toString()),
        "dt"
      );
      console.log(swapArgs.tokenAmountOut.toString(), "usdc");
    });

    it("#9 - user4 swaps some DT back to USDC swapExactAmountOut", async () => {
      assert((await bPool.isFinalized()) == true);

      // await erc20Token
      //   .connect(user4)
      //   .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4USDCbalance = await usdcContract.balanceOf(user4.address);

      const maxAmountIn = web3.utils.toWei("10");
      const amountOut = 1e6;
      const maxPrice = web3.utils.toWei("10000000000000");
      // we prepare the arrays, user5 is going to receive the dynamic market fee
      marketFee = 0;
      const tokenInOutMarket = [erc20Token.address, usdcAddress, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [maxAmountIn, amountOut, maxPrice, marketFee]; // [maxAmountIn,exactAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      expect(
        (await erc20Token.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DTbalance);

      expect(await usdcContract.balanceOf(user4.address)).to.equal(
        user4USDCbalance.add(swapArgs.tokenAmountOut)
      );

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;
      console.log(swapArgs.tokenAmountIn.toString(), "dt in");
      console.log(swapArgs.tokenAmountOut.toString(), "usdc out");
      // WE CHECK FEES WERE CALCULATED PROPERLY
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1000)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );
    });

    it("#10 - user4 adds more liquidity with joinPool() (adding both tokens)", async () => {
      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4USDCbalance = await usdcContract.balanceOf(user4.address);
      const user4BPTbalance = await bPool.balanceOf(user4.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      const dtBalanceBeforeJoin = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      const BPTAmountOut = web3.utils.toWei("0.01");
      const maxAmountsIn = [
        web3.utils.toWei("50"), // Amounts IN
        web3.utils.toWei("50"), // Amounts IN
      ];
      await usdcContract
        .connect(user4)
        .approve(bPool.address, web3.utils.toWei("50"));

      await erc20Token
        .connect(user4)
        .approve(bPool.address, web3.utils.toWei("50"));

      receipt = await (
        await bPool.connect(user4).joinPool(
          BPTAmountOut, // exactBPT OUT token OUT
          maxAmountsIn
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");
      expect(JoinEvent[0].args.tokenIn).to.equal(erc20Token.address);
      expect(JoinEvent[1].args.tokenIn).to.equal(usdcAddress);
      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeJoin);
      console.log(
        ethers.utils.formatEther(JoinEvent[0].args.tokenAmountIn),
        "dt in"
      );
      console.log(
        new BN(JoinEvent[1].args.tokenAmountIn / 1e6).toString(),
        "usdc in"
      );
      // we check all balances
      expect(
        JoinEvent[0].args.tokenAmountIn.add(
          await erc20Token.balanceOf(user4.address)
        )
      ).to.equal(user4DTbalance);
      expect(
        JoinEvent[1].args.tokenAmountIn.add(
          await usdcContract.balanceOf(user4.address)
        )
      ).to.equal(user4USDCbalance);

      expect(user4BPTbalance.add(BPTAmountOut)).to.equal(
        await bPool.balanceOf(user4.address)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#11 - user3 adds more liquidity with joinswapExternAmountIn (only USDC)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      //const user3Oceanbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      const dtBalanceBeforeJoin = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      await usdcContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const usdcAmountIn = 1e8; // 100 USDC
      const minBPTOut = web3.utils.toWei("0.01");

      receipt = await (
        await bPool.connect(user3).joinswapExternAmountIn(
          usdcAddress, //token IN
          usdcAmountIn, // amount In (dai tokens)
          minBPTOut // BPT token out
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(usdcAddress);

      expect(JoinEvent[0].args.tokenAmountIn).to.equal(usdcAmountIn);

      expect(JoinEvent[1].args.tokenIn).to.equal(erc20Token.address);
      console.log(
        new BN(JoinEvent[0].args.tokenAmountIn / 1e6).toString(),
        "usdc in"
      );
      console.log(
        ethers.utils.formatEther(JoinEvent[1].args.tokenAmountIn),
        "dt in"
      );

      const sideStakingAmountIn = ssContractDTbalance.sub(
        await erc20Token.balanceOf(sideStaking.address)
      );
      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeJoin.sub(JoinEvent[1].args.tokenAmountIn));
      expect(JoinEvent[1].args.tokenAmountIn).to.equal(sideStakingAmountIn);

      // dt amount is slightly higher because we ask for the same amount of BPT but the pool is bigger
      assert(sideStakingAmountIn.gt(JoinEvent[0].args.tokenAmountIn) == true);

      // we check ssContract actually moved DT and got back BPT
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance.sub(sideStakingAmountIn));

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(BPTEvent[0].args.bptAmount.add(ssContractBPTbalance)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      // no dt token where taken from user3
      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );
    });

    it("#12 - user3 adds more liquidity with joinswapPoolAmountOut (only USDC)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      const dtBalanceBeforeJoin = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      await usdcContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const BPTAmountOut = ethers.utils.parseEther("0.01");
      const maxUSDCIn = 1e8;

      receipt = await (
        await bPool.connect(user3).joinswapPoolAmountOut(
          usdcAddress, //token IN
          BPTAmountOut, // exact lp token out
          maxUSDCIn // max usdc tokens IN
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(usdcAddress);
      expect(JoinEvent[1].args.tokenIn).to.equal(erc20Token.address);
      console.log(
        new BN(JoinEvent[0].args.tokenAmountIn / 1e6).toString(),
        "usdc in"
      );
      console.log(
        ethers.utils.formatEther(JoinEvent[1].args.tokenAmountIn),
        "dt in"
      );
      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeJoin.sub(JoinEvent[1].args.tokenAmountIn));
      // check balances (ocean and bpt)
      expect(
        JoinEvent[0].args.tokenAmountIn.add(
          await usdcContract.balanceOf(user3.address)
        )
      ).to.equal(user3USDCbalance);

      expect(BPTAmountOut.add(user3BPTbalance)).to.equal(
        await bPool.balanceOf(user3.address)
      );

      // we check ssContract received the same amount of BPT
      expect(ssContractBPTbalance.add(BPTAmountOut)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      // and also that DT balance lowered in the ssContract
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );

      // no token where taken from user3.
      expect(user3DTbalance).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
    });
    it("#13 - user3 removes liquidity with ExitPool, receiving both tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const dtBalanceBeforeExit = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      const BPTAmountIn = ethers.utils.parseEther("0.1");
      const minAmountOut = [
        // min amount out for DT and USDC
        web3.utils.toWei("1"),
        1e6,
      ];
      receipt = await (
        await bPool.connect(user3).exitPool(
          BPTAmountIn, //exact BPT token IN
          minAmountOut
        )
      ).wait();

      const ExitEvents = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check all balances (DT,USDC,BPT)
      expect(ExitEvents[0].args.tokenOut).to.equal(erc20Token.address);
      expect(ExitEvents[1].args.tokenOut).to.equal(usdcAddress);
      console.log(
        new BN(ExitEvents[1].args.tokenAmountOut / 1e6).toString(),
        "usdc out"
      );
      console.log(
        ethers.utils.formatEther(ExitEvents[0].args.tokenAmountOut),
        "dt out"
      );
      expect(ExitEvents[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
      expect(ExitEvents[1].args.tokenAmountOut.add(user3USDCbalance)).to.equal(
        await usdcContract.balanceOf(user3.address)
      );
      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeExit);
      expect((await bPool.balanceOf(user3.address)).add(BPTAmountIn)).to.equal(
        user3BPTbalance
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#14 - user3 removes liquidity with exitswapPoolAmountIn, receiving only USDC tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required
      const dtBalanceBeforeExit = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const BPTAmountIn = ethers.utils.parseEther("0.1");
      const minUSDCOut = 1e6; //1 USDC

      receipt = await (
        await bPool.connect(user3).exitswapPoolAmountIn(
          usdcAddress,
          BPTAmountIn, //BPT token IN
          minUSDCOut // min amount USDC out
        )
      ).wait();

      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(usdcContract.address);
      expect(ExitEvent[1].args.tokenOut).to.equal(erc20Token.address);
      console.log(
        new BN(ExitEvent[0].args.tokenAmountOut / 1e6).toString(),
        "usdc out"
      );
      console.log(
        ethers.utils.formatEther(ExitEvent[1].args.tokenAmountOut),
        "dt out"
      );
      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeExit.add(ExitEvent[1].args.tokenAmountOut));
      // we check user3 OCEAN balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3USDCbalance)).to.equal(
        await usdcContract.balanceOf(user3.address)
      );
      console.log(ExitEvent[0].args.tokenAmountOut.toString(), "usdcout");
      console.log(ExitEvent[1].args.tokenAmountOut.toString(), "dtout");
      // we also check user3 BPT balance before and after
      expect(user3BPTbalance).to.equal(
        (await bPool.balanceOf(user3.address)).add(BPTAmountIn)
      );

      // NOW we check the ssContract BPT balance
      expect(ssContractBPTbalance).to.equal(
        (await bPool.balanceOf(sideStaking.address)).add(BPTAmountIn)
      );
      // and that ssContract got back his dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(sideStaking.address));
    });

    it("#15 - user3 removes liquidity with exitswapPoolAmountIn, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required
      const dtBalanceBeforeExit = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      const user3BPTbalance = await bPool.balanceOf(user3.address);

      const BPTAmountIn = ethers.utils.parseEther("0.01");
      const minDTOut = ethers.utils.parseEther("0.5");
      receipt = await (
        await bPool.connect(user3).exitswapPoolAmountIn(
          erc20Token.address,
          BPTAmountIn, //BPT token IN
          minDTOut // min amount DT out
        )
      ).wait();

      expect(await usdcContract.balanceOf(user3.address)).to.equal(
        user3USDCbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      assert(ExitEvent[0].args.caller == user3.address);
      assert(ExitEvent[0].args.tokenOut == erc20Token.address);

      console.log(
        ethers.utils.formatEther(ExitEvent[0].args.tokenAmountOut),
        "dt out"
      );

      assert(ExitEvent[1] == null);
      // we check user3 DT balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeExit);
      // we also check user3 BPT balance before and after
      expect(user3BPTbalance).to.equal(
        (await bPool.balanceOf(user3.address)).add(BPTAmountIn)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });
    it("#16 - user3 removes liquidity with exitswapExternAmountOut, receiving only USDC tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required
      const dtBalanceBeforeExit = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const maxBTPIn = ethers.utils.parseEther("0.5");
      const exactUSDCOut = 1e6; // 1 usdc

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          usdcAddress,
          exactUSDCOut, // exact amount USDC out
          maxBTPIn //max BPT token IN
        )
      ).wait();

      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(usdcContract.address);
      expect(ExitEvent[1].args.tokenOut).to.equal(erc20Token.address);
      console.log(
        new BN(ExitEvent[0].args.tokenAmountOut / 1e6).toString(),
        "usdc out"
      );
      console.log(
        ethers.utils.formatEther(ExitEvent[1].args.tokenAmountOut),
        "dt out"
      );
      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeExit.add(ExitEvent[1].args.tokenAmountOut));
      // we check user3 OCEAN balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3USDCbalance)).to.equal(
        await usdcContract.balanceOf(user3.address)
      );

      // NOW we check the ssContract BPT balance
      expect(ssContractBPTbalance.sub(BPTEvent[0].args.bptAmount)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );
      // and that we got back some dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(sideStaking.address));
    });

    it("#17 - user3 removes liquidity with exitswapExternAmountOut, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      // NO APPROVAL FOR BPT is required
      const dtBalanceBeforeExit = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      const user3BPTbalance = await bPool.balanceOf(user3.address);

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          erc20Token.address,
          ethers.utils.parseEther("0.5"), //max BPT token IN
          web3.utils.toWei("1") // exact amount DT out
        )
      ).wait();

      // USDC BALANCE DOESN"T CHANGE
      expect(await usdcContract.balanceOf(user3.address)).to.equal(
        user3USDCbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");
      // BPT balance decrease
      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(erc20Token.address);

      console.log(
        ethers.utils.formatEther(ExitEvent[0].args.tokenAmountOut),
        "dt out"
      );
      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(dtBalanceBeforeExit);
      assert(ExitEvent[1] == null);
      // we check user3 DT balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#18 - we check again ocean and market fees were accounted", async () => {
      expect(await bPool.getOPFFee()).to.equal(1e15);
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );

      // ocean fee actually collected some fees
      assert((await bPool.communityFees(usdcAddress)).gt(0) == true);
      assert((await bPool.communityFees(erc20Token.address)).gt(0) == true);
      // market fee actually collected some fees

      assert((await bPool.publishMarketFees(usdcAddress)).gt(0) == true);
      assert((await bPool.publishMarketFees(erc20Token.address)).gt(0) == true);
    });

    it("#19 - market collector withdraws fees", async () => {
      // no fees for OPF or MARKET WERE COLLECTED AT THIS POINT
      // user2 has no DT nor USDC
      expect(await erc20Token.balanceOf(user2.address)).to.equal(0);
      expect(await usdcContract.balanceOf(user2.address)).to.equal(0);

      await bPool.connect(marketFeeCollector).collectMarketFee();

      assert((await bPool.publishMarketFees(usdcAddress)) == 0);
      assert((await bPool.publishMarketFees(erc20Token.address)) == 0);
    });

    it("#20 - OPF collector withdraws fees", async () => {
      // no fees for OPF WERE COLLECTED AT THIS POINT

      // any user can call collectOPF
      await bPool.connect(user3).collectOPF();

      assert((await bPool.communityFees(usdcAddress)) == 0);
      assert((await bPool.communityFees(erc20Token.address)) == 0);
    });

    it("#21 - add all DT tokens as liquidity, check vesting still available", async () => {
      const dtSSContractBalance = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      console.log(dtSSContractBalance.toString());
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      //const user3Oceanbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      await usdcContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const usdcAmountIn = 25000 * 1e6; // 25000 USDC  amount big enough so that the staking contract won't stake
      const minBPTOut = web3.utils.toWei("0.001");

      receipt = await (
        await bPool.connect(user3).joinswapExternAmountIn(
          usdcAddress, //token IN
          usdcAmountIn, // amount In (usdc tokens)
          minBPTOut // BPT token out
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(usdcAddress);

      expect(JoinEvent[0].args.tokenAmountIn).to.equal(usdcAmountIn);
      console.log(
        new BN(JoinEvent[0].args.tokenAmountIn / 1e6).toString(),
        "usdc In"
      );

      // no second join event has been emitted because contract hasn't staked
      assert(JoinEvent[1] == null);

      // no dt added from the staking contract
      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      // no dt token where taken from user3
      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );

      const dtSSContractBalanceAfter = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      console.log(dtSSContractBalanceAfter.toString());
    });
  });

  describe(" Flexible OPF Fee test, Pool with NO ocean token (USDC 6 decimals) and Publish Market fee 0.1%", async () => {
    const swapFee = 1e15;
    const swapMarketFee = 0;
    const swapPublishMarketFee = 1e15;

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

      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);
    });

    it("#5 - user3 calls deployPool() and check ocean and market fee", async () => {
      // user3 hasn't minted any token so he can call deployPool()

      const ssDTBalance = await erc20Token.balanceOf(sideStaking.address);

      initialUSDCLiquidity = 88000 * 1e6; // 88000 usdc
      basetokenDecimals = 6;
      // approve exact amount
      await usdcContract
        .connect(user3)
        .approve(router.address, initialUSDCLiquidity);

      // we deploy a new pool
      receipt = await (
        await erc20Token.connect(user3).deployPool(
          // sideStaking.address,
          // usdcAddress,
          [
            web3.utils.toWei("1"), // rate
            basetokenDecimals, // basetokenDecimals
            vestingAmount, // DT vesting amount
            2500000, // vested blocks
            initialUSDCLiquidity, // baseToken initial pool liquidity
          ],
          // user3.address,
          [swapFee, swapPublishMarketFee],
          // marketFeeCollector.address,
          // user3.address// publisher address (vested token)
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

      bPool = await ethers.getContractAt("BPool", bPoolAddress);

      assert((await bPool.isFinalized()) == true);

      // PROPER BALANCE HAS BEEN DEPOSITED

      expect(await bPool.getBalance(usdcAddress)).to.equal(
        initialUSDCLiquidity
      );
      expect(await bPool.getBalance(erc20Token.address)).to.equal(
        web3.utils.toWei("88000")
      );

      // check the dt balance available for adding liquidity doesn't account for vesting amount

      expect(
        await sideStaking.getDataTokenBalance(erc20Token.address)
      ).to.equal(
        (await erc20Token.balanceOf(sideStaking.address))
      );

      expect(await bPool.getSwapFee()).to.equal(swapFee);
      expect(await bPool.getOPFFee()).to.equal(1e15);
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );

      expect(await bPool.communityFees(usdcAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);
      expect(await bPool.publishMarketFees(usdcAddress)).to.equal(0);
      expect(await bPool.publishMarketFees(erc20Token.address)).to.equal(0);

      // we check swap math
      expect(
        (
          await bPool.getAmountOutExactIn(
            usdcAddress,
            erc20Token.address,
            1e6,
            swapMarketFee
          )
        ).div(1e12)
      ).to.be.closeTo(
        await bPool.getAmountOutExactIn(
          erc20Token.address,
          usdcAddress,
          web3.utils.toWei("1"),
          swapMarketFee
        ),
        1
      );
      expect(
        (
          await bPool.getAmountInExactOut(
            erc20Token.address,
            usdcAddress,
            1e6,
            swapMarketFee
          )
        ).div(1e12)
      ).to.be.closeTo(
        await bPool.getAmountInExactOut(
          usdcAddress,
          erc20Token.address,
          web3.utils.toWei("1"),
          swapMarketFee
        ),
        1
      );
    });

    it("#6 - user4 buys some DT - exactAmountIn", async () => {
      // pool has initial ocean tokens at the beginning
      assert(
        (await usdcContract.balanceOf(bPoolAddress)) == initialUSDCLiquidity // 88000 USDC
      );

      // we approve the pool to move usdc tokens
      await usdcContract
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000"));

      // user4 has no DT before swap
      assert((await erc20Token.balanceOf(user4.address)) == 0);

      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4USDCBalance = await usdcContract.balanceOf(user4.address);
      const dtMarketFeeBal = await bPool.publishMarketFees(erc20Token.address);
      const usdcMarketFeeBal = await bPool.publishMarketFees(usdcAddress);
      const dtOPFFeeBal = await bPool.communityFees(erc20Token.address);
      const usdcOPFFeeBal = await bPool.communityFees(usdcAddress);

      const usdcAmountIn = 1e7; // 10 usdc
      // we prepare the arrays, user5 is going to receive the dynamic market fee

      minAmountOut = web3.utils.toWei("1");
      maxPrice = web3.utils.toWei("5");
      marketFee = 0;
      const tokenInOutMarket = [usdcAddress, erc20Token.address, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [
        usdcAmountIn,
        minAmountOut,
        maxPrice,
        marketFee,
      ]; // [exactAmountIn,minAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // marketFeeAmount and oceanFeeAmont have been calculated properly - ocean fee is 0.1% (set by the contracts)
      expect(1e4).to.equal(args.marketFeeAmount);
      expect(1e4).to.equal(args.oceanFeeAmount);
      expect(args.oceanFeeAmount).to.equal(args.swapFeeAmount);
      expect(1e4).to.equal(args.swapFeeAmount);

      // publishMarketFees and opfFees accounting increased as expected , in USDC
      console.log(usdcAddress);
      console.log(args.tokenFees);
      expect(usdcAddress).to.equal(args.tokenFees);
      expect(usdcMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.publishMarketFees(args.tokenFees)
      );
      expect(usdcOPFFeeBal.add(args.oceanFeeAmount)).to.equal(
        await bPool.communityFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      // CHECK SWAP BALANCES

      // user 4 usdc balance decresead properly
      expect(
        (await usdcContract.balanceOf(user4.address)).add(
          swapArgs.tokenAmountIn
        )
      ).to.equal(user4USDCBalance);
      // user 4 DT balance increased properly
      expect(user4DTbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await erc20Token.balanceOf(user4.address)
      );

      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1000)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );

      const spotPriceDT = await bPool.getSpotPrice(
        usdcAddress,
        erc20Token.address,
        swapMarketFee
      );
      console.log("spotprice DT", spotPriceDT.toString());
      const spotPriceUSDC = await bPool.getSpotPrice(
        erc20Token.address,
        usdcAddress,
        swapMarketFee
      );
      console.log("spotprice USDC", spotPriceUSDC.toString());

      console.log(swapArgs.tokenAmountIn.toString(), "usdc amount in");
      console.log(
        ethers.utils.formatEther(swapArgs.tokenAmountOut.toString()),
        "dt amount out"
      );
      const tokenBalanceUSDC = await bPool.getBalance(usdcAddress);
      const tokenBalanceDT = await bPool.getBalance(erc20Token.address);
      console.log(tokenBalanceUSDC.toString(), "after swap usdc balance");
      console.log(
        ethers.utils.formatEther(tokenBalanceDT),
        "after swap dt balance"
      );
    });

    it("#7 - opfFee is updated to 1% (1e16)", async () => {
      // we already approved pool to withdraw Ocean tokens

      await router.updateOPFFee("0", web3.utils.toWei("0.01"));
      expect(await bPool.getSwapFee()).to.equal(swapFee);
      expect(await bPool.getOPFFee()).to.equal(web3.utils.toWei("0.01"));
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );
    });

    it("#8 - user4 buys some DT  - exactAmountOut", async () => {
      // we already approved pool to withdraw Ocean tokens

      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4USDCBalance = await usdcContract.balanceOf(user4.address);
      const dtMarketFeeBal = await bPool.publishMarketFees(erc20Token.address);
      const usdcMarketFeeBal = await bPool.publishMarketFees(usdcAddress);
      const dtOPFFeeBal = await bPool.communityFees(erc20Token.address);
      const usdcOPFFeeBal = await bPool.communityFees(usdcAddress);

      maxAmountIn = 1e8;
      amountOut = web3.utils.toWei("10");
      maxPrice = web3.utils.toWei("10");
      marketFee = 0;
      const tokenInOutMarket = [usdcAddress, erc20Token.address, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [maxAmountIn, amountOut, maxPrice, marketFee]; // [maxAmountIn,exactAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // publishMarketFees and opfFees accounting increased as expected , in usdc
      expect(usdcAddress).to.equal(args.tokenFees);
      expect(usdcMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.publishMarketFees(args.tokenFees)
      );
      expect(usdcOPFFeeBal.add(args.oceanFeeAmount)).to.equal(
        await bPool.communityFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;
      // marketFeeAmount and oceanFeeAmont have been calculated properly - ocean fee is 1% (set by the contracts)
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);

      expect(swapArgs.tokenAmountIn.div(100)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );

      // CHECK SWAP BALANCES

      // user 4 USDC balance decresead properly
      expect(
        (await usdcContract.balanceOf(user4.address)).add(
          swapArgs.tokenAmountIn
        )
      ).to.equal(user4USDCBalance);
      // user 4 DT balance increased properly
      expect(user4DTbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await erc20Token.balanceOf(user4.address)
      );
      const spotPriceDT = await bPool.getSpotPrice(
        usdcAddress,
        erc20Token.address,
        swapMarketFee
      );
      console.log("spotprice DT", spotPriceDT.toString());
      const spotPriceUSDC = await bPool.getSpotPrice(
        erc20Token.address,
        usdcAddress,
        swapMarketFee
      );
      console.log("spotprice USDC", spotPriceUSDC.toString());

      console.log(swapArgs.tokenAmountIn.toString(), "usdc");
      console.log(
        ethers.utils.formatEther(swapArgs.tokenAmountOut.toString()),
        "dt"
      );
    });

    it("#9 - user4 swaps some DT back to USDC swapExactAmountIn", async () => {
      assert((await bPool.isFinalized()) == true);

      await erc20Token
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4USDCbalance = await usdcContract.balanceOf(user4.address);

      // we prepare the arrays, user5 is going to receive the dynamic market fee
      amountIn = web3.utils.toWei("10");
      (minAmountOut = 1e6), // minAmountOut 1 USDC
        (maxPrice = web3.utils.toWei("10000000000000")); // maxPrice;
      marketFee = 0;
      const tokenInOutMarket = [erc20Token.address, usdcAddress, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [amountIn, minAmountOut, maxPrice, marketFee]; // [exactAmountIn,minAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      expect(
        (await erc20Token.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DTbalance);

      expect(await usdcContract.balanceOf(user4.address)).to.equal(
        user4USDCbalance.add(swapArgs.tokenAmountOut)
      );

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // WE CHECK FEES WERE CALCULATED PROPERLY
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(100)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );

      console.log(
        ethers.utils.formatEther(swapArgs.tokenAmountIn.toString()),
        "dt"
      );
      console.log(swapArgs.tokenAmountOut.toString(), "usdc");
    });

    it("#10 - USDC token is added as ocean tokens list, now opfFee will be ZERO", async () => {
      // we already approved pool to withdraw Ocean tokens

      await router.addOceanToken(usdcContract.address);
      expect(await bPool.getSwapFee()).to.equal(swapFee);
      expect(await bPool.getOPFFee()).to.equal(0);
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );
    });

    it("#11 - user4 swaps some DT back to USDC swapExactAmountOut", async () => {
      assert((await bPool.isFinalized()) == true);

      // await erc20Token
      //   .connect(user4)
      //   .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4USDCbalance = await usdcContract.balanceOf(user4.address);

      const maxAmountIn = web3.utils.toWei("10");
      const amountOut = 1e6;
      const maxPrice = web3.utils.toWei("10000000000000");
      // we prepare the arrays, user5 is going to receive the dynamic market fee
      marketFee = 0;
      const tokenInOutMarket = [erc20Token.address, usdcAddress, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [maxAmountIn, amountOut, maxPrice, marketFee]; // [maxAmountIn,exactAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      expect(
        (await erc20Token.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DTbalance);

      expect(await usdcContract.balanceOf(user4.address)).to.equal(
        user4USDCbalance.add(swapArgs.tokenAmountOut)
      );

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;
      console.log(swapArgs.tokenAmountIn.toString(), "dt in");
      console.log(swapArgs.tokenAmountOut.toString(), "usdc out");
      // WE CHECK FEES WERE CALCULATED PROPERLY
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);

      // oceanFee is ZERO because now USDC is in the mapping
      expect(args.oceanFeeAmount).to.equal(0);

      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );
    });

    it("#12 - user4 adds more liquidity with joinPool() (adding both tokens)", async () => {
      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4USDCbalance = await usdcContract.balanceOf(user4.address);
      const user4BPTbalance = await bPool.balanceOf(user4.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      const BPTAmountOut = web3.utils.toWei("0.001");
      const maxAmountsIn = [
        web3.utils.toWei("50"), // Amounts IN
        web3.utils.toWei("50"), // Amounts IN
      ];
      await usdcContract
        .connect(user4)
        .approve(bPool.address, web3.utils.toWei("50"));

      await erc20Token
        .connect(user4)
        .approve(bPool.address, web3.utils.toWei("50"));

      receipt = await (
        await bPool.connect(user4).joinPool(
          BPTAmountOut, // exactBPT OUT token OUT
          maxAmountsIn
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");
      expect(JoinEvent[0].args.tokenIn).to.equal(erc20Token.address);
      expect(JoinEvent[1].args.tokenIn).to.equal(usdcAddress);

      // we check all balances
      expect(
        JoinEvent[0].args.tokenAmountIn.add(
          await erc20Token.balanceOf(user4.address)
        )
      ).to.equal(user4DTbalance);
      expect(
        JoinEvent[1].args.tokenAmountIn.add(
          await usdcContract.balanceOf(user4.address)
        )
      ).to.equal(user4USDCbalance);

      expect(user4BPTbalance.add(BPTAmountOut)).to.equal(
        await bPool.balanceOf(user4.address)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#13 - user3 adds more liquidity with joinswapExternAmountIn (only USDC)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      //const user3Oceanbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      await usdcContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const usdcAmountIn = 1e8; // 100 USDC
      const minBPTOut = web3.utils.toWei("0.01");

      receipt = await (
        await bPool.connect(user3).joinswapExternAmountIn(
          usdcAddress, //token IN
          usdcAmountIn, // amount In (dai tokens)
          minBPTOut // BPT token out
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(usdcAddress);

      expect(JoinEvent[0].args.tokenAmountIn).to.equal(usdcAmountIn);

      expect(JoinEvent[1].args.tokenIn).to.equal(erc20Token.address);

      const sideStakingAmountIn = ssContractDTbalance.sub(
        await erc20Token.balanceOf(sideStaking.address)
      );

      expect(JoinEvent[1].args.tokenAmountIn).to.equal(sideStakingAmountIn);

      // dt amount is slightly higher because we ask for the same amount of BPT but the pool is bigger
      assert(sideStakingAmountIn.gt(JoinEvent[0].args.tokenAmountIn) == true);

      // we check ssContract actually moved DT and got back BPT
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance.sub(sideStakingAmountIn));

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(BPTEvent[0].args.bptAmount.add(ssContractBPTbalance)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      // no dt token where taken from user3
      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );
    });

    it("#14 - user3 adds more liquidity with joinswapPoolAmountOut (only USDC)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      await usdcContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const BPTAmountOut = ethers.utils.parseEther("0.01");
      const maxUSDCIn = 1e8;

      receipt = await (
        await bPool.connect(user3).joinswapPoolAmountOut(
          usdcAddress, //token IN
          BPTAmountOut, // exact lp token out
          maxUSDCIn // max usdc tokens IN
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(usdcAddress);
      expect(JoinEvent[1].args.tokenIn).to.equal(erc20Token.address);

      // check balances (ocean and bpt)
      expect(
        JoinEvent[0].args.tokenAmountIn.add(
          await usdcContract.balanceOf(user3.address)
        )
      ).to.equal(user3USDCbalance);

      expect(BPTAmountOut.add(user3BPTbalance)).to.equal(
        await bPool.balanceOf(user3.address)
      );

      // we check ssContract received the same amount of BPT
      expect(ssContractBPTbalance.add(BPTAmountOut)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      // and also that DT balance lowered in the ssContract
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );

      // no token where taken from user3.
      expect(user3DTbalance).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
    });
    it("#15 - user3 removes liquidity with JoinPool, receiving both tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);

      const BPTAmountIn = ethers.utils.parseEther("0.01");
      const minAmountOut = [
        // min amount out for DT and USDC
        web3.utils.toWei("1"),
        1e6,
      ];
      receipt = await (
        await bPool.connect(user3).exitPool(
          BPTAmountIn, //exact BPT token IN
          minAmountOut
        )
      ).wait();

      const ExitEvents = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check all balances (DT,USDC,BPT)
      expect(ExitEvents[0].args.tokenOut).to.equal(erc20Token.address);
      expect(ExitEvents[1].args.tokenOut).to.equal(usdcAddress);

      expect(ExitEvents[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
      expect(ExitEvents[1].args.tokenAmountOut.add(user3USDCbalance)).to.equal(
        await usdcContract.balanceOf(user3.address)
      );

      expect((await bPool.balanceOf(user3.address)).add(BPTAmountIn)).to.equal(
        user3BPTbalance
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#16 - user3 removes liquidity with exitswapPoolAmountIn, receiving only USDC tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const BPTAmountIn = ethers.utils.parseEther("0.01");
      const minUSDCOut = 1e6; //1 USDC

      receipt = await (
        await bPool.connect(user3).exitswapPoolAmountIn(
          usdcAddress,
          BPTAmountIn, //BPT token IN
          minUSDCOut // min amount USDC out
        )
      ).wait();

      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(usdcContract.address);
      expect(ExitEvent[1].args.tokenOut).to.equal(erc20Token.address);
      // we check user3 OCEAN balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3USDCbalance)).to.equal(
        await usdcContract.balanceOf(user3.address)
      );
      // we also check user3 BPT balance before and after
      expect(user3BPTbalance).to.equal(
        (await bPool.balanceOf(user3.address)).add(BPTAmountIn)
      );

      // NOW we check the ssContract BPT balance
      expect(ssContractBPTbalance).to.equal(
        (await bPool.balanceOf(sideStaking.address)).add(BPTAmountIn)
      );
      // and that ssContract got back his dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(sideStaking.address));
    });

    it("#17 - user3 removes liquidity with exitswapPoolAmountIn, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);

      const BPTAmountIn = ethers.utils.parseEther("0.01");
      const minDTOut = ethers.utils.parseEther("0.5");
      receipt = await (
        await bPool.connect(user3).exitswapPoolAmountIn(
          erc20Token.address,
          BPTAmountIn, //BPT token IN
          minDTOut // min amount DT out
        )
      ).wait();

      expect(await usdcContract.balanceOf(user3.address)).to.equal(
        user3USDCbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      assert(ExitEvent[0].args.caller == user3.address);
      assert(ExitEvent[0].args.tokenOut == erc20Token.address);

      // we check user3 DT balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );

      // we also check user3 BPT balance before and after
      expect(user3BPTbalance).to.equal(
        (await bPool.balanceOf(user3.address)).add(BPTAmountIn)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });
    it("#18 - user3 removes liquidity with exitswapExternAmountOut, receiving only USDC tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const maxBTPIn = ethers.utils.parseEther("0.5");
      const exactUSDCOut = 1e6; // 1 usdc

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          usdcAddress,
          exactUSDCOut, // exact amount USDC out
          maxBTPIn //max BPT token IN
        )
      ).wait();

      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(usdcContract.address);
      expect(ExitEvent[1].args.tokenOut).to.equal(erc20Token.address);
      // we check user3 OCEAN balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3USDCbalance)).to.equal(
        await usdcContract.balanceOf(user3.address)
      );

      // NOW we check the ssContract BPT balance
      expect(ssContractBPTbalance.sub(BPTEvent[0].args.bptAmount)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );
      // and that we got back some dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(sideStaking.address));
    });

    it("#19 - user3 removes liquidity with exitswapExternAmountOut, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          erc20Token.address,
          ethers.utils.parseEther("0.5"), //max BPT token IN
          web3.utils.toWei("1") // exact amount DT out
        )
      ).wait();

      // USDC BALANCE DOESN"T CHANGE
      expect(await usdcContract.balanceOf(user3.address)).to.equal(
        user3USDCbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");
      // BPT balance decrease
      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(erc20Token.address);

      // we check user3 DT balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#20 - we check again ocean and market fees were accounted", async () => {
      expect(await bPool.getOPFFee()).to.equal(0);
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );

      // ocean fee actually collected some fees
      assert((await bPool.communityFees(usdcAddress)).gt(0) == true);
      assert((await bPool.communityFees(erc20Token.address)).gt(0) == true);
      // market fee actually collected some fees

      assert((await bPool.publishMarketFees(usdcAddress)).gt(0) == true);
      assert((await bPool.publishMarketFees(erc20Token.address)).gt(0) == true);
    });

    it("#21 - market collector withdraws fees", async () => {
      // no fees for OPF or MARKET WERE COLLECTED AT THIS POINT
      // user2 has no DT
      expect(await erc20Token.balanceOf(user2.address)).to.equal(0);

      await bPool.connect(marketFeeCollector).collectMarketFee();

      assert((await bPool.publishMarketFees(usdcAddress)) == 0);
      assert((await bPool.publishMarketFees(erc20Token.address)) == 0);
    });

    it("#222 - OPF collector withdraws fees", async () => {
      // no fees for OPF WERE COLLECTED AT THIS POINT

      // any user can call collectOPF
      await bPool.connect(user3).collectOPF();

      assert((await bPool.communityFees(usdcAddress)) == 0);
      assert((await bPool.communityFees(erc20Token.address)) == 0);
    });

    it("#23 - add all DT tokens as liquidity, check vesting still available", async () => {
      const dtSSContractBalance = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      console.log(
        ethers.utils.formatEther(dtSSContractBalance),
        "dt available for staking before addin new liquidity"
      );
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      //const user3Oceanbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      console.log(
        ethers.utils.formatEther(ssContractDTbalance),
        "dt contract balance before adding"
      );
      await usdcContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const usdcAmountIn = 20000 * 1e6; // 20000 USDC  this amount is more than the dt available for staking
      const minBPTOut = web3.utils.toWei("0.001");

      receipt = await (
        await bPool.connect(user3).joinswapExternAmountIn(
          usdcAddress, //token IN
          usdcAmountIn, // amount In (usdc tokens)
          minBPTOut // BPT token out
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(usdcAddress);

      expect(JoinEvent[0].args.tokenAmountIn).to.equal(usdcAmountIn);

      const sideStakingAmountIn = ssContractDTbalance.sub(
        await erc20Token.balanceOf(sideStaking.address)
      );
      // no second join event has been emitted because contract hasn't staked
      assert(JoinEvent[1] == null);

      // no dt added from the staking contract
      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );

      console.log(sideStakingAmountIn.toString(), "sidestaking amount in");

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      assert(BPTEvent[1] == null);
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      // no dt token where taken from user3
      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );

      const dtSSContractBalanceAfter = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      console.log(
        ethers.utils.formatEther(dtSSContractBalanceAfter),
        "dt balance after"
      );
      console.log(ssContractDTbalance.toString());
      console.log((await erc20Token.balanceOf(sideStaking.address)).toString());

      expect(dtSSContractBalance).to.equal(dtSSContractBalanceAfter);
      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });
  });

  describe(" Flexible OPF Fee test, Pool with NO ocean token (DAI 18 decimals) and Publish Market fee 0.1%", async () => {
    const swapFee = 1e15;
    const swapMarketFee = 0;
    const swapPublishMarketFee = 1e15;

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

      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);
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
        await erc20Token.connect(user3).deployPool(
          //  sideStaking.address,
          // daiAddress,
          [
            web3.utils.toWei("1"), // rate
            18, // basetokenDecimals
            web3.utils.toWei("100"), //vestingAmount
            2500000, // vested blocks
            initialDAILiquidity, // baseToken initial pool liquidity
          ],
          // user3.address,
          [swapFee, swapPublishMarketFee],
          // marketFeeCollector.address,
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

      bPool = await ethers.getContractAt("BPool", bPoolAddress);

      assert((await bPool.isFinalized()) == true);

      expect(await erc20Token.balanceOf(sideStaking.address)).to.equal(
        web3.utils.toWei("300")
      );

      expect(await bPool.getSwapFee()).to.equal(swapFee);

      expect(await bPool.getOPFFee()).to.equal(web3.utils.toWei("0.01"));
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );

      expect(await bPool.communityFees(daiAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);
      expect(await bPool.publishMarketFees(daiAddress)).to.equal(0);
      expect(await bPool.publishMarketFees(erc20Token.address)).to.equal(0);
    });

    it("#6 - user4 buys some DT - exactAmountIn", async () => {
      // pool has initial ocean tokens at the beginning
      assert(
        (await daiContract.balanceOf(bPoolAddress)) == web3.utils.toWei("700")
      );

      // we approve the pool to move dai tokens
      await daiContract
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000"));

      // user4 has no DT before swap
      assert((await erc20Token.balanceOf(user4.address)) == 0);

      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4DAIBalance = await daiContract.balanceOf(user4.address);
      const dtMarketFeeBal = await bPool.publishMarketFees(erc20Token.address);
      const daiMarketFeeBal = await bPool.publishMarketFees(daiAddress);
      const dtOPFFeeBal = await bPool.communityFees(erc20Token.address);
      const daiOPFFeeBal = await bPool.communityFees(daiAddress);

      // we prepare the arrays, user5 is going to receive the dynamic market fee
      amountIn = web3.utils.toWei("10");
      minAmountOut = web3.utils.toWei("1");
      maxPrice = web3.utils.toWei("10");
      marketFee = 0;
      const tokenInOutMarket = [daiAddress, erc20Token.address, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [amountIn, minAmountOut, maxPrice, marketFee]; // [exactAmountIn,minAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // marketFeeAmount and oceanFeeAmont have been calculated properly - ocean fee is 1% (set in previous test)
      expect(web3.utils.toWei("0.01")).to.equal(args.marketFeeAmount); // 0.1%
      expect(web3.utils.toWei("0.1")).to.equal(args.oceanFeeAmount); // 1%
      expect(web3.utils.toWei("0.01")).to.equal(args.swapFeeAmount); // 0.1%

      // publishMarketFees and opfFees accounting increased as expected , in DAI
      expect(daiAddress).to.equal(args.tokenFees);
      expect(daiMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.publishMarketFees(args.tokenFees)
      );
      expect(daiOPFFeeBal.add(args.oceanFeeAmount)).to.equal(
        await bPool.communityFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      // CHECK SWAP BALANCES

      // user 4 DAI balance decresead properly
      expect(
        (await daiContract.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DAIBalance);
      // user 4 DT balance increased properly
      expect(user4DTbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await erc20Token.balanceOf(user4.address)
      );

      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(100)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );
    });

    it("#7 - opfFee is updated to 0.1% (1e15) again, set to 0.1% in previous test", async () => {
      // we already approved pool to withdraw Ocean tokens
      expect(await bPool.getOPFFee()).to.equal(web3.utils.toWei("0.01"));
      await router.updateOPFFee("0", web3.utils.toWei("0.001")); // 1e15 => 0.1%
      expect(await bPool.getSwapFee()).to.equal(swapFee);
      expect(await bPool.getOPFFee()).to.equal(web3.utils.toWei("0.001"));
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );
    });

    it("#8 - user4 buys some DT  - exactAmountOut", async () => {
      // we already approved pool to withdraw Ocean tokens

      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4DAIBalance = await daiContract.balanceOf(user4.address);
      const dtMarketFeeBal = await bPool.publishMarketFees(erc20Token.address);
      const daiMarketFeeBal = await bPool.publishMarketFees(daiAddress);
      const dtOPFFeeBal = await bPool.communityFees(erc20Token.address);
      const daiOPFFeeBal = await bPool.communityFees(daiAddress);

      // we prepare the arrays, user5 is going to receive the dynamic market fee
      maxAmountIn = web3.utils.toWei("100");
      amountOut = web3.utils.toWei("10");
      maxPrice = web3.utils.toWei("10");
      marketFee = 0;
      const tokenInOutMarket = [daiAddress, erc20Token.address, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [maxAmountIn, amountOut, maxPrice, marketFee]; // [maxAmountIn,exactAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // publishMarketFees and opfFees accounting increased as expected , in DAI
      expect(daiAddress).to.equal(args.tokenFees);
      expect(daiMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.publishMarketFees(args.tokenFees)
      );
      expect(daiOPFFeeBal.add(args.oceanFeeAmount)).to.equal(
        await bPool.communityFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;
      // marketFeeAmount and oceanFeeAmont have been calculated properly - ocean fee is 0.1% (set by the contracts)
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1000)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );

      // CHECK SWAP BALANCES

      // user 4 DAI balance decresead properly
      expect(
        (await daiContract.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DAIBalance);
      // user 4 DT balance increased properly
      expect(user4DTbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await erc20Token.balanceOf(user4.address)
      );
    });

    it("#9 - user4 swaps some DT back to DAI swapExactAmountIn", async () => {
      assert((await bPool.isFinalized()) == true);

      await erc20Token
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4DAIbalance = await daiContract.balanceOf(user4.address);

      // we prepare the arrays, user5 is going to receive the dynamic market fee
      amountIn = web3.utils.toWei("10");
      minAmountOut = web3.utils.toWei("1");
      maxPrice = web3.utils.toWei("10");
      marketFee = 0;
      const tokenInOutMarket = [erc20Token.address, daiAddress, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [amountIn, minAmountOut, maxPrice, marketFee]; // [exactAmountIn,minAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      expect(
        (await erc20Token.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DTbalance);

      expect(await daiContract.balanceOf(user4.address)).to.equal(
        user4DAIbalance.add(swapArgs.tokenAmountOut)
      );

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // WE CHECK FEES WERE CALCULATED PROPERLY
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(swapArgs.tokenAmountIn.div(1000)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );
    });

    it("#10 - DAI token is added as ocean tokens list, now opfFee will be ZERO", async () => {
      // we already approved pool to withdraw Ocean tokens

      await router.addOceanToken(daiContract.address);
      expect(await bPool.getSwapFee()).to.equal(swapFee);
      expect(await bPool.getOPFFee()).to.equal(0);
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );
    });

    it("#11 - user4 swaps some DT back to DAI swapExactAmountOut", async () => {
      assert((await bPool.isFinalized()) == true);

      await erc20Token
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4DAIbalance = await daiContract.balanceOf(user4.address);

      // we prepare the arrays, user5 is going to receive the dynamic market fee
      maxAmountIn = web3.utils.toWei("10");
      amountOut = web3.utils.toWei("1");
      maxPrice = web3.utils.toWei("10");
      marketFee = 0;
      const tokenInOutMarket = [erc20Token.address, daiAddress, user5.address]; // [tokenIn,tokenOut,marketFeeAddress]
      const amountsInOutMaxFee = [maxAmountIn, amountOut, maxPrice, marketFee]; // [maxAmountIn,exactAmountOut,maxPrice,_swapMarketFee]

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(tokenInOutMarket, amountsInOutMaxFee)
      ).wait();

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      expect(
        (await erc20Token.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4DTbalance);

      expect(await daiContract.balanceOf(user4.address)).to.equal(
        user4DAIbalance.add(swapArgs.tokenAmountOut)
      );

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // WE CHECK FEES WERE CALCULATED PROPERLY
      expect(
        swapArgs.tokenAmountIn.div(1e18 / swapPublishMarketFee)
      ).to.be.closeTo(args.marketFeeAmount, 1);
      expect(args.oceanFeeAmount).to.equal(0);

      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );
    });

    it("#12 - user4 adds more liquidity with joinPool() (adding both tokens)", async () => {
      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4DAIbalance = await daiContract.balanceOf(user4.address);
      const user4BPTbalance = await bPool.balanceOf(user4.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      const BPTAmountOut = web3.utils.toWei("0.01");
      const maxAmountsIn = [
        web3.utils.toWei("50"), // Amounts IN
        web3.utils.toWei("50"), // Amounts IN
      ];
      await daiContract
        .connect(user4)
        .approve(bPool.address, web3.utils.toWei("50"));

      await erc20Token
        .connect(user4)
        .approve(bPool.address, web3.utils.toWei("50"));

      receipt = await (
        await bPool.connect(user4).joinPool(
          BPTAmountOut, // exactBPT OUT token OUT
          maxAmountsIn
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");
      expect(JoinEvent[0].args.tokenIn).to.equal(erc20Token.address);
      expect(JoinEvent[1].args.tokenIn).to.equal(daiAddress);

      // we check all balances
      expect(
        JoinEvent[0].args.tokenAmountIn.add(
          await erc20Token.balanceOf(user4.address)
        )
      ).to.equal(user4DTbalance);
      expect(
        JoinEvent[1].args.tokenAmountIn.add(
          await daiContract.balanceOf(user4.address)
        )
      ).to.equal(user4DAIbalance);

      expect(user4BPTbalance.add(BPTAmountOut)).to.equal(
        await bPool.balanceOf(user4.address)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#13 - user3 adds more liquidity with joinswapExternAmountIn (only DAI)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      //const user3Oceanbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      await daiContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const daiAmountIn = web3.utils.toWei("100");
      const minBPTOut = web3.utils.toWei("0.1");

      receipt = await (
        await bPool.connect(user3).joinswapExternAmountIn(
          daiAddress, //token IN
          daiAmountIn, // amount In (dai tokens)
          minBPTOut // BPT token out
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(daiAddress);

      expect(JoinEvent[0].args.tokenAmountIn).to.equal(daiAmountIn);

      expect(JoinEvent[1].args.tokenIn).to.equal(erc20Token.address);

      const sideStakingAmountIn = ssContractDTbalance.sub(
        await erc20Token.balanceOf(sideStaking.address)
      );

      expect(JoinEvent[1].args.tokenAmountIn).to.equal(sideStakingAmountIn);

      // we check ssContract actually moved DT and got back BPT
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance.sub(sideStakingAmountIn));

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(BPTEvent[0].args.bptAmount.add(ssContractBPTbalance)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      // no dt token where taken from user3
      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );
    });

    it("#14 - user3 adds more liquidity with joinswapPoolAmountOut (only DAI)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      await daiContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const BPTAmountOut = ethers.utils.parseEther("0.1");
      const maxOceanIn = ethers.utils.parseEther("100");

      receipt = await (
        await bPool.connect(user3).joinswapPoolAmountOut(
          daiAddress, //token IN
          BPTAmountOut, // exact lp token out
          maxOceanIn // max ocean tokens IN
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(daiAddress);
      expect(JoinEvent[1].args.tokenIn).to.equal(erc20Token.address);

      // check balances (ocean and bpt)
      expect(
        JoinEvent[0].args.tokenAmountIn.add(
          await daiContract.balanceOf(user3.address)
        )
      ).to.equal(user3DAIbalance);

      expect(BPTAmountOut.add(user3BPTbalance)).to.equal(
        await bPool.balanceOf(user3.address)
      );

      // we check ssContract received the same amount of BPT
      expect(ssContractBPTbalance.add(BPTAmountOut)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      // and also that DT balance lowered in the ssContract
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );

      // no token where taken from user3.
      expect(user3DTbalance).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
    });
    it("#15 - user3 removes liquidity with JoinPool, receiving both tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);

      const BPTAmountIn = ethers.utils.parseEther("0.5");
      const minAmountOut = [
        web3.utils.toWei("1"), // min amount out for OCEAN AND DT
        web3.utils.toWei("1"),
      ];
      receipt = await (
        await bPool.connect(user3).exitPool(
          BPTAmountIn, //exact BPT token IN
          minAmountOut
        )
      ).wait();

      const ExitEvents = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check all balances (DT,OCEAN,BPT)
      expect(ExitEvents[0].args.tokenOut).to.equal(erc20Token.address);
      expect(ExitEvents[1].args.tokenOut).to.equal(daiAddress);

      expect(ExitEvents[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
      expect(ExitEvents[1].args.tokenAmountOut.add(user3DAIbalance)).to.equal(
        await daiContract.balanceOf(user3.address)
      );

      expect((await bPool.balanceOf(user3.address)).add(BPTAmountIn)).to.equal(
        user3BPTbalance
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#16 - user3 removes liquidity with exitswapPoolAmountIn, receiving only OCEAN tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const BPTAmountIn = ethers.utils.parseEther("0.5");
      const minOceanOut = web3.utils.toWei("0.5");

      receipt = await (
        await bPool.connect(user3).exitswapPoolAmountIn(
          daiAddress,
          BPTAmountIn, //BPT token IN
          minOceanOut // min amount OCEAN out
        )
      ).wait();

      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(daiContract.address);
      expect(ExitEvent[1].args.tokenOut).to.equal(erc20Token.address);
      // we check user3 OCEAN balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DAIbalance)).to.equal(
        await daiContract.balanceOf(user3.address)
      );
      // we also check user3 BPT balance before and after
      expect(user3BPTbalance).to.equal(
        (await bPool.balanceOf(user3.address)).add(BPTAmountIn)
      );

      // NOW we check the ssContract BPT balance
      expect(ssContractBPTbalance).to.equal(
        (await bPool.balanceOf(sideStaking.address)).add(BPTAmountIn)
      );
      // and that ssContract got back his dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(sideStaking.address));
    });

    it("#17 - user3 removes liquidity with exitswapPoolAmountIn, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      console.log("user BPT Balance", user3BPTbalance.toString());

      const BPTAmountIn = ethers.utils.parseEther("0.2");
      const minDTOut = ethers.utils.parseEther("0.5");
      receipt = await (
        await bPool.connect(user3).exitswapPoolAmountIn(
          erc20Token.address,
          BPTAmountIn, //BPT token IN
          minDTOut // min amount DT out
        )
      ).wait();

      expect(await daiContract.balanceOf(user3.address)).to.equal(
        user3DAIbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      assert(ExitEvent[0].args.caller == user3.address);
      assert(ExitEvent[0].args.tokenOut == erc20Token.address);

      // we check user3 DT balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );

      // we also check user3 BPT balance before and after
      expect(user3BPTbalance).to.equal(
        (await bPool.balanceOf(user3.address)).add(BPTAmountIn)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });
    it("#18 - user3 removes liquidity with exitswapExternAmountOut, receiving only OCEAN tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const maxBTPIn = ethers.utils.parseEther("0.5");
      const exactOceanOut = ethers.utils.parseEther("1");

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          daiAddress,
          exactOceanOut, // exact amount OCEAN out
          maxBTPIn //max BPT token IN
        )
      ).wait();

      expect(await erc20Token.balanceOf(user3.address)).to.equal(
        user3DTbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(daiContract.address);
      expect(ExitEvent[1].args.tokenOut).to.equal(erc20Token.address);
      // we check user3 OCEAN balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DAIbalance)).to.equal(
        await daiContract.balanceOf(user3.address)
      );

      // NOW we check the ssContract BPT balance
      expect(ssContractBPTbalance.sub(BPTEvent[0].args.bptAmount)).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );
      // and that we got back some dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(sideStaking.address));
    });

    it("#19 - user3 removes liquidity with exitswapExternAmountOut, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        sideStaking.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          erc20Token.address,
          ethers.utils.parseEther("0.5"), //max BPT token IN
          web3.utils.toWei("1") // exact amount DT out
        )
      ).wait();

      // DAI BALANCE DOESN"T CHANGE
      expect(await daiContract.balanceOf(user3.address)).to.equal(
        user3DAIbalance
      );

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");
      // BPT balance decrease
      expect(await bPool.balanceOf(user3.address)).to.equal(
        user3BPTbalance.sub(BPTEvent[0].args.bptAmount)
      );

      // LOOK FOR EXIT EVENT
      const ExitEvent = receipt.events.filter((e) => e.event === "LOG_EXIT");

      // we check event arguments
      expect(ExitEvent[0].args.caller).to.equal(user3.address);
      expect(ExitEvent[0].args.tokenOut).to.equal(erc20Token.address);

      // we check user3 DT balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(sideStaking.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });

    it("#20 - we check again ocean and market fees were accounted", async () => {
      expect(await bPool.getOPFFee()).to.equal(0);
      expect(await bPool._swapPublishMarketFee()).to.equal(
        swapPublishMarketFee
      );

      // ocean fee actually collected some fees
      assert((await bPool.communityFees(daiAddress)).gt(0) == true);
      assert((await bPool.communityFees(erc20Token.address)).gt(0) == true);
      // market fee actually collected some fees

      assert((await bPool.publishMarketFees(daiAddress)).gt(0) == true);
      assert((await bPool.publishMarketFees(erc20Token.address)).gt(0) == true);
    });

    it("#21 - market collector withdraws fees", async () => {
      // no fees for OPF or MARKET WERE COLLECTED AT THIS POINT
      // user2 has no DT
      expect(await erc20Token.balanceOf(user2.address)).to.equal(0);

      await bPool.connect(marketFeeCollector).collectMarketFee();

      assert((await bPool.publishMarketFees(daiAddress)) == 0);
      assert((await bPool.publishMarketFees(erc20Token.address)) == 0);
    });

    it("#22 - OPF collector withdraws fees", async () => {
      // no fees for OPF WERE COLLECTED AT THIS POINT

      // any user can call collectOPF
      await bPool.connect(user3).collectOPF();

      assert((await bPool.communityFees(daiAddress)) == 0);
      assert((await bPool.communityFees(erc20Token.address)) == 0);
    });
    it("#23 - user3 attemps to add more than available liquidity, check vesting still available", async () => {
      // TODO: add detailed balance check for vesting amount, review !18 decimals (USDC TEST)

      const dtSSContractBalance = await sideStaking.getDataTokenBalance(
        erc20Token.address
      );
      console.log(
        ethers.utils.formatEther(dtSSContractBalance),
        "dt available"
      );
      const user3DTbalance = await erc20Token.balanceOf(user3.address);

      const ssContractDTBalBefore = await erc20Token.balanceOf(
        sideStaking.address
      );

      console.log(
        ethers.utils.formatEther(ssContractDTBalBefore),
        "dt contract balance"
      );
      const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

      await daiContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("150"));

      const daiAmountIn = web3.utils.toWei("150"); // this require more DT than available but enough in the contract(vesting)). so it shouldn't deposit any DT
      const minBPTOut = web3.utils.toWei("0.001");

      receipt = await (
        await bPool.connect(user3).joinswapExternAmountIn(
          daiAddress, //token IN
          daiAmountIn, // amount In (dai tokens)
          minBPTOut // BPT token out
        )
      ).wait();

      const JoinEvent = receipt.events.filter((e) => e.event === "LOG_JOIN");

      expect(JoinEvent[0].args.tokenIn).to.equal(daiAddress);

      expect(JoinEvent[0].args.tokenAmountIn).to.equal(daiAmountIn);

      expect(ssContractDTBalBefore).to.equal(
        await erc20Token.balanceOf(sideStaking.address)
      );
    });
  });
});
