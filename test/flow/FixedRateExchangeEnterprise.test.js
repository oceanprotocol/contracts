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
const { not } = require("@openzeppelin/test-helpers/src/expectEvent");

const ethers = hre.ethers;

// TEST NEW FUNCTIONS, FOR UNIT TEST REFER TO V3 CONTRACTS BRANCH
describe("FixedRateExchangeEnterprise", () => {
  let alice, // DT Owner and exchange Owner
    exchangeOwner,
    bob, // baseToken Holder
    charlie,
    fixedRateExchange,
    rate,
    rate_decimal,
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
    enterpriseFeeCollectorContract,
    baseTokenContract,
    oceanOPFBalance,
    bogusContract,
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
  before("init contracts for each test", async () => {
    MockERC20 = await ethers.getContractFactory("MockERC20Decimals");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchangeEnterprise"
    );

    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");


    const Router = await ethers.getContractFactory("FactoryRouter");
    const enterpriseCollectorContract = await ethers.getContractFactory("EnterpriseFeeCollector");
    const OceanContract = await ethers.getContractFactory("MockOcean");
    const DaiContract = await ethers.getContractFactory("MockERC20");
    const BogusContract = await ethers.getContractFactory("MockERC20");
    const UsdcContract = await ethers.getContractFactory("MockERC20Decimals");

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
    charlie = user5;



    oceanContract = await OceanContract.connect(owner).deploy(owner.address)
    daiContract = await DaiContract.connect(owner).deploy(owner.address, 'DAI', "DAI")
    bogusContract = await BogusContract.connect(owner).deploy(owner.address,'Bogus', "BOGUS")
    usdcContract = await UsdcContract.connect(owner).deploy('USDC', "USDC", 6)

    await oceanContract
      .connect(owner)
      .transfer(bob.address, ethers.utils.parseEther("1000000"));
    await daiContract
      .connect(owner)
      .transfer(bob.address, ethers.utils.parseEther("1000000"));
    await bogusContract
      .connect(owner)
      .transfer(bob.address, ethers.utils.parseEther("1000000"));
    const amount = 1e11; // 100000 USDC
    await usdcContract.connect(owner).transfer(bob.address, amount);

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
    enterpriseFeeCollectorContract = await enterpriseCollectorContract.connect(owner).deploy(opcCollector.address,owner.address)
    fixedRateExchange = await FixedRateExchange.deploy(
      router.address,
      enterpriseFeeCollectorContract.address,
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

    await enterpriseFeeCollectorContract.connect(owner).updateToken(oceanContract.address,0,ethers.utils.parseEther('100000'),ethers.utils.parseEther('0.01'), true);
    await enterpriseFeeCollectorContract.connect(owner).updateToken(daiContract.address,0,ethers.utils.parseEther('100000'),ethers.utils.parseEther('0.01'), true);
    await enterpriseFeeCollectorContract.connect(owner).updateToken(usdcContract.address,0,ethers.utils.parseEther('100000'),ethers.utils.parseEther('0.02'), true);

    
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
    rate_decimal = 1;
    rate = web3.utils.toWei(String(rate_decimal));
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

    it("should fail if basetoken is EOA", async () => {
      await expectRevert(mockDT18.connect(alice)
      .createFixedRate(
        fixedRateExchange.address,
        [bob.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
        [18, 18, rate, marketFee, 0])
      ,"FixedRateExchange: Invalid baseToken, looks EOA" )
      
    });
    it("#2 - create exchange", async () => {
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
      expect(eventsExchange[0].args.owner).to.equal(web3.utils.toChecksumAddress(alice.address));
      expect(eventsExchange[0].args.baseToken).to.equal(web3.utils.toChecksumAddress(oceanContract.address));

      const fixedrates = await erc20Token.getFixedRates()
      assert(fixedrates[0].contractAddress === web3.utils.toChecksumAddress(fixedRateExchange.address),
        "Fixed Rate exchange not found in erc20Token.getFixedRates()")
      assert(fixedrates[0].id === eventsExchange[0].args.exchangeId,
        "Fixed Rate exchange not found in erc20Token.getFixedRates()")

      const exchanges = await fixedRateExchange.getExchanges()
      assert(exchanges.includes(eventsExchange[0].args.exchangeId),'Exchange not found in getExchanges()')
      assert(await fixedRateExchange.getNumberOfExchanges()>0,'Exchange not found in getExchanges()')
    });

    it("#getId - should return templateId", async () => {
      const templateId = 3;
      assert((await fixedRateExchange.getId()) == templateId);
    });
    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has dt supply", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.gt(0)
      expect(exchangeDetails.btSupply).to.equal(0);
    });

    it("#5 - bob approve contracts to spend tokens", async () => {
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
      expect(exchangeDetails.dtSupply).to.gt(0)
      expect(exchangeDetails.btSupply).to.equal(0);
      const feeInfo = await fixedRateExchange.getFeesInfo(
        eventsExchange[0].args.exchangeId
      );
      expect(feeInfo.marketFee).to.equal(marketFee);
      expect(feeInfo.marketFeeCollector).to.equal(marketFeeCollector.address);
      expect(feeInfo.opcFee).gt(0);
      expect(feeInfo.marketFeeAvailable).gte(0);
      expect(feeInfo.oceanFeeAvailable).gte(0);
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
        .buyDT(eventsExchange[0].args.exchangeId, amountDTtoSell, '1', ZERO_ADDRESS, 0)
        , "FixedRateExchange: Too many base tokens")
    });
    it("#9 - Bob should fail to sell if price is too low", async () => {
      // this will fails because we want to receive a high no of base tokens
      await expectRevert(fixedRateExchange.connect(bob)
        .sellDT(eventsExchange[0].args.exchangeId, amountDTtoSell, noLimit, ZERO_ADDRESS, 0)
        , "FixedRateExchange: Too few base tokens")
    });

    it("#10 - Bob should buy Dataokens using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(0); // Alice(owner) has no BT

      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit, ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      
      // we check that proper amount is being swapped (rate=1)
      //expect(
      //  args.baseTokenSwappedAmount
      //    .sub(args.oceanFeeAmount)
      //    .sub(args.marketFeeAmount)
      //).to.equal(args.datatokenSwappedAmount);
      const enterpriseFee=await enterpriseFeeCollectorContract.calculateFee(oceanContract.address, args.baseTokenSwappedAmount);
      
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount.mul(rate_decimal));
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

      // Check dtSupply
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(SwappedEvent[0].args.datatokenSwappedAmount)
      );

      // we also check DT and BT balances were accounted properly
      expect(exchangeDetails.btBalance).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );
      expect(exchangeDetails.dtBalance).to.equal(0);
    });

    it("#10 - Bob should buy Dataokens using the fixed rate exchange contract with consumeMarketFee", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      const exBtSupply = exchangeDetailsBefore.btSupply
      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit, charlie.address, marketFee)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;
      const enterpriseFee=await enterpriseFeeCollectorContract.calculateFee(oceanContract.address, args.baseTokenSwappedAmount);
      // we check that proper amount is being swapped (rate=1)
      //expect(
      //  args.baseTokenSwappedAmount
      //    .sub(args.oceanFeeAmount)
      //    .sub(args.marketFeeAmount)
      //).to.equal(args.datatokenSwappedAmount);

      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
          .sub(args.consumeMarketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount.mul(rate_decimal));
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
      const expectedBtSupply = exchangeDetails.btSupply.sub(exBtSupply)
      expectedBtSwapped = args.baseTokenSwappedAmount
      expectedBtSwapped = expectedBtSwapped.sub(args.oceanFeeAmount)
      expectedBtSwapped = expectedBtSwapped.sub(args.marketFeeAmount)
      expectedBtSwapped = expectedBtSwapped.sub(args.consumeMarketFeeAmount)
      
      expect(expectedBtSupply).to.equal(expectedBtSwapped);
      

      // Check dtSupply
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(SwappedEvent[0].args.datatokenSwappedAmount)
      );

      
      expect(exchangeDetails.dtBalance).to.equal(0);
    });



    it("#11 - Alice withdraws BT balance available on the FixedRate contract", async () => {
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetailsBefore.btBalance).to.gt(0);
      const paymentCollector = await erc20Token.getPaymentCollector()
      const btCollectorBeforeSwap = await oceanContract.balanceOf(paymentCollector);
      expect(btCollectorBeforeSwap).to.equal(0); // Alice(owner) has no BT
      const receipt = await (
        await fixedRateExchange
          .connect(alice)
          .collectBT(eventsExchange[0].args.exchangeId, exchangeDetailsBefore.btBalance)
      ).wait();

      const Event = receipt.events.filter((e) => e.event === "TokenCollected");
      expect(Event[0].args.amount).to.equal(
        btCollectorBeforeSwap.add(await oceanContract.balanceOf(paymentCollector))
      );

      const exchangeDetailsAfter = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // alice withdrew all btBalance
      expect(exchangeDetailsAfter.btBalance).to.equal(0);
    });



    

    it("#14 - Non owner(Bob) should not be able to toggle state", async () => {
      await expectRevert(fixedRateExchange.connect(bob)
        .toggleExchangeState(eventsExchange[0].args.exchangeId)
        , "FixedRateExchange: invalid exchange owner")
    });
    it("#15 - Alice should be able to deactivate and then Bob should fail to buy Dataokens", async () => {
      assert(await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      ) === true, "Exchange is not active");
      await fixedRateExchange.connect(alice)
        .toggleExchangeState(eventsExchange[0].args.exchangeId)
      assert(await fixedRateExchange.isActive(
          eventsExchange[0].args.exchangeId
        ) === false, "Exchange is not inactive");
      await expectRevert(
        fixedRateExchange.connect(bob)
        .buyDT(eventsExchange[0].args.exchangeId, "1", noLimit, ZERO_ADDRESS, 0)
        ,"FixedRateExchange: Exchange does not exist!")
      
      await fixedRateExchange.connect(alice)
        .toggleExchangeState(eventsExchange[0].args.exchangeId)
      assert(await fixedRateExchange.isActive(
          eventsExchange[0].args.exchangeId
        ) === true, "Exchange is not active");
      
    });

    it("#16 - Non owner(Bob) should not be able to toggle mint", async () => {
      await expectRevert(fixedRateExchange.connect(bob)
        .toggleMintState(eventsExchange[0].args.exchangeId,true)
        , "FixedRateExchange: invalid exchange owner")
    });
    it("#17 - Alice should be able to toogle mint off and then Bob should fail to buy Dataokens", async () => {
      assert(
        (await fixedRateExchange.getExchange(eventsExchange[0].args.exchangeId)).withMint === true,
      "Mint is not on");
      await fixedRateExchange.connect(alice)
        .toggleMintState(eventsExchange[0].args.exchangeId,false)
        assert(
          (await fixedRateExchange.getExchange(eventsExchange[0].args.exchangeId)).withMint === false,
        "Mint is still on");
      await 
      expectRevert(
        fixedRateExchange.connect(bob)
        .buyDT(eventsExchange[0].args.exchangeId, "1", noLimit, ZERO_ADDRESS, 0)
        ,"FixedRateExchange: No available datatokens")
      
        await fixedRateExchange.connect(alice)
        .toggleMintState(eventsExchange[0].args.exchangeId,true)
        assert(
          (await fixedRateExchange.getExchange(eventsExchange[0].args.exchangeId)).withMint === true,
        "Mint is still off");
      
    });
    it("#18 - Non owner(Bob) should not be able to change rate", async () => {
      await expectRevert(fixedRateExchange.connect(bob)
        .setRate(eventsExchange[0].args.exchangeId, rate)
        , "FixedRateExchange: invalid exchange owner")
    });
    it("#19 - Owner(Alice) should not be able to use rates below minimum", async () => {
      await expectRevert(fixedRateExchange.connect(alice)
        .setRate(eventsExchange[0].args.exchangeId, "0")
        , "FixedRateExchange: Invalid exchange rate value")
    });
    it("#20 - Owner(Alice) should be able to set a new rate", async () => {
      assert(
        web3.utils.toWei(
          web3.utils.fromWei(
            (
              await fixedRateExchange.getRate(eventsExchange[0].args.exchangeId)
            ).toString()
          )
        ) === rate
      );
      rate_decimal = 2;
      rate = web3.utils.toWei(String(rate_decimal));
      await fixedRateExchange.connect(alice).setRate(eventsExchange[0].args.exchangeId, rate)
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
    it("#21 - Bob should buy Dataokens using the new rate", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      
      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit, ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      //expect(
      //  args.baseTokenSwappedAmount
      //    .sub(args.oceanFeeAmount)
      //    .sub(args.marketFeeAmount)
      //).to.equal(args.datatokenSwappedAmount);

      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount.mul(rate_decimal));
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

      // Check dtSupply
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(SwappedEvent[0].args.datatokenSwappedAmount)
      );

      // we also check DT and BT balances were accounted properly
      expect(exchangeDetails.btBalance).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );
      expect(exchangeDetails.dtBalance).to.equal(0);
    });
    it("#22 - Non owner(Bob) should not be able to set allowed swapper", async () => {
      await expectRevert(fixedRateExchange.connect(bob)
        .setAllowedSwapper(eventsExchange[0].args.exchangeId, bob.address)
        , "FixedRateExchange: invalid exchange owner")
    });
    it("#23 - Owner(Alice) should be able to set allowed swapper to only Charlie", async () => {
      let swapper= await fixedRateExchange.getAllowedSwapper(eventsExchange[0].args.exchangeId) 
      assert(swapper === ZERO_ADDRESS);
      await fixedRateExchange.connect(alice).setAllowedSwapper(eventsExchange[0].args.exchangeId, charlie.address)
      swapper= await fixedRateExchange.getAllowedSwapper(eventsExchange[0].args.exchangeId) 
      assert(swapper === charlie.address);
    });
    it("#24 - Bob should fail to buy Dataokens, because he is not an allowed swapper", async () => {
      await expectRevert(
        fixedRateExchange.connect(bob)
        .buyDT(eventsExchange[0].args.exchangeId, "1", noLimit, ZERO_ADDRESS, 0)
        ,"FixedRateExchange: This address is not allowed to swap")
    });
  });
  describe("#2 - Exchange with baseToken(OCEAN) 18 Decimals and datatoken 18 Decimals, RATE = 2", async () => {
    let amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works
    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      rate_decimal = 2;
      rate = web3.utils.toWei(String(rate_decimal));
      baseTokenContract = oceanContract
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
            [baseTokenContract.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
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
      expect(eventsExchange[0].args.owner).to.equal(web3.utils.toChecksumAddress(alice.address));
      expect(eventsExchange[0].args.baseToken).to.equal(web3.utils.toChecksumAddress(baseTokenContract.address));

      const fixedrates = await erc20Token.getFixedRates()
      assert(fixedrates[0].contractAddress === web3.utils.toChecksumAddress(fixedRateExchange.address),
        "Fixed Rate exchange not found in erc20Token.getFixedRates()")
      assert(fixedrates[0].id === eventsExchange[0].args.exchangeId,
        "Fixed Rate exchange not found in erc20Token.getFixedRates()")
    });

    it("#3 - bob approve contracts to spend tokens", async () => {
      // bob approves a big amount so that we don't need to re-approve during test
      await baseTokenContract
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("1000000"));
    });

    it("#4 - should get the exchange rate", async () => {
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

    it("#5 - Bob should buy Dataokens using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await oceanContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(0); // Alice(owner) has no BT

      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit, ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      //expect(
      //  args.baseTokenSwappedAmount
      //    .sub(args.oceanFeeAmount)
      //    .sub(args.marketFeeAmount)
      //).to.equal(args.datatokenSwappedAmount);

      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)          
      ).to.equal(args.datatokenSwappedAmount.mul(rate_decimal));
      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await baseTokenContract.balanceOf(alice.address)).to.equal(
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

      // Check dtSupply
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(SwappedEvent[0].args.datatokenSwappedAmount)
      );

      // we also check DT and BT balances were accounted properly
      expect(exchangeDetails.btBalance).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );
      expect(exchangeDetails.dtBalance).to.equal(0);
    });
  });

  describe("#3 - Exchange with baseToken(DAI) 18 Decimals and datatoken 18 Decimals, RATE = 2", async () => {
    let amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      marketFee = 1e15;
      rate_decimal = 2;
      rate = web3.utils.toWei(String(rate_decimal));
      baseTokenContract = daiContract
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
            [baseTokenContract.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
            [18, 18, rate, marketFee, 1]
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      expect(eventsExchange[0].args.owner).to.equal(web3.utils.toChecksumAddress(alice.address));
      expect(eventsExchange[0].args.baseToken).to.equal(web3.utils.toChecksumAddress(baseTokenContract.address));

      const fixedrates = await erc20Token.getFixedRates()
      assert(fixedrates[0].contractAddress === web3.utils.toChecksumAddress(fixedRateExchange.address),
        "Fixed Rate exchange not found in erc20Token.getFixedRates()")
      assert(fixedrates[0].id === eventsExchange[0].args.exchangeId,
        "Fixed Rate exchange not found in erc20Token.getFixedRates()")
    });

    it("#3 - bob approve contracts to spend tokens", async () => {
      // bob approves a big amount so that we don't need to re-approve during test
      await baseTokenContract
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("1000000"));
    });

    it("#4 - should get the exchange rate", async () => {
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

    it("#5 - Bob should buy Dataokens using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await baseTokenContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(0); // Alice(owner) has no BT

      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit, ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      //expect(
      //  args.baseTokenSwappedAmount
      //    .sub(args.oceanFeeAmount)
      //    .sub(args.marketFeeAmount)
      //).to.equal(args.datatokenSwappedAmount);

      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
      ).to.equal(args.datatokenSwappedAmount.mul(rate_decimal));
      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await baseTokenContract.balanceOf(alice.address)).to.equal(
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

      // Check dtSupply
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(SwappedEvent[0].args.datatokenSwappedAmount)
      );

      // we also check DT and BT balances were accounted properly
      expect(exchangeDetails.btBalance).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );
      expect(exchangeDetails.dtBalance).to.equal(0);
    });
  });
  describe("#4 - Exchange with baseToken(USDC) 6 Decimals and datatoken 18 Decimals, RATE = 2", async () => {
    let amountDTtoSell = web3.utils.toWei("10"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      marketFee = 1e15;
      rate_decimal = 2;
      rate = web3.utils.toWei(String(rate_decimal));
      baseTokenContract = usdcContract
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
            [baseTokenContract.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
            [6, 18, rate, marketFee, 1]
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      expect(eventsExchange[0].args.owner).to.equal(web3.utils.toChecksumAddress(alice.address));
      expect(eventsExchange[0].args.baseToken).to.equal(web3.utils.toChecksumAddress(baseTokenContract.address));

      const fixedrates = await erc20Token.getFixedRates()
      assert(fixedrates[0].contractAddress === web3.utils.toChecksumAddress(fixedRateExchange.address),
        "Fixed Rate exchange not found in erc20Token.getFixedRates()")
      assert(fixedrates[0].id === eventsExchange[0].args.exchangeId,
        "Fixed Rate exchange not found in erc20Token.getFixedRates()")
    });

    it("#3 - bob approve contracts to spend tokens", async () => {
      // bob approves a big amount so that we don't need to re-approve during test
      await baseTokenContract
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("1000000"));
    });

    it("#4 - should get the exchange rate", async () => {
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

    it("#5 - Bob should buy Dataokens using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await baseTokenContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(0); // Alice(owner) has no BT

      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit, ZERO_ADDRESS, 0)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      const args = SwappedEvent[0].args;

      // we check that proper amount is being swapped (rate=1)
      //expect(
      //  args.baseTokenSwappedAmount
      //    .sub(args.oceanFeeAmount)
      //    .sub(args.marketFeeAmount)
      //).to.equal(args.datatokenSwappedAmount);
      expect(
        args.baseTokenSwappedAmount
          .sub(args.oceanFeeAmount)
          .sub(args.marketFeeAmount)
          .mul(1e12)
      ).to.equal(args.datatokenSwappedAmount.mul(rate_decimal));


      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.datatokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

      // ALICE's BT balance hasn't increasead.
      expect(await baseTokenContract.balanceOf(alice.address)).to.equal(
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

      // Check dtSupply
      expect(exchangeDetails.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(SwappedEvent[0].args.datatokenSwappedAmount)
      );

      // we also check DT and BT balances were accounted properly
      expect(exchangeDetails.btBalance).to.equal(
        args.baseTokenSwappedAmount.sub(
          args.oceanFeeAmount.add(args.marketFeeAmount)
        )
      );
      expect(exchangeDetails.dtBalance).to.equal(0);
    });
  });


  describe("#4 - Exchange with not allowed token, RATE = 2", async () => {
    let amountDTtoSell = web3.utils.toWei("10"); // exact amount so that we can check if balances works

    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
      marketFee = 1e15;
      rate_decimal = 2;
      rate = web3.utils.toWei(String(rate_decimal));
      baseTokenContract = bogusContract
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
            [baseTokenContract.address, alice.address, marketFeeCollector.address, ZERO_ADDRESS],
            [6, 18, rate, marketFee, 1]
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      expect(eventsExchange[0].args.owner).to.equal(web3.utils.toChecksumAddress(alice.address));
      expect(eventsExchange[0].args.baseToken).to.equal(web3.utils.toChecksumAddress(baseTokenContract.address));

      const fixedrates = await erc20Token.getFixedRates()
      assert(fixedrates[0].contractAddress === web3.utils.toChecksumAddress(fixedRateExchange.address),
        "Fixed Rate exchange not found in erc20Token.getFixedRates()")
      assert(fixedrates[0].id === eventsExchange[0].args.exchangeId,
        "Fixed Rate exchange not found in erc20Token.getFixedRates()")
    });

    it("#3 - bob approve contracts to spend tokens", async () => {
      // bob approves a big amount so that we don't need to re-approve during test
      await baseTokenContract
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("1000000"));
    });

    it("#4 - should get the exchange rate", async () => {
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

    it("#5 - Bob should not be able to buy Dataokens using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      const btAliceBeforeSwap = await baseTokenContract.balanceOf(alice.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      expect(btAliceBeforeSwap).to.equal(0); // Alice(owner) has no BT

      const exchangeDetailsBefore = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );

      // BOB is going to buy all DT availables
      amountDT = amountDTtoSell;

      
      await expectRevert(fixedRateExchange
          .connect(bob)
          .buyDT(eventsExchange[0].args.exchangeId, amountDT, noLimit, ZERO_ADDRESS, 0)
      ,'This baseToken is not allowed by enterprise fee collector')

    });
  });

});