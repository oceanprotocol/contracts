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
const { ZERO_ADDRESS, MAX_INT256, MAX_UINT256 } = require("@openzeppelin/test-helpers/src/constants");
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
    ssFixedRate,
    router,
    poolTemplate,
    bPoolAddress,
    bPool,
    signer,
    opfCollector,
    SwapFeesEvent,
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

    const Metadata = await ethers.getContractFactory("Metadata");
    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("ssFixedRate");
    const BPool = await ethers.getContractFactory("BPool");

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

    //poolTemplate = await BPool.deploy();

    ssFixedRate = await SSContract.deploy();

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

    await daiContract
      .connect(signer)
      .transfer(user4.address, ethers.utils.parseEther("1000"));
   

    assert(
      (await daiContract.balanceOf(user3.address)).toString() ==
        ethers.utils.parseEther("10005")
    );

      // GET SOME USDC (token with !18 decimals (6 in this case))
    const userWithUSDC = '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503'

    await impersonate(userWithUSDC);

    usdcContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      usdcAddress
    );

    signer = ethers.provider.getSigner(userWithUSDC);

    const amount = 1e10 // 10000 USDC
    await usdcContract
      .connect(signer)
      .transfer(user3.address, amount); 

    await usdcContract
      .connect(signer)
      .transfer(user4.address, amount); 
   

    expect(
      await usdcContract.balanceOf(user3.address)).to.equal(amount)

    expect(
        await usdcContract.balanceOf(user4.address)).to.equal(amount)



    data = web3.utils.asciiToHex("SomeData");
    flags = web3.utils.asciiToHex(constants.blob[0]);



    // DEPLOY ROUTER, SETTING OWNER
    router = await Router.deploy(
      owner.address,
      oceanAddress,
      oceanAddress, // pooltemplate field
      ssFixedRate.address,
      opfCollector.address,
      []
    );

    templateERC20 = await ERC20Template.deploy();

    metadata = await Metadata.deploy();

    // SETUP ERC721 Factory with template
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      templateERC20.address,
      communityFeeCollector,
      router.address,
      metadata.address
    );
      
    // SET REQUIRED ADDRESS

    await metadata.addTokenFactory(factoryERC721.address);
   
    await router.addERC20Factory(factoryERC721.address);
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

    assert((await tokenERC721._getPermissions(user3.address)).store == true);
    assert(
      (await tokenERC721._getPermissions(user3.address)).deployERC20 == true
    );
    assert(
      (await tokenERC721._getPermissions(user3.address)).updateMetadata == true
    );
  });

  it("#3 - user3 deploys a new erc20DT, assigning himself as minter", async () => {
    const trxERC20 = await tokenERC721.connect(user3).createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      cap,
      1,
      user3.address, // minter
      user6.address // feeManager
    );
    const trxReceiptERC20 = await trxERC20.wait();
    erc20Address = trxReceiptERC20.events[3].args.erc20Address;

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
    assert((await erc20Token.permissions(user3.address)).minter == true);
  });
// NOW user3 has 2 options, mint on his own and create custom pool, or using the staking contract and deploy a pool.

  describe(" Pool with ocean token and market fee 0.1%", async () => {
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
            0, // allowSell false , != 0 if true
            web3.utils.toWei("200"), // vesting amount
            500, // vested blocks
            initialOceanLiquidity, // baseToken initial pool liquidity
          ],
          user3.address,
          [
            swapFee, //
            swapOceanFee, //
            swapMarketFee,
          ],
          marketFeeCollector.address
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

      expect(await bPool._swapOceanFee()).to.equal(0);
      expect(await bPool._swapMarketFee()).to.equal(swapMarketFee);

      expect(await bPool.communityFees(oceanAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);
      expect(await bPool.marketFees(oceanAddress)).to.equal(0);
      expect(await bPool.marketFees(erc20Token.address)).to.equal(0);
      expect(await bPool.feesCollectedMarket(oceanAddress)).to.equal(0);
      expect(await bPool.feesCollectedMarket(erc20Token.address)).to.equal(0);
      expect(await bPool.feesCollectedOPF(oceanAddress)).to.equal(0);
      expect(await bPool.feesCollectedOPF(erc20Token.address)).to.equal(0);

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
      const dtMarketFeeBal = await bPool.marketFees(erc20Token.address);
      const oceanMarketFeeBal = await bPool.marketFees(oceanAddress);

      
      receipt = await (
        await bPool.connect(user4).swapExactAmountIn(
          oceanAddress, // tokenIn
          web3.utils.toWei("10"), // tokenAmountIn
          erc20Token.address, // tokenOut
          web3.utils.toWei("1"), //minAmountOut
          web3.utils.toWei("100") //maxPrice
        )
      ).wait();

      // user4 got his DT
      assert((await erc20Token.balanceOf(user4.address)) > 0);

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");
     
      const args = SwapFeesEvent[0].args;

      // marketFee have been calculated properly - ocean fee is zero
      expect(web3.utils.toWei("0.01")).to.equal(args.marketFeeAmount);

      // marketFees accounting increased as expected , in OCEAN
      expect(oceanAddress).to.equal(args.tokenFees);
      expect(oceanMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.marketFees(args.tokenFees)
      );

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
    });

    it("#6 - user4 buys some DT - exactAmountOut", async () => {
      // we already approved pool to withdraw Ocean tokens

      // user only has DT from previous test
      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4OceanBalance = await oceanContract.balanceOf(user4.address);

      const dtMarketFeeBal = await bPool.marketFees(erc20Token.address);
      const oceanMarketFeeBal = await bPool.marketFees(oceanAddress);

      receipt = await (
        await bPool.connect(user4).swapExactAmountOut(
          oceanAddress, // tokenIn
          web3.utils.toWei("100"), // maxAmountIn
          erc20Token.address, // tokenOut
          web3.utils.toWei("10"), // tokenAmountOut
          web3.utils.toWei("10") // maxPrice
        )
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

      // WE NOW CHECK FEES
      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");
    
      const args = SwapFeesEvent[0].args;

      // marketFee have been calculated properly - ocean fee is zero
      expect(0).to.equal(args.oceanFeeAmount);

      // marketFees accounting increased as expected (fees are taken from the amountIn so OCEAN IN THIS CASE)
      expect(oceanMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.marketFees(args.tokenFees)
      );
      expect(dtMarketFeeBal).to.equal(
        await bPool.marketFees(erc20Token.address)
      );

      // FEES HAVE BEEN CALCULATED PROPERLY
      expect(swapArgs.tokenAmountIn.div(1e18 / swapMarketFee)).to.be.closeTo(
        args.marketFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );
    });

    it("#7 - user4 swaps some DT back to Ocean with swapExactAmountIn, check swap custom fees", async () => {
      assert((await bPool.isFinalized()) == true);

      await erc20Token
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4Oceanbalance = await oceanContract.balanceOf(user4.address);

      const dtMarketFeeBal = await bPool.marketFees(erc20Token.address);
      const oceanMarketFeeBal = await bPool.marketFees(oceanAddress);

      expect(await bPool.communityFees(oceanAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);

      expect(await bPool.marketFees(erc20Token.address)).to.equal(0);

      const amountIn = web3.utils.toWei("10");
      const minAmountOut = web3.utils.toWei("1");
      const maxPrice = web3.utils.toWei("10");

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(
            erc20Token.address,
            amountIn,
            oceanAddress,
            minAmountOut,
            maxPrice
          )
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");
    
      const args = SwapFeesEvent[0].args;
     

      // marketFee have been calculated properly - ocean fee is zero
      expect(web3.utils.toWei("0.01")).to.equal(args.marketFeeAmount);
      // expect(oceanMarketFeeBal).to.equal(args.oceanFeeAmount)

      // marketFees accounting increased as expected
      expect(dtMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.marketFees(args.tokenFees)
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
      expect(swapArgs.tokenAmountIn.div(1e18 / swapMarketFee)).to.be.closeTo(
        args.marketFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );
    });

    it("#8 - user4 swaps some DT back to Ocean with swapExactAmountOut, check swap custom fees", async () => {
    

      await erc20Token
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4Oceanbalance = await oceanContract.balanceOf(user4.address);

      const dtMarketFeeBal = await bPool.marketFees(erc20Token.address);
      const oceanMarketFeeBal = await bPool.marketFees(oceanAddress);

      expect(await bPool.communityFees(oceanAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);


      const maxAmountIn = web3.utils.toWei("10");
      const amountOut = web3.utils.toWei("1");
      const maxPrice = web3.utils.toWei("10");

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(
            erc20Token.address,
            maxAmountIn,
            oceanAddress,
            amountOut,
            maxPrice
          )
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");
    
      const args = SwapFeesEvent[0].args;
     

      // marketFees accounting increased as expected
      expect(dtMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.marketFees(args.tokenFees)
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
      expect(swapArgs.tokenAmountIn.div(1e18 / swapMarketFee)).to.be.closeTo(
        args.marketFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );
    });

    it("#9 - user4 adds more liquidity with joinPool() (adding both tokens)", async () => {
      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4Oceanbalance = await oceanContract.balanceOf(user4.address);
      const user4BPTbalance = await bPool.balanceOf(user4.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);

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
        await bPool.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );
    });

    it("#10 - user3 adds more liquidity with joinswapExternAmountIn (only OCEAN)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);

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

      const ssFixedRateAmountIn = ssContractDTbalance.sub(
        await erc20Token.balanceOf(ssFixedRate.address)
      );

      expect(JoinEvent[1].args.tokenAmountIn).to.equal(ssFixedRateAmountIn);

      // dt amount is slightly higher because we ask for the same amount of BPT but the pool is bigger
      assert(ssFixedRateAmountIn.gt(JoinEvent[0].args.tokenAmountIn) == true);

      // we check ssContract actually moved DT and got back BPT
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance.sub(ssFixedRateAmountIn));

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(BPTEvent[0].args.bptAmount.add(ssContractBPTbalance)).to.equal(
        await bPool.balanceOf(ssFixedRate.address)
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
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);

      await oceanContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

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
        await bPool.balanceOf(ssFixedRate.address)
      );

      // and also that DT balance lowered in the ssContract
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );

      // no token where taken from user3.
      expect(user3DTbalance).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
    });
    it("#12 - user3 removes liquidity with JoinPool, receiving both tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);
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
      expect(ExitEvents[1].args.tokenOut).to.equal(oceanAddress);

      expect(ExitEvents[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
      expect(ExitEvents[1].args.tokenAmountOut.add(user3Oceanbalance)).to.equal(
        await oceanContract.balanceOf(user3.address)
      );

      expect((await bPool.balanceOf(user3.address)).add(BPTAmountIn)).to.equal(
        user3BPTbalance
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );
    });

    it("#13 - user3 removes liquidity with exitswapPoolAmountIn, receiving only OCEAN tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);
      // NO APPROVAL FOR BPT is required

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
      // we check user3 OCEAN balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3Oceanbalance)).to.equal(
        await oceanContract.balanceOf(user3.address)
      );
      // we also check user3 BPT balance before and after
      expect(user3BPTbalance).to.equal(
        (await bPool.balanceOf(user3.address)).add(BPTAmountIn)
      );

      // NOW we check the ssContract BPT balance decresead as expected
      expect(ssContractBPTbalance).to.equal(
        (await bPool.balanceOf(ssFixedRate.address)).add(BPTAmountIn)
      );
      // and that ssContract got back his dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(ssFixedRate.address));
    });

    it("#14 - user3 removes liquidity with exitswapPoolAmountIn, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);

      const BPTAmountIn = ethers.utils.parseEther("0.5");
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
        await bPool.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );
    });
    it("#15 - user3 removes liquidity with exitswapExternAmountOut, receiving only OCEAN tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const maxBTPIn = ethers.utils.parseEther("0.5");
      const exactOceanOut = ethers.utils.parseEther("1");

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          oceanAddress,
          exactOceanOut, // exact amount OCEAN out
          maxBTPIn, //max BPT token IN
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
      // we check user3 OCEAN balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3Oceanbalance)).to.equal(
        await oceanContract.balanceOf(user3.address)
      );

      // NOW we check the ssContract BPT balance
      expect(ssContractBPTbalance.sub(BPTEvent[0].args.bptAmount)).to.equal(
        await bPool.balanceOf(ssFixedRate.address)
      );
      // and that we got back some dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(ssFixedRate.address));
    });

    it("#16 - user3 removes liquidity with exitswapExternAmountOut, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);

      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          erc20Token.address,
          ethers.utils.parseEther("0.5"), //max BPT token IN
          web3.utils.toWei("1") // exact amount DT out
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

      // we check user3 DT balance before and after
      expect(ExitEvent[0].args.tokenAmountOut.add(user3DTbalance)).to.equal(
        await erc20Token.balanceOf(user3.address)
      );

      // NOW we check the ssContract BPT and DT balance didn't change.
      expect(ssContractBPTbalance).to.equal(
        await bPool.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );
    });

    it("#17 - we check again no ocean and market fees were accounted", async () => {
      expect(await bPool._swapOceanFee()).to.equal(0);
      expect(await bPool._swapMarketFee()).to.equal(swapMarketFee);

      expect(await bPool.communityFees(oceanAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);

      // market fee actually collected some fees
      assert((await bPool.marketFees(oceanAddress)).gt(0) == true);
      assert((await bPool.marketFees(erc20Token.address)).gt(0) == true);

      expect(await bPool.feesCollectedMarket(oceanAddress)).to.equal(0);
      expect(await bPool.feesCollectedMarket(erc20Token.address)).to.equal(0);
      expect(await bPool.feesCollectedOPF(oceanAddress)).to.equal(0);
      expect(await bPool.feesCollectedOPF(erc20Token.address)).to.equal(0);
    });

    it("#18 - market collector withdraws fees", async () => {
      assert((await bPool.marketFees(oceanAddress)).gt(0) == true);
      assert((await bPool.marketFees(erc20Token.address)).gt(0) == true);

      expect(await bPool.feesCollectedMarket(oceanAddress)).to.equal(0);
      expect(await bPool.feesCollectedMarket(erc20Token.address)).to.equal(0);
      expect(await erc20Token.balanceOf(user2.address)).to.equal(0);
      expect(await oceanContract.balanceOf(user2.address)).to.equal(0);

      // marketFeeCollector send fees to another address
      await bPool.connect(marketFeeCollector).collectMarketFee(user2.address);

      // only marketCollector can withdraw
      await expectRevert(
        bPool.connect(user3).collectMarketFee(user3.address),
        "ONLY MARKET COLLECTOR"
      );

      // Since it's the first withdraw and user2 balances were zero, user2 balance == feesCollected
      expect(await erc20Token.balanceOf(user2.address)).to.equal(
        await bPool.feesCollectedMarket(erc20Token.address)
      );
      expect(await oceanContract.balanceOf(user2.address)).to.equal(
        await bPool.feesCollectedMarket(oceanAddress)
      );
    });
  });

  describe(" Pool with NO ocean token (DAI 18 decimals) and market fee 0.1%", async () => {
    const swapFee = 1e15;
    const swapOceanFee = 0; // we attemp to set swapOceanFee at 0, will fail
    const swapMarketFee = 1e15;

    it("#4 - user3 deploys a new erc20DT, assigning himself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        cap,
        1,
        user3.address, // minter
        user6.address // feeManager
      );
      const trxReceiptERC20 = await trxERC20.wait();
      erc20Address = trxReceiptERC20.events[3].args.erc20Address;

      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);
    });

    it("#5 - user3 calls deployPool() and check ocean and market fee", async () => {
      // user3 hasn't minted any token so he can call deployPool()

      const ssDTBalance = await erc20Token.balanceOf(ssFixedRate.address);

      const initialDAILiquidity = web3.utils.toWei("2000");
      const initialDTLiquidity = initialDAILiquidity;
      // approve exact amount
      await daiContract
        .connect(user3)
        .approve(router.address, initialDAILiquidity);

      // we deploy a new pool with burnInEndBlock as 0
      receipt = await (
        await erc20Token.connect(user3).deployPool(
          ssFixedRate.address,
          daiAddress,
          [
            web3.utils.toWei("1"), // rate
            0, // allowSell false , != 0 if true
            web3.utils.toWei("200"), // vesting amount
            500, // vested blocks
            initialDAILiquidity, // baseToken initial pool liquidity
          ],
          user3.address,
          [
            swapFee, //
            swapOceanFee, //
            swapMarketFee,
          ],
          marketFeeCollector.address
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

      expect(await bPool.getSwapFee()).to.equal(swapFee);
      expect(await bPool._swapOceanFee()).to.equal(1e15);
      expect(await bPool._swapMarketFee()).to.equal(swapMarketFee);

      expect(await bPool.communityFees(daiAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);
      expect(await bPool.marketFees(daiAddress)).to.equal(0);
      expect(await bPool.marketFees(erc20Token.address)).to.equal(0);
      expect(await bPool.feesCollectedMarket(daiAddress)).to.equal(0);
      expect(await bPool.feesCollectedMarket(erc20Token.address)).to.equal(0);
      expect(await bPool.feesCollectedOPF(daiAddress)).to.equal(0);
      expect(await bPool.feesCollectedOPF(erc20Token.address)).to.equal(0);
    });

    it("#6 - user4 buys some DT - exactAmountIn", async () => {
      // pool has initial ocean tokens at the beginning
      assert(
        (await daiContract.balanceOf(bPoolAddress)) == web3.utils.toWei("2000")
      );

      // we approve the pool to move dai tokens
      await daiContract
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000"));

      // user4 has no DT before swap
      assert((await erc20Token.balanceOf(user4.address)) == 0);

      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4DAIBalance = await daiContract.balanceOf(user4.address);
      const dtMarketFeeBal = await bPool.marketFees(erc20Token.address);
      const daiMarketFeeBal = await bPool.marketFees(daiAddress);
      const dtOPFFeeBal = await bPool.communityFees(erc20Token.address);
      const daiOPFFeeBal = await bPool.communityFees(daiAddress);

      receipt = await (
        await bPool.connect(user4).swapExactAmountIn(
          daiAddress, // tokenIn
          web3.utils.toWei("10"), // tokenAmountIn
          erc20Token.address, // tokenOut
          web3.utils.toWei("1"), //minAmountOut
          web3.utils.toWei("100") //maxPrice
        )
      ).wait();

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // marketFeeAmount and oceanFeeAmont have been calculated properly - ocean fee is 0.1% (set by the contracts)
      expect(web3.utils.toWei("0.01")).to.equal(args.marketFeeAmount);
      expect(web3.utils.toWei("0.01")).to.equal(args.oceanFeeAmount);
      expect(args.oceanFeeAmount).to.equal(args.swapFeeAmount);
      expect(web3.utils.toWei("0.01")).to.equal(args.swapFeeAmount);

      // marketFees and opfFees accounting increased as expected , in DAI
      expect(daiAddress).to.equal(args.tokenFees);
      expect(daiMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.marketFees(args.tokenFees)
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

      expect(swapArgs.tokenAmountIn.div(1e18 / swapMarketFee)).to.be.closeTo(
        args.marketFeeAmount,
        1
      );
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
      const dtMarketFeeBal = await bPool.marketFees(erc20Token.address);
      const daiMarketFeeBal = await bPool.marketFees(daiAddress);
      const dtOPFFeeBal = await bPool.communityFees(erc20Token.address);
      const daiOPFFeeBal = await bPool.communityFees(daiAddress);

      receipt = await (
        await bPool.connect(user4).swapExactAmountOut(
          daiAddress, // tokenIn
          web3.utils.toWei("100"), // maxAmountIn
          erc20Token.address, // tokenOut
          web3.utils.toWei("10"), // tokenAmountOut
          web3.utils.toWei("10") // maxPrice
        )
      ).wait();

     

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // marketFees and opfFees accounting increased as expected , in DAI
      expect(daiAddress).to.equal(args.tokenFees);
      expect(daiMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.marketFees(args.tokenFees)
      );
      expect(daiOPFFeeBal.add(args.oceanFeeAmount)).to.equal(
        await bPool.communityFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;
      // marketFeeAmount and oceanFeeAmont have been calculated properly - ocean fee is 0.1% (set by the contracts)
      expect(swapArgs.tokenAmountIn.div(1e18 / swapMarketFee)).to.be.closeTo(
        args.marketFeeAmount,
        1
      );
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

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(
            erc20Token.address,
            web3.utils.toWei("10"),
            daiAddress,
            web3.utils.toWei("1"),
            web3.utils.toWei("10")
          )
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
      expect(swapArgs.tokenAmountIn.div(1e18 / swapMarketFee)).to.be.closeTo(
        args.marketFeeAmount,
        1
      );
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

      const maxAmountIn =web3.utils.toWei("10")
      const amountOut = web3.utils.toWei("1")
      const maxPrice = web3.utils.toWei("10")
      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(
            erc20Token.address,
            maxAmountIn,
            daiAddress,
            amountOut,
            maxPrice
          )
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
      expect(swapArgs.tokenAmountIn.div(1e18 / swapMarketFee)).to.be.closeTo(
        args.marketFeeAmount,
        1
      );
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
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);

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
        await bPool.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );
    });

    it("#10 - user3 adds more liquidity with joinswapExternAmountIn (only DAI)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      //const user3Oceanbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);

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

      const ssFixedRateAmountIn = ssContractDTbalance.sub(
        await erc20Token.balanceOf(ssFixedRate.address)
      );

      expect(JoinEvent[1].args.tokenAmountIn).to.equal(ssFixedRateAmountIn);

      // dt amount is slightly higher because we ask for the same amount of BPT but the pool is bigger
      assert(ssFixedRateAmountIn.gt(JoinEvent[0].args.tokenAmountIn) == true);

      // we check ssContract actually moved DT and got back BPT
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance.sub(ssFixedRateAmountIn));

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(BPTEvent[0].args.bptAmount.add(ssContractBPTbalance)).to.equal(
        await bPool.balanceOf(ssFixedRate.address)
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
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);

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
        await bPool.balanceOf(ssFixedRate.address)
      );

      // and also that DT balance lowered in the ssContract
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );

      // no token where taken from user3.
      expect(user3DTbalance).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
    });
    it("#12 - user3 removes liquidity with JoinPool, receiving both tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);
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
        await bPool.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );
    });

    it("#13 - user3 removes liquidity with exitswapPoolAmountIn, receiving only OCEAN tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);
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
        (await bPool.balanceOf(ssFixedRate.address)).add(BPTAmountIn)
      );
      // and that ssContract got back his dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(ssFixedRate.address));
    });

    it("#14 - user3 removes liquidity with exitswapPoolAmountIn, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);

      const BPTAmountIn = ethers.utils.parseEther("0.5");
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
        await bPool.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );
    });
    it("#15 - user3 removes liquidity with exitswapExternAmountOut, receiving only OCEAN tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);
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
        await bPool.balanceOf(ssFixedRate.address)
      );
      // and that we got back some dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(ssFixedRate.address));
    });

    it("#16 - user3 removes liquidity with exitswapExternAmountOut, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3DAIbalance = await daiContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);

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
        await bPool.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );
    });

    it("#17 - we check again no ocean and market fees were accounted", async () => {
      expect(await bPool._swapOceanFee()).to.equal(1e15);
      expect(await bPool._swapMarketFee()).to.equal(swapMarketFee);

      // ocean fee actually collected some fees
      assert((await bPool.communityFees(daiAddress)).gt(0) == true);
      assert((await bPool.communityFees(erc20Token.address)).gt(0) == true);
      // market fee actually collected some fees
      // TODO: add more detailed test on this.
      assert((await bPool.marketFees(daiAddress)).gt(0) == true);
      assert((await bPool.marketFees(erc20Token.address)).gt(0) == true);

      expect(await bPool.feesCollectedMarket(daiAddress)).to.equal(0);
      expect(await bPool.feesCollectedMarket(erc20Token.address)).to.equal(0);
      expect(await bPool.feesCollectedOPF(daiAddress)).to.equal(0);
      expect(await bPool.feesCollectedOPF(erc20Token.address)).to.equal(0);
    });

    it("#18 - market collector withdraws fees", async () => {
      // no fees for OPF or MARKET WERE COLLECTED AT THIS POINT
      // user2 has no DT nor DAI
      expect(await erc20Token.balanceOf(user2.address)).to.equal(0);
      expect(await daiContract.balanceOf(user2.address)).to.equal(0);

      // marketFeeCollector send fees to another address
      await bPool.connect(marketFeeCollector).collectMarketFee(user2.address);

      // only marketCollector can withdraw
      await expectRevert(
        bPool.connect(user3).collectMarketFee(user3.address),
        "ONLY MARKET COLLECTOR"
      );

      // Since it's the first withdraw and user2 balances were zero, user2 balance == feesCollected
      expect(await erc20Token.balanceOf(user2.address)).to.equal(
        await bPool.feesCollectedMarket(erc20Token.address)
      );
      expect(await daiContract.balanceOf(user2.address)).to.equal(
        await bPool.feesCollectedMarket(daiAddress)
      );
    });

    it("#19 - OPF collector withdraws fees", async () => {
      // no fees for OPF WERE COLLECTED AT THIS POINT
      // opfCollector has no DT nor DAI
      expect(await erc20Token.balanceOf(opfCollector.address)).to.equal(0);
      expect(await daiContract.balanceOf(opfCollector.address)).to.equal(0);

      // opfCollector withdraws fees
      await bPool.connect(opfCollector).collectOPF(opfCollector.address);

      // only opfCollector can withdraw
      await expectRevert(
        bPool.connect(user3).collectOPF(user3.address),
        "ONLY OPF"
      );

      // Since it's the first withdraw and opf balances were zero, opf balances == feesCollected
      expect(await erc20Token.balanceOf(opfCollector.address)).to.equal(
        await bPool.feesCollectedMarket(erc20Token.address)
      );
      expect(await daiContract.balanceOf(opfCollector.address)).to.equal(
        await bPool.feesCollectedMarket(daiAddress)
      );
    });
  });
  
  describe(" Pool with NO ocean token (USDC 6 decimals) and market fee 0.1%", async () => {
    const swapFee = 1e15;
    const swapOceanFee = 0; // we attemp to set swapOceanFee at 0, will fail
    const swapMarketFee = 1e15;

    it("#4 - user3 deploys a new erc20DT, assigning himself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        cap,
        1,
        user3.address, // minter
        user6.address // feeManager
      );
      const trxReceiptERC20 = await trxERC20.wait();
      erc20Address = trxReceiptERC20.events[3].args.erc20Address;

      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);
    });

    it("#5 - user3 calls deployPool() and check ocean and market fee", async () => {
      // user3 hasn't minted any token so he can call deployPool()

      const ssDTBalance = await erc20Token.balanceOf(ssFixedRate.address);

      const initialUSDCLiquidity = 2*1e9; // 2000 usdc
      // approve exact amount
      await usdcContract
        .connect(user3)
        .approve(router.address, initialUSDCLiquidity);

      // we deploy a new pool with burnInEndBlock as 0
      receipt = await (
        await erc20Token.connect(user3).deployPool(
          ssFixedRate.address,
          usdcAddress,
          [
            web3.utils.toWei("1"), // rate
            0, // allowSell false , != 0 if true
            web3.utils.toWei("200"), // vesting amount
            500, // vested blocks
            initialUSDCLiquidity, // baseToken initial pool liquidity
          ],
          user3.address,
          [
            swapFee, //
            swapOceanFee, //
            swapMarketFee,
          ],
          marketFeeCollector.address
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

      expect(await bPool.getSwapFee()).to.equal(swapFee);
      expect(await bPool._swapOceanFee()).to.equal(1e15);
      expect(await bPool._swapMarketFee()).to.equal(swapMarketFee);

      expect(await bPool.communityFees(usdcAddress)).to.equal(0);
      expect(await bPool.communityFees(erc20Token.address)).to.equal(0);
      expect(await bPool.marketFees(usdcAddress)).to.equal(0);
      expect(await bPool.marketFees(erc20Token.address)).to.equal(0);
      expect(await bPool.feesCollectedMarket(usdcAddress)).to.equal(0);
      expect(await bPool.feesCollectedMarket(erc20Token.address)).to.equal(0);
      expect(await bPool.feesCollectedOPF(usdcAddress)).to.equal(0);
      expect(await bPool.feesCollectedOPF(erc20Token.address)).to.equal(0);
    });

    it("#6 - user4 buys some DT - exactAmountIn", async () => {
      // pool has initial ocean tokens at the beginning
      assert(
        (await usdcContract.balanceOf(bPoolAddress)) == 2*1e9 // 2000 USDC
      );

      // we approve the pool to move usdc tokens
      await usdcContract
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000"));

      // user4 has no DT before swap
      assert((await erc20Token.balanceOf(user4.address)) == 0);

      const user4DTbalance = await erc20Token.balanceOf(user4.address);
      const user4USDCBalance = await usdcContract.balanceOf(user4.address);
      const dtMarketFeeBal = await bPool.marketFees(erc20Token.address);
      const usdcMarketFeeBal = await bPool.marketFees(usdcAddress);
      const dtOPFFeeBal = await bPool.communityFees(erc20Token.address);
      const usdcOPFFeeBal = await bPool.communityFees(usdcAddress);

      const usdcAmountIn = 1e7 // 10 usdc
      receipt = await (
        await bPool.connect(user4).swapExactAmountIn(
          usdcAddress, // tokenIn
          usdcAmountIn, // tokenAmountIn
          erc20Token.address, // tokenOut
          web3.utils.toWei("1"), //minAmountOut
          web3.utils.toWei("100") //maxPrice
        )
      ).wait();
    
      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // marketFeeAmount and oceanFeeAmont have been calculated properly - ocean fee is 0.1% (set by the contracts)
      expect(1e4).to.equal(args.marketFeeAmount);
      expect(1e4).to.equal(args.oceanFeeAmount);
      expect(args.oceanFeeAmount).to.equal(args.swapFeeAmount);
      expect(1e4).to.equal(args.swapFeeAmount);

      // marketFees and opfFees accounting increased as expected , in USDC
      console.log(usdcAddress)
      console.log(args.tokenFees)
      expect(usdcAddress).to.equal(args.tokenFees);
      expect(usdcMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.marketFees(args.tokenFees)
      );
      expect(usdcOPFFeeBal.add(args.oceanFeeAmount)).to.equal(
        await bPool.communityFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;

      // CHECK SWAP BALANCES

      // user 4 usdc balance decresead properly
      expect(
        (await usdcContract.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4USDCBalance);
      // user 4 DT balance increased properly
      expect(user4DTbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await erc20Token.balanceOf(user4.address)
      );

      expect(swapArgs.tokenAmountIn.div(1e18 / swapMarketFee)).to.be.closeTo(
        args.marketFeeAmount,
        1
      );
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
      const user4USDCBalance = await usdcContract.balanceOf(user4.address);
      const dtMarketFeeBal = await bPool.marketFees(erc20Token.address);
      const usdcMarketFeeBal = await bPool.marketFees(usdcAddress);
      const dtOPFFeeBal = await bPool.communityFees(erc20Token.address);
      const usdcOPFFeeBal = await bPool.communityFees(usdcAddress);

      receipt = await (
        await bPool.connect(user4).swapExactAmountOut(
          usdcAddress, // tokenIn
          1e8,  // 100 USDC maxAmountIn
          erc20Token.address, // tokenOut
          web3.utils.toWei("10"), // tokenAmountOut
          web3.utils.toWei("10") // maxPrice
        )
      ).wait();

     

      SwapFeesEvent = receipt.events.filter((e) => e.event === "SWAP_FEES");

      const args = SwapFeesEvent[0].args;

      // marketFees and opfFees accounting increased as expected , in usdc
      expect(usdcAddress).to.equal(args.tokenFees);
      expect(usdcMarketFeeBal.add(args.marketFeeAmount)).to.equal(
        await bPool.marketFees(args.tokenFees)
      );
      expect(usdcOPFFeeBal.add(args.oceanFeeAmount)).to.equal(
        await bPool.communityFees(args.tokenFees)
      );

      SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
      const swapArgs = SwapEvent[0].args;
      // marketFeeAmount and oceanFeeAmont have been calculated properly - ocean fee is 0.1% (set by the contracts)
      expect(swapArgs.tokenAmountIn.div(1e18 / swapMarketFee)).to.be.closeTo(
        args.marketFeeAmount,
        1
      );
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
        (await usdcContract.balanceOf(user4.address)).add(swapArgs.tokenAmountIn)
      ).to.equal(user4USDCBalance);
      // user 4 DT balance increased properly
      expect(user4DTbalance.add(swapArgs.tokenAmountOut)).to.equal(
        await erc20Token.balanceOf(user4.address)
      );
    });

    it("#8 - user4 swaps some DT back to USDC swapExactAmountIn", async () => {
      assert((await bPool.isFinalized()) == true);

      await erc20Token
        .connect(user4)
        .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4USDCbalance = await usdcContract.balanceOf(user4.address);

      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountIn(
            erc20Token.address,
            web3.utils.toWei("10"), // amount in
            usdcAddress,
            1e6, // minAmountOut 1 USDC
            web3.utils.toWei("1000000000000") // maxPrice
          )
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
      expect(swapArgs.tokenAmountIn.div(1e18 / swapMarketFee)).to.be.closeTo(
        args.marketFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1000)).to.be.closeTo(
        args.oceanFeeAmount,
        1
      );
      expect(swapArgs.tokenAmountIn.div(1e18 / swapFee)).to.be.closeTo(
        args.swapFeeAmount,
        1
      );

    });

    it("#9 - user4 swaps some DT back to USDC swapExactAmountOut", async () => {
      assert((await bPool.isFinalized()) == true);

      // await erc20Token
      //   .connect(user4)
      //   .approve(bPoolAddress, web3.utils.toWei("10000000"));

      const user4DTbalance = await erc20Token.balanceOf(user4.address);

      const user4USDCbalance = await usdcContract.balanceOf(user4.address);

      const maxAmountIn =web3.utils.toWei("10")
      const amountOut = 1e6
      const maxPrice = web3.utils.toWei("1000000000000")
      receipt = await (
        await bPool
          .connect(user4)
          .swapExactAmountOut(
            erc20Token.address,
            maxAmountIn,
            usdcAddress,
            amountOut,
            maxPrice
          )
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
      console.log(swapArgs.tokenAmountIn.toString(),'dt in')
      console.log(swapArgs.tokenAmountOut.toString(),'usdc out')
      // WE CHECK FEES WERE CALCULATED PROPERLY
      expect(swapArgs.tokenAmountIn.div(1e18 / swapMarketFee)).to.be.closeTo(
        args.marketFeeAmount,
        1
      );
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
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);

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
        await bPool.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );
    });

    it("#11 - user3 adds more liquidity with joinswapExternAmountIn (only USDC)", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      //const user3Oceanbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);

      await usdcContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const usdcAmountIn = 1e8; // 100 USDC
      const minBPTOut = web3.utils.toWei("0.1");

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

      const ssFixedRateAmountIn = ssContractDTbalance.sub(
        await erc20Token.balanceOf(ssFixedRate.address)
      );

      expect(JoinEvent[1].args.tokenAmountIn).to.equal(ssFixedRateAmountIn);

      // dt amount is slightly higher because we ask for the same amount of BPT but the pool is bigger
      assert(ssFixedRateAmountIn.gt(JoinEvent[0].args.tokenAmountIn) == true);

      // we check ssContract actually moved DT and got back BPT
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance.sub(ssFixedRateAmountIn));

      const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

      expect(BPTEvent[0].args.bptAmount.add(ssContractBPTbalance)).to.equal(
        await bPool.balanceOf(ssFixedRate.address)
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
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);

      await usdcContract
        .connect(user3)
        .approve(bPool.address, web3.utils.toWei("100"));

      const BPTAmountOut = ethers.utils.parseEther("0.1");
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
        await bPool.balanceOf(ssFixedRate.address)
      );

      // and also that DT balance lowered in the ssContract
      expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );

      // no token where taken from user3.
      expect(user3DTbalance).to.equal(
        await erc20Token.balanceOf(user3.address)
      );
    });
    it("#13 - user3 removes liquidity with JoinPool, receiving both tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);

      const BPTAmountIn = ethers.utils.parseEther("0.5");
      const minAmountOut = [
         // min amount out for DT and USDC
        web3.utils.toWei("1"),
        1e6
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
        await bPool.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );
    });

    it("#14 - user3 removes liquidity with exitswapPoolAmountIn, receiving only USDC tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const BPTAmountIn = ethers.utils.parseEther("0.5");
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
        (await bPool.balanceOf(ssFixedRate.address)).add(BPTAmountIn)
      );
      // and that ssContract got back his dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(ssFixedRate.address));
    });

    it("#15 - user3 removes liquidity with exitswapPoolAmountIn, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);

      const BPTAmountIn = ethers.utils.parseEther("0.5");
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
        await bPool.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );
    });
    it("#16 - user3 removes liquidity with exitswapExternAmountOut, receiving only USDC tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);
      // NO APPROVAL FOR BPT is required

      const user3BPTbalance = await bPool.balanceOf(user3.address);
      const maxBTPIn = ethers.utils.parseEther("0.5");
      const exactUSDCOut = 1e6; // 1 usdc

      receipt = await (
        await bPool.connect(user3).exitswapExternAmountOut(
          usdcAddress,
          exactUSDCOut, // exact amount USDC out
          maxBTPIn, //max BPT token IN
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
        await bPool.balanceOf(ssFixedRate.address)
      );
      // and that we got back some dt when redeeeming BPT
      expect(
        ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)
      ).to.equal(await erc20Token.balanceOf(ssFixedRate.address));
    });

    it("#17 - user3 removes liquidity with exitswapExternAmountOut, receiving only DT tokens", async () => {
      const user3DTbalance = await erc20Token.balanceOf(user3.address);
      const user3USDCbalance = await usdcContract.balanceOf(user3.address);
      const ssContractDTbalance = await erc20Token.balanceOf(
        ssFixedRate.address
      );
      const ssContractBPTbalance = await bPool.balanceOf(ssFixedRate.address);

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
        await bPool.balanceOf(ssFixedRate.address)
      );

      expect(ssContractDTbalance).to.equal(
        await erc20Token.balanceOf(ssFixedRate.address)
      );
    });

    it("#18 - we check again no ocean and market fees were accounted", async () => {
      expect(await bPool._swapOceanFee()).to.equal(1e15);
      expect(await bPool._swapMarketFee()).to.equal(swapMarketFee);

      // ocean fee actually collected some fees
      assert((await bPool.communityFees(usdcAddress)).gt(0) == true);
      assert((await bPool.communityFees(erc20Token.address)).gt(0) == true);
      // market fee actually collected some fees
      // TODO: add more detailed test on this.
      assert((await bPool.marketFees(usdcAddress)).gt(0) == true);
      assert((await bPool.marketFees(erc20Token.address)).gt(0) == true);

      expect(await bPool.feesCollectedMarket(usdcAddress)).to.equal(0);
      expect(await bPool.feesCollectedMarket(erc20Token.address)).to.equal(0);
      expect(await bPool.feesCollectedOPF(usdcAddress)).to.equal(0);
      expect(await bPool.feesCollectedOPF(erc20Token.address)).to.equal(0);
    });

    it("#19 - market collector withdraws fees", async () => {
      // no fees for OPF or MARKET WERE COLLECTED AT THIS POINT
      // user2 has no DT nor USDC
      expect(await erc20Token.balanceOf(user2.address)).to.equal(0);
      expect(await usdcContract.balanceOf(user2.address)).to.equal(0);

      // marketFeeCollector send fees to another address
      await bPool.connect(marketFeeCollector).collectMarketFee(user2.address);

      // only marketCollector can withdraw
      await expectRevert(
        bPool.connect(user3).collectMarketFee(user3.address),
        "ONLY MARKET COLLECTOR"
      );

      // Since it's the first withdraw and user2 balances were zero, user2 balance == feesCollected
      expect(await erc20Token.balanceOf(user2.address)).to.equal(
        await bPool.feesCollectedMarket(erc20Token.address)
      );
      expect(await usdcContract.balanceOf(user2.address)).to.equal(
        await bPool.feesCollectedMarket(usdcAddress)
      );
    });

    it("#20 - OPF collector withdraws fees", async () => {
      // no fees for OPF WERE COLLECTED AT THIS POINT
      // opfCollector has no DT nor DAI
      expect(await erc20Token.balanceOf(opfCollector.address)).to.equal(0);
      expect(await usdcContract.balanceOf(opfCollector.address)).to.equal(0);

      // opfCollector withdraws fees
      await bPool.connect(opfCollector).collectOPF(opfCollector.address);

      // only opfCollector can withdraw
      await expectRevert(
        bPool.connect(user3).collectOPF(user3.address),
        "ONLY OPF"
      );

      // Since it's the first withdraw and opf balances were zero, opf balances == feesCollected
      expect(await erc20Token.balanceOf(opfCollector.address)).to.equal(
        await bPool.feesCollectedMarket(erc20Token.address)
      );
      expect(await usdcContract.balanceOf(opfCollector.address)).to.equal(
        await bPool.feesCollectedMarket(usdcAddress)
      );
    });
  });
});
