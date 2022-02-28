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
const { getEventFromTx } = require("../helpers/utils")
const constants = require("../helpers/constants");
const { web3, BN } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const { MAX_UINT256, ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const ethers = hre.ethers;

// TEST NEW FUNCTIONS, FOR UNIT TEST REFER TO V3 CONTRACTS BRANCH
describe("FixedRateExchange", () => {
  let alice, // DT Owner and exchange Owner
    exchangeOwner,
    bob, // baseToken Holder
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
    sideStaking,
    router,
    signer,
    amountDT,
    marketFee = 1e15, // 0.1%
    oceanFee = 1e15; // 0.1%
  (dtIndex = null),
    (oceanIndex = null),
    (daiIndex = null),
    (cap = web3.utils.toWei("100000"));

  

  const noLimit = web3.utils.toWei('100000000000000000000');
  const noSellLimit = '1';
  before("init contracts for each test", async () => {
 
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );

    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");


    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("SideStaking");
    const MockERC20 = await ethers.getContractFactory('MockERC20Decimals');
    
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
      opcCollector,
      consumeMarket
    ] = await ethers.getSigners();

    alice = user3;
    exchangeOwner = user3;
    bob = user4;

    rate = web3.utils.toWei("1");


    // MOCK TOKENS
    oceanContract = await MockERC20.deploy(
      'OCEAN','OCEAN',18
    );
    daiContract = await MockERC20.deploy(
      'DAI','DAI',18
    );
    usdcContract = await MockERC20.deploy(
      'USDC','USDC',6
    );


    await oceanContract
      .transfer(bob.address, ethers.utils.parseEther("1000000"));



    await daiContract
      .transfer(bob.address, ethers.utils.parseEther("1000000"));


    const amount = 1e11; // 100000 USDC

    await usdcContract.transfer(bob.address, amount);

    data = web3.utils.asciiToHex("SomeData");
    flags = web3.utils.asciiToHex(constants.blob[0]);

    // DEPLOY ROUTER, SETTING OWNER
    router = await Router.deploy(
      owner.address,
      oceanContract.address,
      oceanContract.address, // pooltemplate field, unused in this test
      opcCollector.address,
      []
    );

    sideStaking = await SSContract.deploy(router.address);


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

    await router.addSSContract(sideStaking.address)

  });

  it("#1 - owner deploys a new ERC721 Contract", async () => {
    // by default connect() in ethers goes with the first address (owner in this case)
    const tx = await factoryERC721.deployERC721Contract(
      "NFT",
      "NFTSYMBOL",
      1,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/"
    );
    const txReceipt = await tx.wait();

    const event = getEventFromTx(txReceipt, 'NFTCreated')
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

  describe("#1 - Exchange with baseToken(OCEAN) 18 Decimals and datatoken 18 Decimals, RATE = 1", async () => {
    let amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works
    marketFee = 1e15;
    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
        ["ERC20DT1", "ERC20DT1Symbol"],
        [user3.address, user6.address, user3.address, '0x0000000000000000000000000000000000000000'],
        [cap, 0],
        []
      );
      const trxReceiptERC20 = await trxERC20.wait();
      const event = getEventFromTx(trxReceiptERC20, 'TokenCreated')
      assert(event, "Cannot find TokenCreated event")
      erc20Address = event.args[0];


      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);

      await erc20Token.connect(alice).mint(alice.address, cap);
      expect(await erc20Token.balanceOf(alice.address)).to.equal(cap);

      mockDT18 = erc20Token;
    });

    it("#2 - create exchange", async () => {
      marketFee = 1e15;
      console.log(marketFee)


      receipt = await (
        await mockDT18
          .connect(alice)
          .createFixedRate(
            fixedRateExchange.address,
            [oceanContract.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
            [18, 18, rate, marketFee, 0]
            // 18,
            // rate,
            // alice.address,
            // marketFee,
            // marketFeeCollector.address
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      // commented out for now
      // expect(eventsExchange[0].args.baseToken).to.equal(oceanContract.address);
      // expect(eventsExchange[0].args.owner).to.equal(alice.address);
      expect(eventsExchange[0].args.owner).to.equal(web3.utils.toChecksumAddress(alice.address));
      expect(eventsExchange[0].args.baseToken).to.equal(web3.utils.toChecksumAddress(oceanContract.address));

      const fixedrates = await erc20Token.getFixedRates()
      assert(fixedrates[0].contractAddress ===web3.utils.toChecksumAddress(fixedRateExchange.address),
           "Fixed Rate exchange not found in erc20Token.getFixedRates()")
      assert(fixedrates[0].id === eventsExchange[0].args.exchangeId,
           "Fixed Rate exchange not found in erc20Token.getFixedRates()")
    });

    it("#getId - should return templateId", async () => {
      const templateId = 1;
      assert((await fixedRateExchange.getId()) == templateId);
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
      expect(feeInfo.opcFee).to.equal(0);
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
    it("#8 - Bob should fail to buy if price is too high", async () => {
      // this will fails because we are willing to spend only 1 wei of base tokens
      await expectRevert(fixedRateExchange.connect(bob)
      .buyDT(eventsExchange[0].args.exchangeId, amountDTtoSell, '1',ZERO_ADDRESS, 0)
      ,"FixedRateExchange: Too many base tokens" )
    });
    it("#9 - Bob should fail to sell if price is too low", async () => {
      // this will fails because we want to receive a high no of base tokens
      await expectRevert(fixedRateExchange.connect(bob)
      .sellDT(eventsExchange[0].args.exchangeId, amountDTtoSell, noLimit,ZERO_ADDRESS, 0)
      ,"FixedRateExchange: Too few base tokens" )
    });
      
    it("#10 - Bob should buy ALL Dataokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(0); // Alice(owner) has no BT

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#11 - Bob sells ALL Datatokens he has", async () => {
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
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
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
      ).to.equal(args.datatokenSwappedAmount);

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
        SwappedEvent[0].args.datatokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount
      );

      // ALICE's DT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#12 - Bob changes his mind and buys back 20% of Datatokens available", async () => {
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
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
      ).to.equal(args.datatokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
        )
      );
    });

    it("#13 - Alice withdraws BT balance available on the FixedRate contract", async () => {
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

    it("#14 - Bob buys back all DT left (80%) of Datatokens available", async () => {
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
        )
      );
    });

    it("#15 - MarketFeeCollector withdraws fees available on the FixedRate contract", async () => {
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

    it("#16 - Bob attermps to buy more DT but fails, then alice approves more and he succeeds", async () => {
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0),
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
      // TO DO - add consumeFee
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,consumeMarket.address, web3.utils.toWei("0.1"))
      ).wait();

      // console.log(receipt)
      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
          .sub(args.consumeMarketFeeAmount)
      ).to.equal(String(SwappedEvent[0].args.datatokenSwappedAmount));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          .add(args.consumeMarketFeeAmount)
      ).to.equal(String(
        exchangeDetailsBefore.btSupply.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        ))
      );

      // Bob bought again all DT on sale so now dtSupply is 0
      expect(exchangeDetailsAfter.dtSupply).to.equal(0);

      // we also check BT balances were accounted properly
      expect(
        exchangeDetailsAfter.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
          .add(args.consumeMarketFeeAmount)
      ).to.equal(String(
        exchangeDetailsBefore.btBalance.add(
          SwappedEvent[0].args.baseTokenSwappedAmount
        ))
      );

      // no DT are available in internal balance
      expect(exchangeDetailsAfter.dtBalance).to.equal(0);
    });

    it("#17 - Bob sells again some of his Datatokens", async () => {
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
      // TO DO - add consumeFee
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,consumeMarket.address, web3.utils.toWei("0.1"))
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
          .add(args.consumeMarketFeeAmount)
      ).to.equal(String(SwappedEvent[0].args.datatokenSwappedAmount));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.datatokenSwappedAmount)
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
          .add(args.consumeMarketFeeAmount)
      ).to.equal(String(
        exchangeDetailsBefore.btSupply.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        ))
      );

      // Bob sold some of his DTs so now dtSupply increased
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.add(
          SwappedEvent[0].args.datatokenSwappedAmount
        )
      );

      // we also check DT and BT balances were accounted properly
      // BT doesn't go to Alice but stays in the fixedRate
      expect(
        exchangeDetails.btBalance
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
          .add(args.consumeMarketFeeAmount)
      ).to.equal(String(
        exchangeDetailsBefore.btBalance.sub(
          SwappedEvent[0].args.baseTokenSwappedAmount
        ))
      );

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        exchangeDetailsBefore.dtBalance.add(
          SwappedEvent[0].args.datatokenSwappedAmount
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

    it("#18 - MarketFeeCollector updates new address then withdraws fees available on the FixedRate contract", async () => {
      // only market collector can update the address
      await fixedRateExchange.getM
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

  describe("#2 - Exchange with baseToken(DAI) 18 Decimals and datatoken 18 Decimals RATE = 1 ", async () => {
    let maxAmountBTtoSell = web3.utils.toWei("100000"), // bigger than required amount
      amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
        ["ERC20DT1", "ERC20DT1Symbol"],
        [user3.address, user6.address, user3.address, '0x0000000000000000000000000000000000000000'],
        [cap, 0],
        []
      );
      const trxReceiptERC20 = await trxERC20.wait();
      const event = getEventFromTx(trxReceiptERC20, 'TokenCreated')
      assert(event, "Cannot find TokenCreated event")
      erc20Address = event.args[0];


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
            fixedRateExchange.address,
            [daiContract.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
            [18, 18, rate, marketFee,0]
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      // expect(eventsExchange[0].args.baseToken).to.equal(daiContract.address);
      // expect(eventsExchange[0].args.owner).to.equal(alice.address);
      expect(eventsExchange[0].args.baseToken).to.equal(daiContract.address);
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
      expect(feeInfo.opcFee).to.equal(oceanFee);
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

    it("#8 - Bob should buy ALL Datatokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
    
      expect(btAliceBeforeSwap).to.equal(0);

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#9 - Bob sells ALL Datatokens he has", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await daiContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      
      expect(btAliceBeforeSwap).to.equal(0);

      // BOB approves FixedRate to move his DTs
      await mockDT18
        .connect(bob)
        .approve(fixedRateExchange.address, dtBobBalanceBeforeSwap);

      // BOB is going to sell all DTs available
      amountDT = dtBobBalanceBeforeSwap;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .add(args.oceanFeeAmount)
          .add(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount);

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
        SwappedEvent[0].args.datatokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount
      );
      // ALICE's DT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#10 - Bob changes his mind and buys back 20% of Datatokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
     
      expect(btAliceBeforeSwap).to.equal(0);

      // BOB is going to buy20% of  all DT availables
      amountDT = web3.utils.toWei("2000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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

   
      expect(btAliceBeforeSwap).to.equal(0);

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

    it("#12 - Bob buys back all DT left (80%) of Datatokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(web3.utils.toWei("2000")); // BOB HAS 20% of initial DT available
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2000")); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy 80% of  all DT availables
      amountDT = web3.utils.toWei("8000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      // console.log(receipt)
      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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

    it("#14 - opcFeeCollector withdraws fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      assert(feeInfo.oceanFeeAvailable > 0);

      // opcFeeCollector balance is ZERO (in Dai)
      const btOPFBeforeSwap = await daiContract.balanceOf(opcCollector.address);

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
      expect(await daiContract.balanceOf(opcCollector.address)).to.equal(
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
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2000")); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy more DT but fails because alice hasn't approved more
      amountDT = web3.utils.toWei("8000");

      expect(exchangeDetailsBefore.dtSupply).to.equal(0);

      await expectRevert(
        fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0),
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#16 - Bob sells again some of his Datatokens", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await daiContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      const dtAliceBeforeSwap = await mockDT18.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2000")); // Alice(owner) has already some DAI collected

      amountDT = web3.utils.toWei("2000");
      // BOB approves FixedRate to move his DTs
      await mockDT18.connect(bob).approve(fixedRateExchange.address, amountDT);

      // BOB is going to sell all DTs available

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount);

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.datatokenSwappedAmount)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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

    it("#18 - opcFeeCollector receives again fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // new fees are available
      assert(feeInfo.oceanFeeAvailable > 0);

      // opcFeeCollector balance is ZERO (in Dai)
      const btOPFBeforeSwap = await daiContract.balanceOf(opcCollector.address);

      const receipt = await (
        await fixedRateExchange.collectOceanFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "OceanFeeCollected"
      );

      // balance in dai was transferred
      expect(await daiContract.balanceOf(opcCollector.address)).to.equal(
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

  describe("#3 - Exchange with baseToken(OCEAN) 18 Decimals and datatoken 18 Decimals, RATE = 2  (2 OCEAN = 1 DT)", async () => {
    amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
        ["ERC20DT1", "ERC20DT1Symbol"],
        [user3.address, user6.address, user3.address, '0x0000000000000000000000000000000000000000'],
        [cap, 0],
        []
      );
      const trxReceiptERC20 = await trxERC20.wait();
      const event = getEventFromTx(trxReceiptERC20, 'TokenCreated')
      assert(event, "Cannot find TokenCreated event")
      erc20Address = event.args[0];


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
            fixedRateExchange.address,
            [oceanContract.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
            [18, 18, rate, marketFee, 0]
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      // expect(eventsExchange[0].args.baseToken).to.equal(oceanContract.address);
      //  expect(eventsExchange[0].args.owner).to.equal(alice.address);
      expect(eventsExchange[0].args.baseToken).to.equal(oceanContract.address);
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
      expect(feeInfo.opcFee).to.equal(0);
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

    it("#8 - Bob should buy ALL Datatokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      //  expect(btAliceBeforeSwap).to.equal(0) // Alice(owner) has no BT

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#9 - Bob sells ALL Datatokens he has", async () => {
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
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
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
      ).to.equal(args.datatokenSwappedAmount.mul(rateX));

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
        SwappedEvent[0].args.datatokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO, but
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount
      );
      // ALICE's DT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#10 - Bob changes his mind and buys back 20% of Datatokens available", async () => {
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
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
      ).to.equal(args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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

    it("#12 - Bob buys back all DT left (80%) of Datatokens available", async () => {
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0),
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#15 - Bob sells again some of his Datatokens", async () => {
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
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.datatokenSwappedAmount)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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

  describe("#4 - Exchange with baseToken(DAI) 18 Decimals and datatoken 18 Decimals, RATE = 2  (2 DAI = 1 DT)", async () => {
    let maxAmountBTtoSell = web3.utils.toWei("100000"), // bigger than required amount
      amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
        ["ERC20DT1", "ERC20DT1Symbol"],
        [user3.address, user6.address, user3.address, '0x0000000000000000000000000000000000000000'],
        [cap, 0],
        []
      );
      const trxReceiptERC20 = await trxERC20.wait();
      const event = getEventFromTx(trxReceiptERC20, 'TokenCreated')
      assert(event, "Cannot find TokenCreated event")
      erc20Address = event.args[0];


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
            fixedRateExchange.address,
            [daiContract.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
            [18, 18, rate, marketFee, 0]
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      // expect(eventsExchange[0].args.baseToken).to.equal(daiContract.address);
      // expect(eventsExchange[0].args.owner).to.equal(alice.address);
      expect(eventsExchange[0].args.baseToken).to.equal(daiContract.address);
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
      expect(feeInfo.opcFee).to.equal(oceanFee);
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

    it("#8 - Bob should buy ALL Datatokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2000")); // Alice(owner) has 2000 dai  (we already collected from previous test)

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#9 - Bob sells ALL Datatokens he has", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await daiContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2000")); // Alice(owner) has 2000 dai  (we already collected from previous test)

      // BOB approves FixedRate to move his DTs
      await mockDT18
        .connect(bob)
        .approve(fixedRateExchange.address, dtBobBalanceBeforeSwap);

      // BOB is going to sell all DTs available
      amountDT = dtBobBalanceBeforeSwap;

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .add(args.oceanFeeAmount)
          .add(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount.mul(rateX));

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
        SwappedEvent[0].args.datatokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO, but
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount
      );
      // ALICE's DT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#10 - Bob changes his mind and buys back 20% of Datatokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2000")); // Alice(owner) has 2000 dai  (we already collected from previous test)

      // BOB is going to buy20% of  all DT availables
      amountDT = web3.utils.toWei("2000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("2000")); // Alice(owner) has 2000 dai  (we already collected from previous test)

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

    it("#12 - Bob buys back all DT left (80%) of Datatokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(web3.utils.toWei("2000")); // BOB HAS 20% of initial DT available
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("6000")); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy 80% of  all DT availables
      amountDT = web3.utils.toWei("8000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("6000")); // Alice(owner) has already withdrew her BT (#11)

      // BOB is going to buy more DT but fails because alice hasn't approved more
      amountDT = web3.utils.toWei("8000");

      expect(exchangeDetailsBefore.dtSupply).to.equal(0);

      await expectRevert(
        fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0),
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#15 - Bob sells again some of his Datatokens", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await daiContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      const dtAliceBeforeSwap = await mockDT18.balanceOf(alice.address);
      expect(btAliceBeforeSwap).to.equal(web3.utils.toWei("6000")); // Alice(owner) has already withdrawn her BT

      amountDT = web3.utils.toWei("2000");
      // BOB approves FixedRate to move his DTs
      await mockDT18.connect(bob).approve(fixedRateExchange.address, amountDT);

      // BOB is going to sell all DTs available

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.datatokenSwappedAmount)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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

  describe("#5 - Exchange with baseToken(USDC) 6 Decimals and datatoken 18 Decimals, RATE = 2  (2 USDC = 1 DT)", async () => {
    let amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
        ["ERC20DT1", "ERC20DT1Symbol"],
        [user3.address, user6.address, user3.address, '0x0000000000000000000000000000000000000000'],
        [cap, 0],
        []
      );
      const trxReceiptERC20 = await trxERC20.wait();
      const event = getEventFromTx(trxReceiptERC20, 'TokenCreated')
      assert(event, "Cannot find TokenCreated event")
      erc20Address = event.args[0];


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
            fixedRateExchange.address,
            [usdcContract.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
            [6, 18, rate, marketFee, 0]
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      // expect(eventsExchange[0].args.baseToken).to.equal(usdcContract.address);
      // expect(eventsExchange[0].args.owner).to.equal(alice.address);
      expect(eventsExchange[0].args.baseToken).to.equal(usdcContract.address);
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
      expect(feeInfo.opcFee).to.equal(oceanFee);
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

    it("#8 - Bob should buy ALL Datatokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(0); // Alice(owner) has no USDC

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#9 - Bob sells ALL Datatokens he has", async () => {
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
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .add(args.oceanFeeAmount)
          .add(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.datatokenSwappedAmount.mul(rateX));

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
        SwappedEvent[0].args.datatokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO, but
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount
      );
      // ALICE's DT balance hasn't increasead.
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#10 - Bob changes his mind and buys back 20% of Datatokens available", async () => {
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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

    it("#12 - Bob buys back all DT left (80%) of Datatokens available", async () => {
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
          .mul(1e12)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0),
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=2)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
          .mul(1e12)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#15 - Bob sells again some of his Datatokens", async () => {
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
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
          .mul(1e12)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount.mul(rateX));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.datatokenSwappedAmount)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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

  describe("#6 - Exchange with baseToken(USDC) 6 Decimals and datatoken 18 Decimals, RATE = 0.5  (1 USDC = 2 DT)", async () => {
    amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
        ["ERC20DT1", "ERC20DT1Symbol"],
        [user3.address, user6.address, user3.address, '0x0000000000000000000000000000000000000000'],
        [cap, 0],
        []
      );
      const trxReceiptERC20 = await trxERC20.wait();
      const event = getEventFromTx(trxReceiptERC20, 'TokenCreated')
      assert(event, "Cannot find TokenCreated event")
      erc20Address = event.args[0];


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
            fixedRateExchange.address,
            [usdcContract.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
            [6, 18, rate, marketFee, 0]
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      // expect(eventsExchange[0].args.baseToken).to.equal(usdcContract.address);
      // expect(eventsExchange[0].args.owner).to.equal(alice.address);
      expect(eventsExchange[0].args.baseToken).to.equal(usdcContract.address);
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
      expect(feeInfo.opcFee).to.equal(oceanFee);
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

    it("#8 - Bob should buy ALL Datatokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await usdcContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(4000 * 1e6); // Alice(owner) has 4000 USDC collected from previous test

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=0.5)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.datatokenSwappedAmount.div(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#9 - Bob sells ALL Datatokens he has", async () => {
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
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=2)
      expect(
        args.baseTokenSwappedAmount
          .add(args.oceanFeeAmount)
          .add(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.datatokenSwappedAmount.div(rateX));

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
        SwappedEvent[0].args.datatokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount
      );
      // ALICE's DT balance hasn't increasead.
      expect(await usdcContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#10 - Bob changes his mind and buys back 20% of Datatokens available", async () => {
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=0.5)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.datatokenSwappedAmount.div(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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

    it("#12 - Bob buys back all DT left (80%) of Datatokens available", async () => {
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=0.5)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
          .mul(1e12)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount.div(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0),
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=0.5)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
          .mul(1e12)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount.div(rateX));

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#15 - Bob sells again some of his Datatokens", async () => {
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
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=0.5)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
          .mul(1e12)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount.div(rateX));

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.datatokenSwappedAmount)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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

  describe("#7 - Test flexible OPF fee - Exchange with baseToken(DAI) 18 Decimals and datatoken 18 Decimals RATE = 1 ", async () => {
    let maxAmountBTtoSell = web3.utils.toWei("100000"), // bigger than required amount
      amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
        ["ERC20DT1", "ERC20DT1Symbol"],
        [user3.address, user6.address, user3.address, '0x0000000000000000000000000000000000000000'],
        [cap, 0],
        []
      );
      const trxReceiptERC20 = await trxERC20.wait();
      const event = getEventFromTx(trxReceiptERC20, 'TokenCreated')
      assert(event, "Cannot find TokenCreated event")
      erc20Address = event.args[0];

      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);

      await erc20Token.connect(alice).mint(alice.address, cap);
      expect(await erc20Token.balanceOf(alice.address)).to.equal(cap);

      mockDT18 = erc20Token;
    });

    it("#2 - create exchange", async () => {
      rate = web3.utils.toWei('1')

      receipt = await (
        await mockDT18
          .connect(alice)
          .createFixedRate(
            fixedRateExchange.address,
            [daiContract.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
            [18, 18, rate, marketFee, 0]
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      // expect(eventsExchange[0].args.baseToken).to.equal(daiContract.address);
      // expect(eventsExchange[0].args.owner).to.equal(alice.address);
      expect(eventsExchange[0].args.baseToken).to.equal(daiContract.address);
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
      expect(feeInfo.opcFee).to.equal(oceanFee);
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


    it("#8 - Bob should buy ALL Datatokens available(amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT


      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#9 - Bob sells ALL Datatokens he has", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await daiContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);


      // BOB approves FixedRate to move his DTs
      await mockDT18
        .connect(bob)
        .approve(fixedRateExchange.address, dtBobBalanceBeforeSwap);

      // BOB is going to sell all DTs available
      amountDT = dtBobBalanceBeforeSwap;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .add(args.oceanFeeAmount)
          .add(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount);

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
        SwappedEvent[0].args.datatokenSwappedAmount
      );

      // we also check DT and BT balances were accounted properly
      // baseToken balance is ZERO
      expect(exchangeDetails.btBalance).to.equal(0);

      //now the DT are into the FixedRate and not on alice
      expect(exchangeDetails.dtBalance).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount
      );
      // ALICE's DT balance hasn't increasead.
      expect(await daiContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });

    it("#10 - opcFee is updated to 1% from 0.1%", async () => {
      await router.updateOPCFee('0', web3.utils.toWei('0.01'), web3.utils.toWei('0.001'), 0)
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );
      expect(feeInfo.opcFee).to.equal(web3.utils.toWei('0.01'));
    });


    it("#11 - Bob changes his mind and buys back 20% of Datatokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT


      // BOB is going to buy20% of  all DT availables
      amountDT = web3.utils.toWei("2000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
        )
      );
    });

    it("#12 - Alice withdraws BT balance available on the FixedRate contract", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      expect(exchangeDetailsBefore.btBalance).to.equal(
        web3.utils.toWei("2000")
      );

      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);


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

    it("#13 - DAI token is added into Ocean List, now opcFee is ZERO", async () => {
      await router.addOceanToken(daiContract.address)
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );
      expect(feeInfo.opcFee).to.equal(0);
    });

    it("#14 - Bob buys back all DT left (80%) of Datatokens available", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(web3.utils.toWei("2000")); // BOB HAS 20% of initial DT available


      // BOB is going to buy 80% of  all DT availables
      amountDT = web3.utils.toWei("8000");
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      // console.log(receipt)
      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
        )
      );
    });

    it("#15 - MarketFeeCollector withdraws fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // there are fee to collect both for opf and market
      assert(feeInfo.oceanFeeAvailable > 0);

      assert(feeInfo.marketFeeAvailable > 0);

      // marketFeeCollector balance in DAI before collecting
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

    it("#16 - opcFeeCollector withdraws fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      assert(feeInfo.oceanFeeAvailable > 0);

      // opcFeeCollector balance is DAI before collecting
      const btOPFBeforeSwap = await daiContract.balanceOf(opcCollector.address);

      const receipt = await (
        await fixedRateExchange.collectOceanFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "OceanFeeCollected"
      );

      // balance in dai was transferred
      expect(await daiContract.balanceOf(opcCollector.address)).to.equal(
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

    it("#17 - Bob attermps to buy more DT but fails, then alice approves more and he succeeds", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(amountDTtoSell); // BOB HAS 100% of initial DT available


      // BOB is going to buy more DT but fails because alice hasn't approved more
      amountDT = web3.utils.toWei("8000");

      expect(exchangeDetailsBefore.dtSupply).to.equal(0);

      await expectRevert(
        fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0),
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
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .sub(args.marketFeeAmount)
          .sub(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
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

    it("#18 - Bob sells again some of his Datatokens", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btBobBalanceBeforeSwap = await daiContract.balanceOf(bob.address);
      const btAliceBeforeSwap = await daiContract.balanceOf(alice.address);
      const dtAliceBeforeSwap = await mockDT18.balanceOf(alice.address);


      amountDT = web3.utils.toWei("2000");
      // BOB approves FixedRate to move his DTs
      await mockDT18.connect(bob).approve(fixedRateExchange.address, amountDT);

      // BOB is going to sell all DTs available

      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .sellDT(eventsExchange[0].args.exchangeId, amountDT, noSellLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      const args = SwappedEvent[0].args;
      // we check that proper amount is being swapped (rate=1)
      expect(
        SwappedEvent[0].args.baseTokenSwappedAmount
          .add(args.marketFeeAmount)
          .add(args.oceanFeeAmount)
      ).to.equal(SwappedEvent[0].args.datatokenSwappedAmount);

      // BOB's DTbalance is zero, and BT increased as expected
      expect(await mockDT18.balanceOf(bob.address)).to.equal(
        dtBobBalanceBeforeSwap.sub(SwappedEvent[0].args.datatokenSwappedAmount)
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
          SwappedEvent[0].args.datatokenSwappedAmount
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
          SwappedEvent[0].args.datatokenSwappedAmount
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

    it("#19 - MarketFeeCollector updates new address then withdraws fees available on the FixedRate contract", async () => {
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

      // DAI is now on the list, no ocean fee available
      assert(feeInfo.oceanFeeAvailable == 0);

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

    it("#20 - opcFeeCollector receives again fees available on the FixedRate contract", async () => {
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );

      // DAI is now on the list, no ocean fee available
      assert(feeInfo.oceanFeeAvailable == 0);

      // opcFeeCollector balance before collecting
      const btOPFBeforeSwap = await daiContract.balanceOf(opcCollector.address);

      const receipt = await (
        await fixedRateExchange.collectOceanFee(
          eventsExchange[0].args.exchangeId
        )
      ).wait();

      const Event = receipt.events.filter(
        (e) => e.event === "OceanFeeCollected"
      );

      // no dai were transferred
      expect(await daiContract.balanceOf(opcCollector.address)).to.equal(
        btOPFBeforeSwap.add(Event[0].args.feeAmount)
      );
      expect(feeInfo.oceanFeeAvailable).to.equal(0)
      expect(feeInfo.oceanFeeAvailable).to.equal(Event[0].args.feeAmount);

      expect(Event[0].args.feeToken).to.equal(daiContract.address);

    });
  });
  describe("#8 - Fixed Rate Exchange with minting", async () => {
    let amountToMint = web3.utils.toWei("10000"); // exact amount so that we can check if balances works
      
    marketFee = 1e15;
    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
        ["ERC20DT1", "ERC20DT1Symbol"],
        [user3.address, user6.address, user3.address, '0x0000000000000000000000000000000000000000'],
        [cap, 0],
        []
      );
      const trxReceiptERC20 = await trxERC20.wait();
      const event = getEventFromTx(trxReceiptERC20, 'TokenCreated')
      assert(event, "Cannot find TokenCreated event")
      erc20Address = event.args[0];


      erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token.permissions(user3.address)).minter == true);


      mockDT18 = erc20Token;
    });
    it("#2 - create exchange withMint", async () => {
      receipt = await (
        await mockDT18
          .connect(alice)
          .createFixedRate(
            fixedRateExchange.address,
            [oceanContract.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
            [18, 18, rate, marketFee, 1]
            // 18,
            // rate,
            // alice.address,
            // marketFee,
            // marketFeeCollector.address
          )
      ).wait(); // from exchangeOwner (alice)
      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");
      // commented out for now
      // expect(eventsExchange[0].args.baseToken).to.equal(oceanContract.address);
      // expect(eventsExchange[0].args.owner).to.equal(alice.address);
      expect(eventsExchange[0].args.baseToken).to.equal(oceanContract.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });
    it("#4 - exchange has minter rights", async () => {
      const isMinter = await mockDT18.isMinter(fixedRateExchange.address)
      assert(isMinter === true, "Exchange has no minting role!");
    });
    

    it("#5 - should check that the exchange has minterRole and it has supply ", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      assert(exchangeDetails.dtSupply.gt(0),'FixedRateExchange has no supply, altough is a minter')
      expect(exchangeDetails.btSupply).to.equal(0);
      assert(exchangeDetails.withMint, 'FixedRateExchange is not configured withMint option')
    });
    it("#6 - Bob should buy 1 Datatoken using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      
      // BOB is going to buy all DT availables
      amountDT = web3.utils.toWei('1');
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit,ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount);

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await oceanContract.balanceOf(alice.address)).to.equal(
        btAliceBeforeSwap
      );
    });
  });
});