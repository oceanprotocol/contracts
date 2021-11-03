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
const {getEventFromTx} = require("../helpers/utils")
const constants = require("../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const ether = require("@openzeppelin/test-helpers/src/ether");
const ethers = hre.ethers;

describe("1SS flow", () => {
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
    sideStaking,
    router,
    poolTemplate,
    bPoolAddress,
    bPool,
    signer,
    dtIndex = null,
    oceanIndex = null,
    daiIndex = null,
    cap = web3.utils.toWei("100000");

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
   

    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("SideStaking");
    const BPool = await ethers.getContractFactory("BPool");

    console.log(await provider.getBlockNumber());

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
      opfCollector // POOL2
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

    console.log((await daiContract.balanceOf(user3.address)).toString());

    // assert(
    //   (await daiContract.balanceOf(user3.address)).toString() ==
    //     ethers.utils.parseEther("10005")
    // );

    data = web3.utils.asciiToHex("SomeData");
    flags = web3.utils.asciiToHex(constants.blob[0]);

    poolTemplate = await BPool.deploy();

    // DEPLOY ROUTER, SETTING OWNER
    router = await Router.deploy(
      owner.address,
      oceanAddress,
      poolTemplate.address, // pooltemplate field, unused in this test
      opfCollector.address,
      []
    );

    sideStaking = await SSContract.deploy(router.address);

  
    templateERC20 = await ERC20Template.deploy();

    
    // SETUP ERC721 Factory with template
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      templateERC20.address,
      communityFeeCollector,
      router.address
    );

    
    // SET REQUIRED ADDRESS
    await router.addFactory(factoryERC721.address);
      
    await router.addSSContract(sideStaking.address)
  });
  const swapFee = 1e15;
    const swapOceanFee = 1e15;
    const swapMarketFee = 1e15;
  const vestedBlocks = 2500000
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
    const event = getEventFromTx(txReceipt,'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
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

    const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1","ERC20DT1Symbol"],
      [user3.address,user6.address, user3.address,'0x0000000000000000000000000000000000000000'],
      [cap,0],
      []
    );
    const trxReceiptERC20 = await trxERC20.wait();
    const event = getEventFromTx(trxReceiptERC20,'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    erc20Address = event.args[0];

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
    assert((await erc20Token.permissions(user3.address)).minter == true);
  });

  it("#4 - user3 calls deployPool() and check ocean and market fee", async () => {
    
    const ssDTBalance = await erc20Token.balanceOf(sideStaking.address)
    
    const initialOceanLiquidity = web3.utils.toWei("2000")
    const initialDTLiquidity = initialOceanLiquidity
    // approve exact amount
    await oceanContract
      .connect(user3)
      .approve(router.address, web3.utils.toWei("2000"));

    // we deploy a new pool with burnInEndBlock as 0
     // we deploy a new pool
     receipt = await (
      await erc20Token.connect(user3).deployPool(
      //  sideStaking.address,
       // oceanAddress,
        [
          web3.utils.toWei("1"), // rate
          18, // basetokenDecimals
          web3.utils.toWei('10000'), //vestingAmount max 10% of total cap
          vestedBlocks, // vested blocks
          initialOceanLiquidity, // baseToken initial pool liquidity
        ],
       // user3.address,
        [
          swapFee, //
          swapMarketFee,
        ],
       // marketFeeCollector.address,
      //  user3.address// publisher address (vested token)
        [sideStaking.address,oceanAddress,user3.address,user3.address,marketFeeCollector.address,poolTemplate.address]
      )
    ).wait();
    const initialBlockNum = await ethers.provider.getBlockNumber()
    //console.log(receipt)
    const PoolEvent = receipt.events.filter((e) => e.event === "NewPool");
    // console.log(PoolEvent[0].args)

    assert(PoolEvent[0].args.ssContract == sideStaking.address);

    bPoolAddress = PoolEvent[0].args.poolAddress;

    bPool = await ethers.getContractAt("BPool", bPoolAddress);

    assert((await bPool.isFinalized()) == true);

    expect(
      await erc20Token.balanceOf(sideStaking.address))
       .to.equal(web3.utils.toWei("98000"))

    expect(await bPool.getOPFFee()).to.equal(0)
    expect(await bPool._swapMarketFee()).to.equal(swapMarketFee)

    expect(await bPool.communityFees(oceanAddress)).to.equal(0)
    expect(await bPool.communityFees(erc20Token.address)).to.equal(0)
    expect(await bPool.marketFees(oceanAddress)).to.equal(0)
    expect(await bPool.marketFees(erc20Token.address)).to.equal(0)
    
    expect(await sideStaking.getDataTokenCirculatingSupply(erc20Token.address)).to.equal(web3.utils.toWei('12000'))
    expect(await sideStaking.getDataTokenCurrentCirculatingSupply(erc20Token.address) ).to.equal(initialDTLiquidity)
    expect(await sideStaking.getBaseTokenAddress(erc20Token.address)).to.equal(oceanAddress)
    expect(await sideStaking.getPoolAddress(erc20Token.address)).to.equal(bPoolAddress)
    expect(await sideStaking.getPublisherAddress(erc20Token.address)).to.equal(user3.address)
    expect(await sideStaking.getBaseTokenBalance(oceanAddress)).to.equal(0)
    expect(await sideStaking.getDataTokenBalance(erc20Token.address)).to.equal(web3.utils.toWei('88000'))
    expect(await sideStaking.getvestingAmountSoFar(erc20Token.address)).to.equal(0)
    expect(await sideStaking.getvestingAmount(erc20Token.address)).to.equal(web3.utils.toWei('10000'))
    expect(await sideStaking.getvestingLastBlock(erc20Token.address)).to.equal(initialBlockNum)
    expect(await sideStaking.getvestingEndBlock(erc20Token.address)).to.equal(initialBlockNum+vestedBlocks)

    
  });

  it("#5 - user3 fails to mints new erc20 tokens even if it's minter", async () => {
    assert((await erc20Token.permissions(user3.address)).minter == true);

    await expectRevert(
      erc20Token.connect(user3).mint(user3.address, web3.utils.toWei("10000")),
      "DataTokenTemplate: cap exceeded"
    );

    assert((await erc20Token.balanceOf(user3.address)) == 0);
  });


  it("#6 - user4 buys some DT after burnIn period- exactAmountIn", async () => {
    // pool has initial ocean tokens at the beginning
    assert(
      (await oceanContract.balanceOf(bPoolAddress)) == web3.utils.toWei("2000")
    );

    // we approve the pool to move Ocean tokens
    await oceanContract
      .connect(user4)
      .approve(bPoolAddress, web3.utils.toWei("10000"));

  
    // user4 has no DT before swap
    assert((await erc20Token.balanceOf(user4.address)) == 0);

    
    await bPool.connect(user4).swapExactAmountIn(
      oceanAddress, // tokenIn
      web3.utils.toWei("10"), // tokenAmountIn
      erc20Token.address, // tokenOut
      web3.utils.toWei("1"), //minAmountOut
      web3.utils.toWei("100") //maxPrice
    );

    // user4 got his DT
    assert((await erc20Token.balanceOf(user4.address)) > 0);
  });

  it("#7 - user4 buys some DT after burnIn period - exactAmountOut", async () => {
    // we already approved pool to withdraw Ocean tokens

    // user only has DT from previous test
    const user4DTbalance = await erc20Token.balanceOf(user4.address);
    console.log(user4DTbalance.toString());

    
    await bPool.connect(user4).swapExactAmountOut(
      oceanAddress, // tokenIn
      web3.utils.toWei("100"), // maxAmountIn
      erc20Token.address, // tokenOut
      web3.utils.toWei("10"), // tokenAmountOut
      web3.utils.toWei("10") // maxPrice
    );

    // user4 got his DT
    console.log((await erc20Token.balanceOf(user4.address)).toString());
    assert(
      parseInt(await erc20Token.balanceOf(user4.address)) >
        parseInt(user4DTbalance)
    );
  });

  it("#8 - user4 swaps some DT back to Ocean swapExactAmountIn", async () => {
    assert((await bPool.isFinalized()) == true);

    await erc20Token
      .connect(user4)
      .approve(bPoolAddress, web3.utils.toWei("10000000"));

    const user4DTbalance = await erc20Token.balanceOf(user4.address);

    const user4Oceanbalance = await oceanContract.balanceOf(user4.address);

    receipt = await (
      await bPool
        .connect(user4)
        .swapExactAmountIn(
          erc20Token.address,
          web3.utils.toWei("10"),
          oceanAddress,
          web3.utils.toWei("1"),
          web3.utils.toWei("10")
        )
    ).wait();

    const SwapEvent = receipt.events.filter((e) => e.event === "LOG_SWAP");
   

    //console.log(SwapEvent)
    assert(
      parseInt(await erc20Token.balanceOf(user4.address)) <
        parseInt(user4DTbalance)
    );
    assert(
      parseInt(await oceanContract.balanceOf(user4.address)) >
        parseInt(user4Oceanbalance)
    );
  });

  it("#9 - user4 adds more liquidity with joinPool() (adding both tokens)", async () => {
    const user4DTbalance = await erc20Token.balanceOf(user4.address);
    const user4Oceanbalance = await oceanContract.balanceOf(user4.address);
    const user4BPTbalance = await bPool.balanceOf(user4.address);
    const ssContractDTbalance = await erc20Token.balanceOf(sideStaking.address);
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
    const ssContractDTbalance = await erc20Token.balanceOf(sideStaking.address);
    const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

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

    expect(JoinEvent[1].args.tokenIn).to.equal(erc20Token.address)
    
    const sideStakingAmountIn = ssContractDTbalance.sub(
      await erc20Token.balanceOf(sideStaking.address)
    );
    
    expect(JoinEvent[1].args.tokenAmountIn).to.equal(sideStakingAmountIn);

   


    // we check ssContract actually moved DT and got back BPT
    expect(ssContractDTbalance.sub(JoinEvent[1].args.tokenAmountIn)).to.equal(await erc20Token.balanceOf(sideStaking.address))
  
    expect(ssContractDTbalance.sub(sideStakingAmountIn))
    
    const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

    expect(BPTEvent[0].args.bptAmount.add(ssContractBPTbalance)).to.equal(await bPool.balanceOf(sideStaking.address))
   
    // no dt token where taken from user3
    expect(await erc20Token.balanceOf(user3.address)).to.equal(user3DTbalance)
    
  });

  it("#11 - user3 adds more liquidity with joinswapPoolAmountOut (only OCEAN)", async () => {
    const user3DTbalance = await erc20Token.balanceOf(user3.address);
    const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
    const user3BPTbalance = await bPool.balanceOf(user3.address);
    const ssContractDTbalance = await erc20Token.balanceOf(sideStaking.address);
    const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);

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
      await bPool.balanceOf(sideStaking.address)
    );

    // and also that DT balance lowered in the ssContract
    expect(ssContractDTbalance.sub( JoinEvent[1].args.tokenAmountIn)).to.equal(await erc20Token.balanceOf(sideStaking.address))
    
    // no token where taken from user3.
    expect(user3DTbalance).to.equal(await erc20Token.balanceOf(user3.address))
    
  });
  it("#12 - user3 removes liquidity with JoinPool, receiving both tokens", async () => {
    const user3DTbalance = await erc20Token.balanceOf(user3.address);
    const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
    const ssContractDTbalance = await erc20Token.balanceOf(sideStaking.address);
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
      await bPool.balanceOf(sideStaking.address)
    );

    expect(ssContractDTbalance).to.equal(
      await erc20Token.balanceOf(sideStaking.address)
    );
  });

  it("#13 - user3 removes liquidity with exitswapPoolAmountIn, receiving only OCEAN tokens", async () => {
    const user3DTbalance = await erc20Token.balanceOf(user3.address);
    const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
    const ssContractDTbalance = await erc20Token.balanceOf(sideStaking.address);
    const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
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

    expect(
      await erc20Token.balanceOf(user3.address)).to.equal(user3DTbalance)
  

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

    // NOW we check the ssContract BPT balance
    expect(ssContractBPTbalance).to.equal(
      (await bPool.balanceOf(sideStaking.address)).add(BPTAmountIn)
    );
    // and that ssContract got back his dt when redeeeming BPT
    expect(
      ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)).to.equal(await erc20Token.balanceOf(sideStaking.address))
    
  });

  it("#14 - user3 removes liquidity with exitswapPoolAmountIn, receiving only DT tokens", async () => {
    const user3DTbalance = await erc20Token.balanceOf(user3.address);
    const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
    const ssContractDTbalance = await erc20Token.balanceOf(sideStaking.address);
    const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
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

    expect(await oceanContract.balanceOf(user3.address)).to.equal(user3Oceanbalance)
        
    const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

    expect(await bPool.balanceOf(user3.address)).to.equal(user3BPTbalance.sub((BPTEvent[0].args.bptAmount))
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
  it("#15 - user3 removes liquidity with exitswapExternAmountOut, receiving only OCEAN tokens", async () => {
    const user3DTbalance = await erc20Token.balanceOf(user3.address);
    const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
    const ssContractDTbalance = await erc20Token.balanceOf(sideStaking.address);
    const ssContractBPTbalance = await bPool.balanceOf(sideStaking.address);
    // NO APPROVAL FOR BPT is required

    const user3BPTbalance = await bPool.balanceOf(user3.address);
    const maxBTPIn = ethers.utils.parseEther("0.5");
    const exactOceanOut = ethers.utils.parseEther("1");

    receipt = await (
      await bPool.connect(user3).exitswapExternAmountOut(
        oceanAddress,
        maxBTPIn, //max BPT token IN
        exactOceanOut // exact amount OCEAN out
      )
    ).wait();

    expect(
     await erc20Token.balanceOf(user3.address)).to.equal(user3DTbalance)
    
    const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");

    expect(await bPool.balanceOf(user3.address)).to.equal(user3BPTbalance.sub(BPTEvent[0].args.bptAmount))
    

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
    expect(ssContractBPTbalance.sub(BPTEvent[0].args.bptAmount)).to.equal(await bPool.balanceOf(sideStaking.address))
    // and that we got back some dt when redeeeming BPT
    expect(ssContractDTbalance.add(ExitEvent[1].args.tokenAmountOut)).to.equal(await erc20Token.balanceOf(sideStaking.address))
    
  });

  it("#16 - user3 removes liquidity with exitswapExternAmountOut, receiving only DT tokens", async () => {
    const user3DTbalance = await erc20Token.balanceOf(user3.address);
    const user3Oceanbalance = await oceanContract.balanceOf(user3.address);
    const ssContractDTbalance = await erc20Token.balanceOf(sideStaking.address);
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

    // OCEAN BALANCE DOESN"T CHANGE
    expect(await oceanContract.balanceOf(user3.address)).to.equal(user3Oceanbalance);

    const BPTEvent = receipt.events.filter((e) => e.event === "LOG_BPT");
    // BPT balance decrease
    expect(await bPool.balanceOf(user3.address)).to.equal(user3BPTbalance.sub(BPTEvent[0].args.bptAmount))
    

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

  it("#17 - we check again no ocean and market fees were accounted", async () => {
   
    expect(await bPool.getOPFFee()).to.equal(0)
    expect(await bPool._swapMarketFee()).to.equal(swapMarketFee)

    expect(await bPool.communityFees(oceanAddress)).to.equal(0)
    expect(await bPool.communityFees(erc20Token.address)).to.equal(0)
    expect(await bPool.marketFees(oceanAddress)).gt(0)
    expect(await bPool.marketFees(erc20Token.address)).gt(0)
   
    
  });
});
