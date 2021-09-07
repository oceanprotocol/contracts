/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect, should, be } = require("chai");
const {
  expectRevert,
  expectEvent,
  time,
} = require("@openzeppelin/test-helpers");
const { impersonate } = require("../helpers/impersonate");
const constants = require("../helpers/constants");
const { web3, BN } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const { MAX_UINT256 } = require("@openzeppelin/test-helpers/src/constants");
const ethers = hre.ethers;

// TEST NEW FUNCTIONS, FOR UNIT TEST REFER TO V3 CONTRACTS BRANCH
describe("FixedRateExchange", () => {
  let alice, // DT Owner and exchange Owner
    exchangeOwner,
    bob, // BaseToken Holder
    fixedRateExchange,
    rate,
    MockERC20,
    metadata,
    tokenERC721,
    tokenAddress,
    data,
    flags,
    factoryERC721,
    templateERC721,
    templateERC20,
    erc20Token,
    oceanContract,
    oceanOPFBalance,
    daiContract,
    usdcContract,
    ssFixedRate,
    router,
    signer,
    amountDT,
    marketFee = 1e15, // 0.1%
    oceanFee = 1e15; // 0.1%
  (dtIndex = null),
    (oceanIndex = null),
    (daiIndex = null),
    (cap = web3.utils.toWei("100000"));

  const oceanAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
  const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
  const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  before("init contracts for each test", async () => {
    MockERC20 = await ethers.getContractFactory("MockERC20Decimals");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );

    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");

    const Metadata = await ethers.getContractFactory("Metadata");
    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("ssFixedRate");

    [
      owner, // nft owner, 721 deployer
      reciever,
      user2, // 721Contract manager
      user3, // alice, exchange owner
      user4,
      user5,
      user6,
      marketFeeCollector,
      newMarketFeeCollector,
      opfCollector,
    ] = await ethers.getSigners();

    alice = user3;
    exchangeOwner = user3;
    bob = user4;

    rate = web3.utils.toWei("1");

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
      .transfer(bob.address, ethers.utils.parseEther("100000"));

    assert(
      (await oceanContract.balanceOf(bob.address)).toString() ==
        ethers.utils.parseEther("100000")
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
      .transfer(bob.address, ethers.utils.parseEther("100000"));

    expect(await daiContract.balanceOf(bob.address)).to.equal(
      ethers.utils.parseEther("100000")
    );

    // GET SOME USDC (token with !18 decimals (6 in this case))
    const userWithUSDC = "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503";

    await impersonate(userWithUSDC);

    usdcContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      usdcAddress
    );

    signer = ethers.provider.getSigner(userWithUSDC);

    const amount = 1e11; // 100000 USDC

    await usdcContract.connect(signer).transfer(bob.address, amount);

    expect(await usdcContract.balanceOf(bob.address)).to.equal(amount);

    data = web3.utils.asciiToHex("SomeData");
    flags = web3.utils.asciiToHex(constants.blob[0]);

    // DEPLOY ROUTER, SETTING OWNER
    router = await Router.deploy(
      owner.address,
      oceanAddress,
      oceanAddress, // pooltemplate field, unused in this test
      ssFixedRate.address,
      opfCollector.address,
      []
    );

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
    console.log(fixedRateExchange.address);
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

  describe("#1 - Exchange with baseToken(OCEAN) 18 Decimals and dataToken 18 Decimals, RATE = 1", async () => {
    let amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
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

      await erc20Token.connect(alice).mint(alice.address, cap);
      expect(await erc20Token.balanceOf(alice.address)).to.equal(cap);

      mockDT18 = erc20Token;
    });

    it("#2 - create exchange", async () => {
      receipt = await (
        await mockDT18
          .connect(alice)
          .createFixedRate(
            oceanContract.address,
            18,
            rate,
            alice.address,
            marketFee,
            marketFeeCollector.address
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      expect(eventsExchange[0].args.basetoken).to.equal(oceanContract.address);
      expect(eventsExchange[0].args.owner).to.equal(alice.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(0);
      expect(exchangeDetails.btSupply).to.equal(0);
    });

    it("#5 - alice and bob approve contracts to spend tokens", async () => {
      // alice approves how many DT tokens wants to sell
      // alice only approves an exact amount so we can check supply etc later in the test
      await mockDT18
        .connect(alice)
        .approve(fixedRateExchange.address, amountDTtoSell);

      // bob approves a big amount so that we don't need to re-approve during test
      await oceanContract
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("1000000"));
    });

    it("#6 - should check that the exchange has supply and fees setup ", async () => {
      // NOW dtSupply has increased (because alice(exchangeOwner) approved DT). Bob approval has no effect on this
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(amountDTtoSell);
      expect(exchangeDetails.btSupply).to.equal(0);
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );
      expect(feeInfo.marketFee).to.equal(marketFee);
      expect(feeInfo.marketFeeCollector).to.equal(marketFeeCollector.address);
      expect(feeInfo.opfFee).to.equal(0);
      expect(feeInfo.marketFeeAvailable).to.equal(0);
      expect(feeInfo.oceanFeeAvailable).to.equal(0);
    });

    it("#7 - should get the exchange rate", async () => {
      assert(
        web3.utils.toWei(
          web3.utils.fromWei(
            (
              await fixedRateExchange.getRate(eventsExchange[0].args.exchangeId)
            ).toString()
          )
        ) === rate
      );
    });

    it("#8 - Bob should buy ALL DataTokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(0); // Alice(owner) has no BT

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.dataTokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetails.btSupply).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );

      // Bob bought all DT on sale so now dtSupply is ZERO
      expect(exchangeDetails.dtSupply).to.equal(0);

      // we also check DT and BT balances were accounted properly
      expect(exchangeDetails.btBalance).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );
      expect(exchangeDetails.dtBalance).to.equal(0);
    });

    it("#9 - Bob sells ALL DataTokens he has", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await oceanContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(0); // Alice(owner) has no BT

      // BOB approves FixedRate to move his DTs
      await mockDT18
        .connect(bob)
        .approve(fixedRateExchange.address, dtBobBalanceBeforeSwap);

      // BOB is going to sell all DTs available
      amountDT = dtBobBalanceBeforeSwap;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // oceanFeeAmount is always zero in this pool
      expect(args.oceanFeeAmount).to.equal(0);

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .add(args.oceanFeeAmount)
          .add(args.marketFeeAmount)
      ).to.equal(args.dataTokenSwappedAmount);

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(0);
      expect(await oceanContract.balanceOf(bob.address)).to.equal(
        btBobBalanceBeforeSwap.add(SwappedEvent[0].args.baseTokenSwappedAmount)
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // THERE ARE NO MORE BASE TOKEN available
      expect(exchangeDetails.btSupply).to.equal(0);

      // Bob sold all DT on sale so now dtSupply is back
      expect(exchangeDetails.dtSupply).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount
      );

      // ALICE's DT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#10 - Bob changes his mind and buys back 20% of DataTokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(0); // Alice(owner) has no BT

      // BOB is going to buy20% of  all DT availables
      amountDT = web3.utils.toWei("2000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // oceanFeeAmount is always zero in this pool
      expect(args.oceanFeeAmount).to.equal(0);

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.dataTokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.baseTokenSwappedAmount);

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // this time DT are on the contract so the balance is updated properly
      expect(exchangeDetailsAfter.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );
    });

    it("#11 - Alice withdraws BT balance available on the FixedRate contract", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetailsBefore.btBalance).to.equal(
        web3.utils.toWei("2000")
      );

      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(0); // Alice(owner) has no BT

      // only exchange owner can withdraw
      await expectRevert(
        fixedRateExchange.collectBT(eventsExchange[0].args.exchangeId),
        "FixedRateExchange: invalid exchange owner"
      );

      const receipt = await (
        await fixedRateExchange
          .connect(alice)
          .collectBT(eventsExchange[0].args.exchangeId)
      ).wait();

      const Event = receipt.events.filter((e) => e.event === "TokenCollected");

      expect(Event[0].args.amount).to.equal(
        btAliceBeforeSwap.add(await oceanContract.balanceOf(alice.address))
      );

      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // alice withdrew all btBalance
      expect(exchangeDetailsAfter.btBalance).to.equal(0);
    });

    it("#12 - Bob buys back all DT left (80%) of DataTokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(web3.utils.toWei("2000")); // BOB HAS 20% of initial DT available
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2000")); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy 80% of  all DT availables
      amountDT = web3.utils.toWei("8000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // btSupply was ZERO, then bob bought and supply increased
      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.baseTokenSwappedAmount);

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // this time DT are on the contract so the balance is updated properly
      expect(exchangeDetailsAfter.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );
    });

    it("#13 - MarketFeeCollector withdraws fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      expect(feeInfo.oceanFeeAvailable).to.equal(0);

      assert(feeInfo.marketFeeAvailable > 0);

      // marketFeeCollector balance (in Ocean is zero)
      const btMFCBeforeSwap = await oceanContract.balanceOf(
        marketFeeCollector.address
      );

      expect(btMFCBeforeSwap).to.equal(0);

      const receipt = await (
        await fixedRateExchange.collectMarketFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "MarketFeeCollected"
      );

      // balance in ocean was transferred
      expect(
        await oceanContract.balanceOf(marketFeeCollector.address)
      ).to.equal(btMFCBeforeSwap.add(Event[0].args.feeAmount));

      expect(Event[0].args.feeToken).to.equal(oceanContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee were reset
      expect(feeInfoAfter.marketFeeAvailable).to.equal(0);
    });

    it("#14 - Bob attermps to buy more DT but fails, then alice approves more and he succeeds", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(amountDTtoSell); // BOB HAS 100% of initial DT available
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2000")); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy more DT but fails because alice hasn't approved more
      amountDT = web3.utils.toWei("8000");

      expect(exchangeDetailsBefore.dtSupply).to.equal(0);

      await expectRevert(
        fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT),
        "ERC20: transfer amount exceeds allowance"
      );

      // now alice approves more DT (8000)

      await mockDT18
        .connect(alice)
        .approve(fixedRateExchange.address, amountDT);

      expect(
        (await fixedRateExchange.getExchange(eventsExchange[0].args.exchangeId))
          .dtSupply
      ).to.equal(amountDT);

      // Now bob can buy
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      // console.log(receipt)
      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btSupply.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // Bob bought again all DT on sale so now dtSupply is 0
      expect(exchangeDetailsAfter.dtSupply).to.equal(0);

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // no DT are available in internal balance
      expect(exchangeDetailsAfter.dtBalance).to.equal(0);
    });

    it("#15 - Bob sells again some of his DataTokens", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await oceanContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      const dtAliceBeforeSwap = await mockDT18.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2000")); // Alice(owner) has no BT

      amountDT = web3.utils.toWei("2000");
      // BOB approves FixedRate to move his DTs
      await mockDT18.connect(bob).approve(fixedRateExchange.address, amountDT);

      // BOB is going to sell all DTs available

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount);

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.dataTokenSwappedAmount)
      );
      expect(await oceanContract.balanceOf(bob.address)).to.equal(
        btBobBalanceBeforeSwap.add(SwappedEvent[0].args.baseTokenSwappedAmount)
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // Less BT token are available
      expect(
        exchangeDetails.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btSupply.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // Bob sold some of his DTs so now dtSupply increased
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.add(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check DT and BT balances were accounted properly
      // BT doesn't go to Alice but stays in the fixedRate
      expect(
        exchangeDetails.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.add(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // ALICE's BT balance hasn't decreased
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // ALICE's DT balance hasn't increased
      expect(await mockDT18.balanceOf(alice.address)).to.equal(
        dtAliceBeforeSwap
      );
    });

    it("#16 - MarketFeeCollector updates new address then withdraws fees available on the FixedRate contract", async () => {
      // only market collector can update the address
      await expectRevert(
        fixedRateExchange.updateMarketFeeCollector(
          eventsExchange[0].args.exchangeId,
          newMarketFeeCollector.address
        ),
        "not marketFeeCollector"
      );

      await fixedRateExchange
        .connect(marketFeeCollector)
        .updateMarketFeeCollector(
          eventsExchange[0].args.exchangeId,
          newMarketFeeCollector.address
        );

      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      expect(feeInfo.oceanFeeAvailable).to.equal(0);

      assert(feeInfo.marketFeeAvailable > 0);

      expect(feeInfo.marketFeeCollector).to.equal(
        newMarketFeeCollector.address
      );

      const btMFCBeforeSwap = await oceanContract.balanceOf(
        newMarketFeeCollector.address
      );

      expect(btMFCBeforeSwap).to.equal(0);

      const receipt = await (
        await fixedRateExchange.collectMarketFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "MarketFeeCollected"
      );

      // balance in ocean was transferred
      expect(
        await oceanContract.balanceOf(newMarketFeeCollector.address)
      ).to.equal(btMFCBeforeSwap.add(Event[0].args.feeAmount));

      expect(Event[0].args.feeToken).to.equal(oceanContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee were reset
      expect(feeInfoAfter.marketFeeAvailable).to.equal(0);
    });
  });

  describe("#2 - Exchange with baseToken(DAI) 18 Decimals and dataToken 18 Decimals RATE = 1 ", async () => {
    let maxAmountBTtoSell = web3.utils.toWei("100000"), // bigger than required amount
      amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
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

      await erc20Token.connect(alice).mint(alice.address, cap);
      expect(await erc20Token.balanceOf(alice.address)).to.equal(cap);

      mockDT18 = erc20Token;
    });

    it("#2 - create exchange", async () => {
      receipt = await (
        await mockDT18
          .connect(alice)
          .createFixedRate(
            daiContract.address,
            18,
            rate,
            alice.address,
            marketFee,
            marketFeeCollector.address
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      expect(eventsExchange[0].args.basetoken).to.equal(daiContract.address);
      expect(eventsExchange[0].args.owner).to.equal(alice.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(0);
      expect(exchangeDetails.btSupply).to.equal(0);
    });

    it("#5 - alice and bob approve contracts to spend tokens", async () => {
      // alice approves how many DT tokens wants to sell
      // we only approve an exact amount
      await mockDT18
        .connect(alice)
        .approve(fixedRateExchange.address, amountDTtoSell);

      // bob approves a big amount so that we don't need to re-approve during test
      await daiContract
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("1000000"));
    });

    it("#6 - should check that the exchange has supply and fees setup ", async () => {
      // NOW dtSupply has increased (because alice(exchangeOwner) approved DT). Bob approval has no effect on this
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(amountDTtoSell);
      expect(exchangeDetails.btSupply).to.equal(0);
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );
      expect(feeInfo.marketFee).to.equal(marketFee);
      expect(feeInfo.marketFeeCollector).to.equal(marketFeeCollector.address);
      expect(feeInfo.opfFee).to.equal(oceanFee);
      expect(feeInfo.marketFeeAvailable).to.equal(0);
      expect(feeInfo.oceanFeeAvailable).to.equal(0);
    });

    it("#7 - should get the exchange rate", async () => {
      assert(
        web3.utils.toWei(
          web3.utils.fromWei(
            (
              await fixedRateExchange.getRate(eventsExchange[0].args.exchangeId)
            ).toString()
          )
        ) === rate
      );
    });

    it("#8 - Bob should buy ALL DataTokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      // alice has as default 5 DAI
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("5"));

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.dataTokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetails.btSupply).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );

      // Bob bought all DT on sale so now dtSupply is ZERO
      expect(exchangeDetails.dtSupply).to.equal(0);

      // we also check DT and BT balances were accounted properly
      expect(exchangeDetails.btBalance).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );
      expect(exchangeDetails.dtBalance).to.equal(0);
    });

    it("#9 - Bob sells ALL DataTokens he has", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await daiContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      // alice has as default 5 DAI
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("5"));

      // BOB approves FixedRate to move his DTs
      await mockDT18
        .connect(bob)
        .approve(fixedRateExchange.address, dtBobBalanceBeforeSwap);

      // BOB is going to sell all DTs available
      amountDT = dtBobBalanceBeforeSwap;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .add(args.oceanFeeAmount)
          .add(args.marketFeeAmount)
      ).to.equal(args.dataTokenSwappedAmount);

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(0);
      expect(await daiContract.balanceOf(bob.address)).to.equal(
        btBobBalanceBeforeSwap.add(SwappedEvent[0].args.baseTokenSwappedAmount)
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // THERE ARE NO MORE BASE TOKEN available
      expect(exchangeDetails.btSupply).to.equal(0);

      // Bob sold all DT on sale so now dtSupply is back
      expect(exchangeDetails.dtSupply).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount
      );
      // ALICE's DT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#10 - Bob changes his mind and buys back 20% of DataTokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      // alice has as default 5 DAI
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("5"));

      // BOB is going to buy20% of  all DT availables
      amountDT = web3.utils.toWei("2000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.dataTokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.baseTokenSwappedAmount);

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // this time DT are on the contract so the balance is updated properly
      expect(exchangeDetailsAfter.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );
    });

    it("#11 - Alice withdraws BT balance available on the FixedRate contract", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetailsBefore.btBalance).to.equal(
        web3.utils.toWei("2000")
      );

      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);

      // alice has as default 5 DAI
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("5"));

      // only exchange owner can withdraw
      await expectRevert(
        fixedRateExchange.collectBT(eventsExchange[0].args.exchangeId),
        "FixedRateExchange: invalid exchange owner"
      );

      const receipt = await (
        await fixedRateExchange
          .connect(alice)
          .collectBT(eventsExchange[0].args.exchangeId)
      ).wait();

      const Event = receipt.events.filter((e) => e.event === "TokenCollected");

      expect(Event[0].args.amount.add(btAliceBeforeSwap)).to.equal(
        await daiContract.balanceOf(alice.address)
      );

      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // alice withdrew all btBalance
      expect(exchangeDetailsAfter.btBalance).to.equal(0);
    });

    it("#12 - Bob buys back all DT left (80%) of DataTokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(web3.utils.toWei("2000")); // BOB HAS 20% of initial DT available
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2005")); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy 80% of  all DT availables
      amountDT = web3.utils.toWei("8000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      // console.log(receipt)
      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // btSupply was ZERO, then bob bought and supply increased
      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.baseTokenSwappedAmount);

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // this time DT are on the contract so the balance is updated properly
      expect(exchangeDetailsAfter.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );
    });

    it("#13 - MarketFeeCollector withdraws fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // there are fee to collect both for opf and market
      assert(feeInfo.oceanFeeAvailable > 0);

      assert(feeInfo.marketFeeAvailable > 0);

      // marketFeeCollector balance in DAI is zero
      const btMFCBeforeSwap = await daiContract.balanceOf(
        marketFeeCollector.address
      );

      expect(btMFCBeforeSwap).to.equal(0);

      const receipt = await (
        await fixedRateExchange.collectMarketFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "MarketFeeCollected"
      );

      // balance in ocean was transferred
      expect(await daiContract.balanceOf(marketFeeCollector.address)).to.equal(
        btMFCBeforeSwap.add(Event[0].args.feeAmount)
      );

      expect(Event[0].args.feeToken).to.equal(daiContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee were reset
      expect(feeInfoAfter.marketFeeAvailable).to.equal(0);
    });

    it("#14 - OPFFeeCollector withdraws fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      assert(feeInfo.oceanFeeAvailable > 0);

      // opfFeeCollector balance is ZERO (in Dai)
      const btOPFBeforeSwap = await daiContract.balanceOf(opfCollector.address);

      expect(btOPFBeforeSwap).to.equal(0);

      const receipt = await (
        await fixedRateExchange.collectOceanFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "OceanFeeCollected"
      );

      // balance in dai was transferred
      expect(await daiContract.balanceOf(opfCollector.address)).to.equal(
        btOPFBeforeSwap.add(Event[0].args.feeAmount)
      );

      expect(feeInfo.oceanFeeAvailable).to.equal(Event[0].args.feeAmount);

      expect(Event[0].args.feeToken).to.equal(daiContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee were reset
      expect(feeInfoAfter.oceanFeeAvailable).to.equal(0);
    });

    it("#15 - Bob attermps to buy more DT but fails, then alice approves more and he succeeds", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(amountDTtoSell); // BOB HAS 100% of initial DT available
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2005")); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy more DT but fails because alice hasn't approved more
      amountDT = web3.utils.toWei("8000");

      expect(exchangeDetailsBefore.dtSupply).to.equal(0);

      await expectRevert(
        fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT),
        "ERC20: transfer amount exceeds allowance"
      );

      // now alice approves more DT (8000)

      await mockDT18
        .connect(alice)
        .approve(fixedRateExchange.address, amountDT);

      expect(
        (await fixedRateExchange.getExchange(eventsExchange[0].args.exchangeId))
          .dtSupply
      ).to.equal(amountDT);

      // Now bob can buy
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btSupply.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // Bob bought again all DT on sale so now dtSupply is 0
      expect(exchangeDetailsAfter.dtSupply).to.equal(0);

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // no DT are available in internal balance
      expect(exchangeDetailsAfter.dtBalance).to.equal(0);
    });

    it("#16 - Bob sells again some of his DataTokens", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await daiContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      const dtAliceBeforeSwap = await mockDT18.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2005")); // Alice(owner) has already some DAI collected

      amountDT = web3.utils.toWei("2000");
      // BOB approves FixedRate to move his DTs
      await mockDT18.connect(bob).approve(fixedRateExchange.address, amountDT);

      // BOB is going to sell all DTs available

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount);

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.dataTokenSwappedAmount)
      );
      expect(await daiContract.balanceOf(bob.address)).to.equal(
        btBobBalanceBeforeSwap.add(SwappedEvent[0].args.baseTokenSwappedAmount)
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // Less BT token are available
      expect(
        exchangeDetails.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btSupply.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // Bob sold some of his DTs so now dtSupply increased
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.add(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check DT and BT balances were accounted properly
      // BT doesn't go to Alice but stays in the fixedRate
      expect(
        exchangeDetails.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.add(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // ALICE's BT balance hasn't decreased
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // ALICE's DT balance hasn't increased
      expect(await mockDT18.balanceOf(alice.address)).to.equal(
        dtAliceBeforeSwap
      );
    });

    it("#17 - MarketFeeCollector updates new address then withdraws fees available on the FixedRate contract", async () => {
      // only market collector can update the address

      await expectRevert(
        fixedRateExchange.updateMarketFeeCollector(
          eventsExchange[0].args.exchangeId,
          newMarketFeeCollector.address
        ),
        "not marketFeeCollector"
      );

      await fixedRateExchange
        .connect(marketFeeCollector)
        .updateMarketFeeCollector(
          eventsExchange[0].args.exchangeId,
          newMarketFeeCollector.address
        );

      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      assert(feeInfo.oceanFeeAvailable > 0);

      assert(feeInfo.marketFeeAvailable > 0);

      expect(feeInfo.marketFeeCollector).to.equal(
        newMarketFeeCollector.address
      );

      const btMFCBeforeSwap = await daiContract.balanceOf(
        newMarketFeeCollector.address
      );

      expect(btMFCBeforeSwap).to.equal(0);

      const receipt = await (
        await fixedRateExchange.collectMarketFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "MarketFeeCollected"
      );

      // balance in ocean was transferred
      expect(
        await daiContract.balanceOf(newMarketFeeCollector.address)
      ).to.equal(btMFCBeforeSwap.add(Event[0].args.feeAmount));

      expect(Event[0].args.feeToken).to.equal(daiContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee were reset
      expect(feeInfoAfter.marketFeeAvailable).to.equal(0);
    });

    it("#18 - OPFFeeCollector receives again fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // new fees are available
      assert(feeInfo.oceanFeeAvailable > 0);

      // opfFeeCollector balance is ZERO (in Dai)
      const btOPFBeforeSwap = await daiContract.balanceOf(opfCollector.address);

      const receipt = await (
        await fixedRateExchange.collectOceanFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "OceanFeeCollected"
      );

      // balance in dai was transferred
      expect(await daiContract.balanceOf(opfCollector.address)).to.equal(
        btOPFBeforeSwap.add(Event[0].args.feeAmount)
      );

      expect(feeInfo.oceanFeeAvailable).to.equal(Event[0].args.feeAmount);

      expect(Event[0].args.feeToken).to.equal(daiContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee was reset
      expect(feeInfoAfter.oceanFeeAvailable).to.equal(0);
    });
  });

  describe("#3 - Exchange with baseToken(OCEAN) 18 Decimals and dataToken 18 Decimals, RATE = 2  (2 OCEAN = 1 DT)", async () => {
    amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        cap,
        1, // templateIndex
        user3.address, // minter
        user6.address // feeManager
      );
      const trxReceiptERC20 = await trxERC20.wait();
      erc20Address = trxReceiptERC20.events[3].args.erc20Address;

      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);

      await erc20Token.connect(alice).mint(alice.address, cap);
      expect(await erc20Token.balanceOf(alice.address)).to.equal(cap);
      mockDT18 = erc20Token;
    });

    it("#2 - create exchange", async () => {
      rate = web3.utils.toWei("2");
      rateX = 2;

      receipt = await (
        await mockDT18
          .connect(alice)
          .createFixedRate(
            oceanContract.address,
            18,
            rate,
            alice.address,
            marketFee,
            marketFeeCollector.address
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      expect(eventsExchange[0].args.basetoken).to.equal(oceanContract.address);
      expect(eventsExchange[0].args.owner).to.equal(alice.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(0);
      expect(exchangeDetails.btSupply).to.equal(0);
    });

    it("#5 - alice and bob approve contracts to spend tokens", async () => {
      // alice approves how many DT tokens wants to sell
      // we only approve an exact amount
      await mockDT18
        .connect(alice)
        .approve(fixedRateExchange.address, amountDTtoSell);

      // bob approves a big amount so that we don't need to re-approve during test
      await oceanContract
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("1000000"));
    });

    it("#6 - should check that the exchange has supply and fees setup ", async () => {
      // NOW dtSupply has increased (because alice(exchangeOwner) approved DT). Bob approval has no effect on this
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(amountDTtoSell);
      expect(exchangeDetails.btSupply).to.equal(0);
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );
      expect(feeInfo.marketFee).to.equal(marketFee);
      expect(feeInfo.marketFeeCollector).to.equal(marketFeeCollector.address);
      expect(feeInfo.opfFee).to.equal(0);
      expect(feeInfo.marketFeeAvailable).to.equal(0);
      expect(feeInfo.oceanFeeAvailable).to.equal(0);
    });

    it("#7 - should get the exchange rate", async () => {
      assert(
        web3.utils.toWei(
          web3.utils.fromWei(
            (
              await fixedRateExchange.getRate(eventsExchange[0].args.exchangeId)
            ).toString()
          )
        ) === rate
      );
    });

    it("#8 - Bob should buy ALL DataTokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      //  expect(btAliceBeforeSwap).to.equal(0) // Alice(owner) has no BT

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetails.btSupply).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );

      // Bob bought all DT on sale so now dtSupply is ZERO
      expect(exchangeDetails.dtSupply).to.equal(0);

      // we also check DT and BT balances were accounted properly
      expect(exchangeDetails.btBalance).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );
      expect(exchangeDetails.dtBalance).to.equal(0);
    });

    it("#9 - Bob sells ALL DataTokens he has", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await oceanContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);

      // BOB approves FixedRate to move his DTs
      await mockDT18
        .connect(bob)
        .approve(fixedRateExchange.address, dtBobBalanceBeforeSwap);

      // BOB is going to sell all DTs available
      amountDT = dtBobBalanceBeforeSwap;

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // oceanFeeAmount is always zero in this pool
      expect(args.oceanFeeAmount).to.equal(0);
      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .add(args.oceanFeeAmount)
          .add(args.marketFeeAmount)
      ).to.equal(args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(0);
      expect(await oceanContract.balanceOf(bob.address)).to.equal(
        btBobBalanceBeforeSwap.add(SwappedEvent[0].args.baseTokenSwappedAmount)
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // THERE ARE NO MORE BASE TOKEN available
      expect(exchangeDetails.btSupply).to.equal(0);

      // Bob sold all DT on sale so now dtSupply is back
      expect(exchangeDetails.dtSupply).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO, but
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount
      );
      // ALICE's DT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#10 - Bob changes his mind and buys back 20% of DataTokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT

      // BOB is going to buy20% of  all DT availables
      amountDT = web3.utils.toWei("2000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // oceanFeeAmount is always zero in this pool
      expect(args.oceanFeeAmount).to.equal(0);

      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.baseTokenSwappedAmount);

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // this time DT are on the contract so the balance is updated properly
      expect(exchangeDetailsAfter.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );
    });

    it("#11 - Alice withdraws BT balance available on the FixedRate contract", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetailsBefore.btBalance).to.equal(
        web3.utils.toWei("4000")
      );

      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);

      // only exchange owner can withdraw
      await expectRevert(
        fixedRateExchange.collectBT(eventsExchange[0].args.exchangeId),
        "FixedRateExchange: invalid exchange owner"
      );

      const receipt = await (
        await fixedRateExchange
          .connect(alice)
          .collectBT(eventsExchange[0].args.exchangeId)
      ).wait();

      // console.log(receipt)
      const Event = receipt.events.filter((e) => e.event === "TokenCollected");

      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap.add(Event[0].args.amount)
      );

      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // alice withdrew all btBalance
      expect(exchangeDetailsAfter.btBalance).to.equal(0);
    });

    it("#12 - Bob buys back all DT left (80%) of DataTokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(web3.utils.toWei("2000")); // BOB HAS 20% of initial DT available
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("6000")); // Alice(owner) has already withdrew her BT (#11) + 2000 from previous test

      // BOB is going to buy 80% of  all DT availables
      amountDT = web3.utils.toWei("8000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // btSupply was ZERO, then bob bought and supply increased
      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.baseTokenSwappedAmount);

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // this time DT are on the contract so the balance is updated properly
      expect(exchangeDetailsAfter.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );
    });

    it("#13 - MarketFeeCollector withdraws fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      expect(feeInfo.oceanFeeAvailable).to.equal(0);

      assert(feeInfo.marketFeeAvailable > 0);

      // marketFeeCollector ocean balance
      const btMFCBeforeSwap = await oceanContract.balanceOf(
        marketFeeCollector.address
      );

      assert(btMFCBeforeSwap > 0);

      const receipt = await (
        await fixedRateExchange.collectMarketFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "MarketFeeCollected"
      );

      // balance in ocean was transferred
      expect(
        await oceanContract.balanceOf(marketFeeCollector.address)
      ).to.equal(btMFCBeforeSwap.add(Event[0].args.feeAmount));

      expect(Event[0].args.feeToken).to.equal(oceanContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee were reset
      expect(feeInfoAfter.marketFeeAvailable).to.equal(0);
    });

    it("#14 - Bob attermps to buy more DT but fails, then alice approves more and he succeeds", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(amountDTtoSell); // BOB HAS 100% of initial DT available
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("6000")); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy more DT but fails because alice hasn't approved more
      amountDT = web3.utils.toWei("8000");

      expect(exchangeDetailsBefore.dtSupply).to.equal(0);

      await expectRevert(
        fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT),
        "ERC20: transfer amount exceeds allowance"
      );

      // now alice approves more DT (8000)

      await mockDT18
        .connect(alice)
        .approve(fixedRateExchange.address, amountDT);

      expect(
        (await fixedRateExchange.getExchange(eventsExchange[0].args.exchangeId))
          .dtSupply
      ).to.equal(amountDT);

      // Now bob can buy
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btSupply.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // Bob bought again all DT on sale so now dtSupply is 0
      expect(exchangeDetailsAfter.dtSupply).to.equal(0);

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // no DT are available in internal balance
      expect(exchangeDetailsAfter.dtBalance).to.equal(0);
    });

    it("#15 - Bob sells again some of his DataTokens", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await oceanContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      const dtAliceBeforeSwap = await mockDT18.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("6000")); // Alice(owner) has already withdrawn her BT

      amountDT = web3.utils.toWei("2000");
      // BOB approves FixedRate to move his DTs
      await mockDT18.connect(bob).approve(fixedRateExchange.address, amountDT);

      // BOB is going to sell all DTs available

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.dataTokenSwappedAmount)
      );
      expect(await oceanContract.balanceOf(bob.address)).to.equal(
        btBobBalanceBeforeSwap.add(SwappedEvent[0].args.baseTokenSwappedAmount)
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // Less BT token are available
      expect(
        exchangeDetails.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btSupply.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // Bob sold some of his DTs so now dtSupply increased
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.add(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check DT and BT balances were accounted properly
      // BT doesn't go to Alice but stays in the fixedRate
      expect(
        exchangeDetails.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.add(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // ALICE's BT balance hasn't decreased
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // ALICE's DT balance hasn't increased
      expect(await mockDT18.balanceOf(alice.address)).to.equal(
        dtAliceBeforeSwap
      );
    });

    it("#16 - MarketFeeCollector updates new address then withdraws fees available on the FixedRate contract", async () => {
      // only market collector can update the address

      await expectRevert(
        fixedRateExchange.updateMarketFeeCollector(
          eventsExchange[0].args.exchangeId,
          newMarketFeeCollector.address
        ),
        "not marketFeeCollector"
      );

      await fixedRateExchange
        .connect(marketFeeCollector)
        .updateMarketFeeCollector(
          eventsExchange[0].args.exchangeId,
          newMarketFeeCollector.address
        );

      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      expect(feeInfo.oceanFeeAvailable).to.equal(0);

      assert(feeInfo.marketFeeAvailable > 0);

      expect(feeInfo.marketFeeCollector).to.equal(
        newMarketFeeCollector.address
      );

      const btMFCBeforeSwap = await oceanContract.balanceOf(
        newMarketFeeCollector.address
      );

      const receipt = await (
        await fixedRateExchange.collectMarketFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "MarketFeeCollected"
      );

      // balance in ocean was transferred
      expect(
        await oceanContract.balanceOf(newMarketFeeCollector.address)
      ).to.equal(btMFCBeforeSwap.add(Event[0].args.feeAmount));

      expect(Event[0].args.feeToken).to.equal(oceanContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee was reset
      expect(feeInfoAfter.marketFeeAvailable).to.equal(0);
    });
  });

  describe("#4 - Exchange with baseToken(DAI) 18 Decimals and dataToken 18 Decimals, RATE = 2  (2 DAI = 1 DT)", async () => {
    let maxAmountBTtoSell = web3.utils.toWei("100000"), // bigger than required amount
      amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        cap,
        1, // templateIndex
        user3.address, // minter
        user6.address // feeManager
      );
      const trxReceiptERC20 = await trxERC20.wait();
      erc20Address = trxReceiptERC20.events[3].args.erc20Address;

      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);

      await erc20Token.connect(alice).mint(alice.address, cap);
      expect(await erc20Token.balanceOf(alice.address)).to.equal(cap);
    });
    it("#1 - mock tokens", async () => {
      mockDT18 = erc20Token;
    });

    it("#2 - create exchange", async () => {
      rate = web3.utils.toWei("2");
      rateX = 2;

      receipt = await (
        await mockDT18
          .connect(alice)
          .createFixedRate(
            daiContract.address,
            18,
            rate,
            alice.address,
            marketFee,
            marketFeeCollector.address
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      expect(eventsExchange[0].args.basetoken).to.equal(daiContract.address);
      expect(eventsExchange[0].args.owner).to.equal(alice.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(0);
      expect(exchangeDetails.btSupply).to.equal(0);
    });

    it("#5 - alice and bob approve contracts to spend tokens", async () => {
      // alice approves how many DT tokens wants to sell
      // we only approve an exact amount
      await mockDT18
        .connect(alice)
        .approve(fixedRateExchange.address, amountDTtoSell);

      // bob approves a big amount so that we don't need to re-approve during test
      await daiContract
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("1000000"));
    });

    it("#6 - should check that the exchange has supply and fees setup ", async () => {
      // NOW dtSupply has increased (because alice(exchangeOwner) approved DT). Bob approval has no effect on this
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(amountDTtoSell);
      expect(exchangeDetails.btSupply).to.equal(0);
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );
      expect(feeInfo.marketFee).to.equal(marketFee);
      expect(feeInfo.marketFeeCollector).to.equal(marketFeeCollector.address);
      expect(feeInfo.opfFee).to.equal(oceanFee);
      expect(feeInfo.marketFeeAvailable).to.equal(0);
      expect(feeInfo.oceanFeeAvailable).to.equal(0);
    });

    it("#7 - should get the exchange rate", async () => {
      assert(
        web3.utils.toWei(
          web3.utils.fromWei(
            (
              await fixedRateExchange.getRate(eventsExchange[0].args.exchangeId)
            ).toString()
          )
        ) === rate
      );
    });

    it("#8 - Bob should buy ALL DataTokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2005")); // Alice(owner) has 2005 dai  (we already collected from previous test)

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetails.btSupply).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );

      // Bob bought all DT on sale so now dtSupply is ZERO
      expect(exchangeDetails.dtSupply).to.equal(0);

      // we also check DT and BT balances were accounted properly
      expect(exchangeDetails.btBalance).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );
      expect(exchangeDetails.dtBalance).to.equal(0);
    });

    it("#9 - Bob sells ALL DataTokens he has", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await daiContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2005")); // Alice(owner) has 2005 dai  (we already collected from previous test)

      // BOB approves FixedRate to move his DTs
      await mockDT18
        .connect(bob)
        .approve(fixedRateExchange.address, dtBobBalanceBeforeSwap);

      // BOB is going to sell all DTs available
      amountDT = dtBobBalanceBeforeSwap;

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .add(args.oceanFeeAmount)
          .add(args.marketFeeAmount)
      ).to.equal(args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(0);
      expect(await daiContract.balanceOf(bob.address)).to.equal(
        btBobBalanceBeforeSwap.add(SwappedEvent[0].args.baseTokenSwappedAmount)
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // THERE ARE NO MORE BASE TOKEN available
      expect(exchangeDetails.btSupply).to.equal(0);

      // Bob sold all DT on sale so now dtSupply is back
      expect(exchangeDetails.dtSupply).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO, but
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount
      );
      // ALICE's DT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#10 - Bob changes his mind and buys back 20% of DataTokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2005")); // Alice(owner) has 2005 dai  (we already collected from previous test)

      // BOB is going to buy20% of  all DT availables
      amountDT = web3.utils.toWei("2000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.baseTokenSwappedAmount);

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // this time DT are on the contract so the balance is updated properly
      expect(exchangeDetailsAfter.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );
    });

    it("#11 - Alice withdraws BT balance available on the FixedRate contract", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetailsBefore.btBalance).to.equal(
        web3.utils.toWei("4000")
      );

      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2005")); // Alice(owner) has 2005 dai  (we already collected from previous test)

      // only exchange owner can withdraw
      await expectRevert(
        fixedRateExchange.collectBT(eventsExchange[0].args.exchangeId),
        "FixedRateExchange: invalid exchange owner"
      );

      const receipt = await (
        await fixedRateExchange
          .connect(alice)
          .collectBT(eventsExchange[0].args.exchangeId)
      ).wait();

      const Event = receipt.events.filter((e) => e.event === "TokenCollected");

      expect(Event[0].args.amount.add(btAliceBeforeSwap)).to.equal(
        await daiContract.balanceOf(alice.address)
      );

      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // alice withdrew all btBalance
      expect(exchangeDetailsAfter.btBalance).to.equal(0);
    });

    it("#12 - Bob buys back all DT left (80%) of DataTokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(web3.utils.toWei("2000")); // BOB HAS 20% of initial DT available
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("6005")); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy 80% of  all DT availables
      amountDT = web3.utils.toWei("8000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // btSupply was ZERO, then bob bought and supply increased
      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.baseTokenSwappedAmount);

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // this time DT are on the contract so the balance is updated properly
      expect(exchangeDetailsAfter.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );
    });

    it("#13 - MarketFeeCollector withdraws fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      assert(feeInfo.oceanFeeAvailable > 0);

      assert(feeInfo.marketFeeAvailable > 0);

      // marketFeeCollector balance
      const btMFCBeforeSwap = await daiContract.balanceOf(
        marketFeeCollector.address
      );

      const receipt = await (
        await fixedRateExchange.collectMarketFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "MarketFeeCollected"
      );

      // balance in ocean was transferred
      expect(await daiContract.balanceOf(marketFeeCollector.address)).to.equal(
        btMFCBeforeSwap.add(Event[0].args.feeAmount)
      );

      expect(Event[0].args.feeToken).to.equal(daiContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee were reset
      expect(feeInfoAfter.marketFeeAvailable).to.equal(0);
    });

    it("#14 - Bob attermps to buy more DT but fails, then alice approves more and he succeeds", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(amountDTtoSell); // BOB HAS 100% of initial DT available
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("6005")); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy more DT but fails because alice hasn't approved more
      amountDT = web3.utils.toWei("8000");

      expect(exchangeDetailsBefore.dtSupply).to.equal(0);

      await expectRevert(
        fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT),
        "ERC20: transfer amount exceeds allowance"
      );

      // now alice approves more DT (8000)

      await mockDT18
        .connect(alice)
        .approve(fixedRateExchange.address, amountDT);

      expect(
        (await fixedRateExchange.getExchange(eventsExchange[0].args.exchangeId))
          .dtSupply
      ).to.equal(amountDT);

      // Now bob can buy
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btSupply.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // Bob bought again all DT on sale so now dtSupply is 0
      expect(exchangeDetailsAfter.dtSupply).to.equal(0);

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // no DT are available in internal balance
      expect(exchangeDetailsAfter.dtBalance).to.equal(0);
    });

    it("#15 - Bob sells again some of his DataTokens", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await daiContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      const dtAliceBeforeSwap = await mockDT18.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("6005")); // Alice(owner) has already withdrawn her BT

      amountDT = web3.utils.toWei("2000");
      // BOB approves FixedRate to move his DTs
      await mockDT18.connect(bob).approve(fixedRateExchange.address, amountDT);

      // BOB is going to sell all DTs available

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.dataTokenSwappedAmount)
      );
      expect(await daiContract.balanceOf(bob.address)).to.equal(
        btBobBalanceBeforeSwap.add(SwappedEvent[0].args.baseTokenSwappedAmount)
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // Less BT token are available
      expect(
        exchangeDetails.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btSupply.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // Bob sold some of his DTs so now dtSupply increased
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.add(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check DT and BT balances were accounted properly
      // BT doesn't go to Alice but stays in the fixedRate
      expect(
        exchangeDetails.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.add(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // ALICE's BT balance hasn't decreased
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // ALICE's DT balance hasn't increased
      expect(await mockDT18.balanceOf(alice.address)).to.equal(
        dtAliceBeforeSwap
      );
    });

    it("#16 - MarketFeeCollector updates new address then withdraws fees available on the FixedRate contract", async () => {
      // only market collector can update the address

      await expectRevert(
        fixedRateExchange.updateMarketFeeCollector(
          eventsExchange[0].args.exchangeId,
          newMarketFeeCollector.address
        ),
        "not marketFeeCollector"
      );

      await fixedRateExchange
        .connect(marketFeeCollector)
        .updateMarketFeeCollector(
          eventsExchange[0].args.exchangeId,
          newMarketFeeCollector.address
        );

      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      assert(feeInfo.oceanFeeAvailable > 0);

      assert(feeInfo.marketFeeAvailable > 0);

      expect(feeInfo.marketFeeCollector).to.equal(
        newMarketFeeCollector.address
      );

      const btMFCBeforeSwap = await daiContract.balanceOf(
        newMarketFeeCollector.address
      );

      const receipt = await (
        await fixedRateExchange.collectMarketFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "MarketFeeCollected"
      );

      // balance in ocean was transferred
      expect(
        await daiContract.balanceOf(newMarketFeeCollector.address)
      ).to.equal(btMFCBeforeSwap.add(Event[0].args.feeAmount));

      expect(Event[0].args.feeToken).to.equal(daiContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee were reset
      expect(feeInfoAfter.marketFeeAvailable).to.equal(0);
    });
  });

  describe("#5 - Exchange with baseToken(USDC) 6 Decimals and dataToken 18 Decimals, RATE = 2  (2 USDC = 1 DT)", async () => {
    let amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        cap,
        1, // templateIndex
        user3.address, // minter
        user6.address // feeManager
      );
      const trxReceiptERC20 = await trxERC20.wait();
      erc20Address = trxReceiptERC20.events[3].args.erc20Address;

      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);

      await erc20Token.connect(alice).mint(alice.address, cap);
      expect(await erc20Token.balanceOf(alice.address)).to.equal(cap);
    });
    it("#1 - mock tokens", async () => {
      mockDT18 = erc20Token;
    });

    it("#2 - create exchange", async () => {
      rate = web3.utils.toWei("2");
      rateX = 2;

      receipt = await (
        await mockDT18
          .connect(alice)
          .createFixedRate(
            usdcContract.address,
            6,
            rate,
            alice.address,
            marketFee,
            marketFeeCollector.address
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      expect(eventsExchange[0].args.basetoken).to.equal(usdcContract.address);
      expect(eventsExchange[0].args.owner).to.equal(alice.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(0);
      expect(exchangeDetails.btSupply).to.equal(0);
    });

    it("#5 - alice and bob approve contracts to spend tokens", async () => {
      // alice approves how many DT tokens wants to sell
      // we only approve an exact amount
      await mockDT18
        .connect(alice)
        .approve(fixedRateExchange.address, amountDTtoSell);

      // bob approves a big amount so that we don't need to re-approve during test
      await usdcContract
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("1000000"));
    });

    it("#6 - should check that the exchange has supply and fees setup ", async () => {
      // NOW dtSupply has increased (because alice(exchangeOwner) approved DT). Bob approval has no effect on this
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(amountDTtoSell);
      expect(exchangeDetails.btSupply).to.equal(0);
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );
      expect(feeInfo.marketFee).to.equal(marketFee);
      expect(feeInfo.marketFeeCollector).to.equal(marketFeeCollector.address);
      expect(feeInfo.opfFee).to.equal(oceanFee);
      expect(feeInfo.marketFeeAvailable).to.equal(0);
      expect(feeInfo.oceanFeeAvailable).to.equal(0);
    });

    it("#7 - should get the exchange rate", async () => {
      assert(
        web3.utils.toWei(
          web3.utils.fromWei(
            (
              await fixedRateExchange.getRate(eventsExchange[0].args.exchangeId)
            ).toString()
          )
        ) === rate
      );
    });

    it("#8 - Bob should buy ALL DataTokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(0); // Alice(owner) has no USDC

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetails.btSupply).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );

      // Bob bought all DT on sale so now dtSupply is ZERO
      expect(exchangeDetails.dtSupply).to.equal(0);

      // we also check DT and BT balances were accounted properly
      expect(exchangeDetails.btBalance).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );
      expect(exchangeDetails.dtBalance).to.equal(0);
    });

    it("#9 - Bob sells ALL DataTokens he has", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await usdcContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(0); //  Alice(owner) has no USDC

      // BOB approves FixedRate to move his DTs
      await mockDT18
        .connect(bob)
        .approve(fixedRateExchange.address, dtBobBalanceBeforeSwap);

      // BOB is going to sell all DTs available
      amountDT = dtBobBalanceBeforeSwap;

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .add(args.oceanFeeAmount)
          .add(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(0);
      expect(await usdcContract.balanceOf(bob.address)).to.equal(
        btBobBalanceBeforeSwap.add(SwappedEvent[0].args.baseTokenSwappedAmount)
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // THERE ARE NO MORE BASE TOKEN available
      expect(exchangeDetails.btSupply).to.equal(0);

      // Bob sold all DT on sale so now dtSupply is back
      expect(exchangeDetails.dtSupply).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO, but
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount
      );
      // ALICE's DT balance hasn't increasead.
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#10 - Bob changes his mind and buys back 20% of DataTokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(0); //  Alice(owner) has no USDC

      // BOB is going to buy20% of  all DT availables
      amountDT = web3.utils.toWei("2000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.baseTokenSwappedAmount);

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // this time DT are on the contract so the balance is updated properly
      expect(exchangeDetailsAfter.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );
    });

    it("#11 - Alice withdraws BT balance available on the FixedRate contract", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetailsBefore.btBalance).to.equal(4000 * 1e6);

      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(0); //  Alice(owner) has no USDC

      // only exchange owner can withdraw
      await expectRevert(
        fixedRateExchange.collectBT(eventsExchange[0].args.exchangeId),
        "FixedRateExchange: invalid exchange owner"
      );

      const receipt = await (
        await fixedRateExchange
          .connect(alice)
          .collectBT(eventsExchange[0].args.exchangeId)
      ).wait();

      const Event = receipt.events.filter((e) => e.event === "TokenCollected");

      expect(Event[0].args.amount.add(btAliceBeforeSwap)).to.equal(
        await usdcContract.balanceOf(alice.address)
      );

      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // alice withdrew all btBalance
      expect(exchangeDetailsAfter.btBalance).to.equal(0);
    });

    it("#12 - Bob buys back all DT left (80%) of DataTokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(web3.utils.toWei("2000")); // BOB HAS 20% of initial DT available
      expect(btAliceBeforeSwap).to.equal(4000 * 1e6); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy 80% of  all DT availables
      amountDT = web3.utils.toWei("8000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
          .mul(1e12)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // btSupply was ZERO, then bob bought and supply increased
      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.baseTokenSwappedAmount);

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // this time DT are on the contract so the balance is updated properly
      expect(exchangeDetailsAfter.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );
    });

    it("#13 - MarketFeeCollector withdraws fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      assert(feeInfo.oceanFeeAvailable > 0);

      assert(feeInfo.marketFeeAvailable > 0);

      // marketFeeCollector balance
      const btMFCBeforeSwap = await usdcContract.balanceOf(
        marketFeeCollector.address
      );

      expect(btMFCBeforeSwap).to.equal(0);

      const receipt = await (
        await fixedRateExchange.collectMarketFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "MarketFeeCollected"
      );

      // balance in ocean was transferred
      expect(await usdcContract.balanceOf(marketFeeCollector.address)).to.equal(
        btMFCBeforeSwap.add(Event[0].args.feeAmount)
      );

      expect(Event[0].args.feeToken).to.equal(usdcContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee were reset
      expect(feeInfoAfter.marketFeeAvailable).to.equal(0);
    });

    it("#14 - Bob attermps to buy more DT but fails, then alice approves more and he succeeds", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(amountDTtoSell); // BOB HAS 100% of initial DT available
      expect(btAliceBeforeSwap).to.equal(4000 * 1e6); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy more DT but fails because alice hasn't approved more
      amountDT = web3.utils.toWei("8000");

      expect(exchangeDetailsBefore.dtSupply).to.equal(0);

      await expectRevert(
        fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT),
        "ERC20: transfer amount exceeds allowance"
      );

      // now alice approves more DT (8000)

      await mockDT18
        .connect(alice)
        .approve(fixedRateExchange.address, amountDT);

      expect(
        (await fixedRateExchange.getExchange(eventsExchange[0].args.exchangeId))
          .dtSupply
      ).to.equal(amountDT);

      // Now bob can buy
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
          .mul(1e12)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btSupply.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // Bob bought again all DT on sale so now dtSupply is 0
      expect(exchangeDetailsAfter.dtSupply).to.equal(0);

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // no DT are available in internal balance
      expect(exchangeDetailsAfter.dtBalance).to.equal(0);
    });

    it("#15 - Bob sells again some of his DataTokens", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await usdcContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      const dtAliceBeforeSwap = await mockDT18.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(4000 * 1e6); // Alice(owner) has already withdrawn her BT

      amountDT = web3.utils.toWei("2000");
      // BOB approves FixedRate to move his DTs
      await mockDT18.connect(bob).approve(fixedRateExchange.address, amountDT);

      // BOB is going to sell all DTs available

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
          .mul(1e12)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount.mul(rateX));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.dataTokenSwappedAmount)
      );
      expect(await usdcContract.balanceOf(bob.address)).to.equal(
        btBobBalanceBeforeSwap.add(SwappedEvent[0].args.baseTokenSwappedAmount)
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // Less BT token are available
      expect(
        exchangeDetails.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btSupply.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // Bob sold some of his DTs so now dtSupply increased
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.add(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check DT and BT balances were accounted properly
      // BT doesn't go to Alice but stays in the fixedRate
      expect(
        exchangeDetails.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.add(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // ALICE's BT balance hasn't decreased
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // ALICE's DT balance hasn't increased
      expect(await mockDT18.balanceOf(alice.address)).to.equal(
        dtAliceBeforeSwap
      );
    });

    it("#16 - MarketFeeCollector updates new address then withdraws fees available on the FixedRate contract", async () => {
      // only market collector can update the address

      await expectRevert(
        fixedRateExchange.updateMarketFeeCollector(
          eventsExchange[0].args.exchangeId,
          newMarketFeeCollector.address
        ),
        "not marketFeeCollector"
      );

      await fixedRateExchange
        .connect(marketFeeCollector)
        .updateMarketFeeCollector(
          eventsExchange[0].args.exchangeId,
          newMarketFeeCollector.address
        );

      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      assert(feeInfo.oceanFeeAvailable > 0);

      assert(feeInfo.marketFeeAvailable > 0);

      expect(feeInfo.marketFeeCollector).to.equal(
        newMarketFeeCollector.address
      );

      const btMFCBeforeSwap = await usdcContract.balanceOf(
        newMarketFeeCollector.address
      );

      expect(btMFCBeforeSwap).to.equal(0);

      const receipt = await (
        await fixedRateExchange.collectMarketFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "MarketFeeCollected"
      );

      // balance in ocean was transferred
      expect(
        await usdcContract.balanceOf(newMarketFeeCollector.address)
      ).to.equal(btMFCBeforeSwap.add(Event[0].args.feeAmount));

      expect(Event[0].args.feeToken).to.equal(usdcContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee were reset
      expect(feeInfoAfter.marketFeeAvailable).to.equal(0);
    });
  });

  describe("#6 - Exchange with baseToken(USDC) 6 Decimals and dataToken 18 Decimals, RATE = 0.5  (1 USDC = 2 DT)", async () => {
    amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        cap,
        1, // templateIndex
        user3.address, // minter
        user6.address // feeManager
      );
      const trxReceiptERC20 = await trxERC20.wait();
      erc20Address = trxReceiptERC20.events[3].args.erc20Address;

      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);

      await erc20Token.connect(alice).mint(alice.address, cap);
      expect(await erc20Token.balanceOf(alice.address)).to.equal(cap);

      mockDT18 = erc20Token;
    });

    it("#2 - create exchange", async () => {
      rate = web3.utils.toWei("0.5");
      rateX = 2; // used to check balances

      receipt = await (
        await mockDT18
          .connect(alice)
          .createFixedRate(
            usdcContract.address,
            6,
            rate,
            alice.address,
            marketFee,
            marketFeeCollector.address
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      expect(eventsExchange[0].args.basetoken).to.equal(usdcContract.address);
      expect(eventsExchange[0].args.owner).to.equal(alice.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(0);
      expect(exchangeDetails.btSupply).to.equal(0);
    });

    it("#5 - alice and bob approve contracts to spend tokens", async () => {
      // alice approves how many DT tokens wants to sell
      // we only approve an exact amount
      await mockDT18
        .connect(alice)
        .approve(fixedRateExchange.address, amountDTtoSell);

      // bob approves a big amount so that we don't need to re-approve during test
      await usdcContract
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("1000000"));
    });

    it("#6 - should check that the exchange has supply and fees setup ", async () => {
      // NOW dtSupply has increased (because alice(exchangeOwner) approved DT). Bob approval has no effect on this
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(amountDTtoSell);
      expect(exchangeDetails.btSupply).to.equal(0);
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );
      expect(feeInfo.marketFee).to.equal(marketFee);
      expect(feeInfo.marketFeeCollector).to.equal(marketFeeCollector.address);
      expect(feeInfo.opfFee).to.equal(oceanFee);
      expect(feeInfo.marketFeeAvailable).to.equal(0);
      expect(feeInfo.oceanFeeAvailable).to.equal(0);
    });

    it("#7 - should get the exchange rate", async () => {
      assert(
        web3.utils.toWei(
          web3.utils.fromWei(
            (
              await fixedRateExchange.getRate(eventsExchange[0].args.exchangeId)
            ).toString()
          )
        ) === rate
      );
    });

    it("#8 - Bob should buy ALL DataTokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(4000 * 1e6); // Alice(owner) has 4000 USDC collected from previous test

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=0.5)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.dataTokenSwappedAmount.div(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetails.btSupply).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );

      // Bob bought all DT on sale so now dtSupply is ZERO
      expect(exchangeDetails.dtSupply).to.equal(0);

      // we also check DT and BT balances were accounted properly
      expect(exchangeDetails.btBalance).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );
      expect(exchangeDetails.dtBalance).to.equal(0);
    });

    it("#9 - Bob sells ALL DataTokens he has", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await usdcContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(4000 * 1e6); // Alice(owner) has 4000 USDC collected from previous test

      // BOB approves FixedRate to move his DTs
      await mockDT18
        .connect(bob)
        .approve(fixedRateExchange.address, dtBobBalanceBeforeSwap);

      // BOB is going to sell all DTs available
      amountDT = dtBobBalanceBeforeSwap;

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .add(args.oceanFeeAmount)
          .add(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.dataTokenSwappedAmount.div(rateX));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(0);
      expect(await usdcContract.balanceOf(bob.address)).to.equal(
        btBobBalanceBeforeSwap.add(SwappedEvent[0].args.baseTokenSwappedAmount)
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // THERE ARE NO MORE BASE TOKEN available
      expect(exchangeDetails.btSupply).to.equal(0);

      // Bob sold all DT on sale so now dtSupply is back
      expect(exchangeDetails.dtSupply).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount
      );
      // ALICE's DT balance hasn't increasead.
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#10 - Bob changes his mind and buys back 20% of DataTokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(4000 * 1e6); // Alice(owner) has 4000 USDC collected from previous test

      // BOB is going to buy20% of  all DT availables
      amountDT = web3.utils.toWei("2000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=0.5)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.dataTokenSwappedAmount.div(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.baseTokenSwappedAmount);

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // this time DT are on the contract so the balance is updated properly
      expect(exchangeDetailsAfter.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );
    });

    it("#11 - Alice withdraws BT balance available on the FixedRate contract", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetailsBefore.btBalance).to.equal(1000 * 1e6);

      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(4000 * 1e6); // Alice(owner) has 4000 USDC collected from previous test

      // only exchange owner can withdraw
      await expectRevert(
        fixedRateExchange.collectBT(eventsExchange[0].args.exchangeId),
        "FixedRateExchange: invalid exchange owner"
      );

      const receipt = await (
        await fixedRateExchange
          .connect(alice)
          .collectBT(eventsExchange[0].args.exchangeId)
      ).wait();

      const Event = receipt.events.filter((e) => e.event === "TokenCollected");

      expect(Event[0].args.amount.add(btAliceBeforeSwap)).to.equal(
        await usdcContract.balanceOf(alice.address)
      );

      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // alice withdrew all btBalance
      expect(exchangeDetailsAfter.btBalance).to.equal(0);
    });

    it("#12 - Bob buys back all DT left (80%) of DataTokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(web3.utils.toWei("2000")); // BOB HAS 20% of initial DT available
      expect(btAliceBeforeSwap).to.equal(5000 * 1e6); // Alice(owner) has already withdrew her BT (#11) plus 4000 from previous test

      // BOB is going to buy 80% of  all DT availables
      amountDT = web3.utils.toWei("8000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=0.5)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
          .mul(1e12)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount.div(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // btSupply was ZERO, then bob bought and supply increased
      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.baseTokenSwappedAmount);

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // this time DT are on the contract so the balance is updated properly
      expect(exchangeDetailsAfter.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );
    });

    it("#13 - MarketFeeCollector withdraws fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      assert(feeInfo.oceanFeeAvailable > 0);

      assert(feeInfo.marketFeeAvailable > 0);

      // marketFeeCollector balance
      const btMFCBeforeSwap = await usdcContract.balanceOf(
        marketFeeCollector.address
      );

      const receipt = await (
        await fixedRateExchange.collectMarketFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "MarketFeeCollected"
      );

      // balance in usdc was transferred
      expect(await usdcContract.balanceOf(marketFeeCollector.address)).to.equal(
        btMFCBeforeSwap.add(Event[0].args.feeAmount)
      );

      expect(Event[0].args.feeToken).to.equal(usdcContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee were reset
      expect(feeInfoAfter.marketFeeAvailable).to.equal(0);
    });

    it("#14 - Bob attermps to buy more DT but fails, then alice approves more and he succeeds", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(amountDTtoSell); // BOB HAS 100% of initial DT available
      expect(btAliceBeforeSwap).to.equal(5000 * 1e6); // Alice(owner) has already withdrew her BT (#11) plus 4000 USDC from previous test

      // BOB is going to buy more DT but fails because alice hasn't approved more
      amountDT = web3.utils.toWei("8000");

      expect(exchangeDetailsBefore.dtSupply).to.equal(0);

      await expectRevert(
        fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT),
        "ERC20: transfer amount exceeds allowance"
      );

      // now alice approves more DT (8000)

      await mockDT18
        .connect(alice)
        .approve(fixedRateExchange.address, amountDT);

      expect(
        (await fixedRateExchange.getExchange(eventsExchange[0].args.exchangeId))
          .dtSupply
      ).to.equal(amountDT);

      // Now bob can buy
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=0.5)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
          .mul(1e12)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount.div(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(
        exchangeDetailsAfter.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btSupply.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // Bob bought again all DT on sale so now dtSupply is 0
      expect(exchangeDetailsAfter.dtSupply).to.equal(0);

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // no DT are available in internal balance
      expect(exchangeDetailsAfter.dtBalance).to.equal(0);
    });

    it("#15 - Bob sells again some of his DataTokens", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await usdcContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      const dtAliceBeforeSwap = await mockDT18.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(5000 * 1e6); // Alice(owner) has already withdrew her BT (#11) plus 4000 USDC from previous test

      amountDT = web3.utils.toWei("2000");
      // BOB approves FixedRate to move his DTs
      await mockDT18.connect(bob).approve(fixedRateExchange.address, amountDT);

      // BOB is going to sell all DTs available

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=0.5)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
          .mul(1e12)
      ).to.equal(SwappedEvent[0].args.dataTokenSwappedAmount.div(rateX));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.dataTokenSwappedAmount)
      );
      expect(await usdcContract.balanceOf(bob.address)).to.equal(
        btBobBalanceBeforeSwap.add(SwappedEvent[0].args.baseTokenSwappedAmount)
      );

      // BT are into the FixedRate contract.
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // Less BT token are available
      expect(
        exchangeDetails.btSupply
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btSupply.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      // Bob sold some of his DTs so now dtSupply increased
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.add(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // we also check DT and BT balances were accounted properly
      // BT doesn't go to Alice but stays in the fixedRate
      expect(
        exchangeDetails.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(
        exchangeDetailsBefore.btBalance.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        )
      );

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.add(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      // ALICE's BT balance hasn't decreased
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );

      // ALICE's DT balance hasn't increased
      expect(await mockDT18.balanceOf(alice.address)).to.equal(
        dtAliceBeforeSwap
      );
    });

    it("#16 - MarketFeeCollector updates new address then withdraws fees available on the FixedRate contract", async () => {
      // only market collector can update the address

      await expectRevert(
        fixedRateExchange.updateMarketFeeCollector(
          eventsExchange[0].args.exchangeId,
          newMarketFeeCollector.address
        ),
        "not marketFeeCollector"
      );

      await fixedRateExchange
        .connect(marketFeeCollector)
        .updateMarketFeeCollector(
          eventsExchange[0].args.exchangeId,
          newMarketFeeCollector.address
        );

      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      assert(feeInfo.oceanFeeAvailable > 0);

      assert(feeInfo.marketFeeAvailable > 0);

      expect(feeInfo.marketFeeCollector).to.equal(
        newMarketFeeCollector.address
      );

      const btMFCBeforeSwap = await usdcContract.balanceOf(
        newMarketFeeCollector.address
      );

      const receipt = await (
        await fixedRateExchange.collectMarketFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "MarketFeeCollected"
      );

      // balance in ocean was transferred
      expect(
        await usdcContract.balanceOf(newMarketFeeCollector.address)
      ).to.equal(btMFCBeforeSwap.add(Event[0].args.feeAmount));

      expect(Event[0].args.feeToken).to.equal(usdcContract.address);

      const feeInfoAfter = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // fee were reset
      expect(feeInfoAfter.marketFeeAvailable).to.equal(0);
    });
  });
});
