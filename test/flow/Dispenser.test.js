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
const {getEventFromTx} = require("../helpers/utils")
const constants = require("../helpers/constants");
const { web3, BN } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const { MAX_UINT256 } = require("@openzeppelin/test-helpers/src/constants");
const ethers = hre.ethers;

// TEST NEW FUNCTIONS, FOR UNIT TEST REFER TO V3 CONTRACTS BRANCH
describe("Dispenser", () => {
  let alice, // DT Owner and exchange Owner
    exchangeOwner,
    bob, // BaseToken Holder
    dispenser,
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
    marketFee = 0, // 0.1%
    oceanFee = 0; // 0.1%
  (dtIndex = null),
    (oceanIndex = null),
    (daiIndex = null),
    (cap = web3.utils.toWei("100000"));

  const oceanAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
  const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
  const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  before("init contracts for each test", async () => {
    MockERC20 = await ethers.getContractFactory("MockERC20Decimals");
    const Dispenser = await ethers.getContractFactory(
      "Dispenser"
    );

    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");

    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("SideStaking");

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

   


    data = web3.utils.asciiToHex("SomeData");
    flags = web3.utils.asciiToHex(constants.blob[0]);

    // DEPLOY ROUTER, SETTING OWNER
    router = await Router.deploy(
      owner.address,
      oceanAddress,
      oceanAddress, // pooltemplate field, unused in this test
      opfCollector.address,
      []
    );

    sideStaking = await SSContract.deploy(router.address);

    dispenser = await Dispenser.deploy(
      router.address
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

    await router.addFixedRateContract(dispenser.address);

    await router.addSSContract(sideStaking.address)
    
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

  
  describe("#1 - Exchange with baseToken(USDC) 6 Decimals and dataToken 18 Decimals, RATE = 0", async () => {
   
    amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works
    marketFee = 0
    it("#1 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
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

      await erc20Token.connect(alice).mint(alice.address, cap);
      expect(await erc20Token.balanceOf(alice.address)).to.equal(cap);

      mockDT18 = erc20Token;
    });

    it("#2 - create exchange", async () => {
      rate = 0

      // interface has been modified a bit to be compatible with router etc. if this is going to stay, will update that to be more flexible
      receipt = await (
        await mockDT18
          .connect(alice)
          .createFixedRate(
            dispenser.address,
            [alice.address],
            [18]
          )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter((e) => e.event === "NewFixedRate");

      expect(eventsExchange[0].args.owner).to.equal(alice.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await dispenser.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await dispenser.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(0);
    });

    it("#5 - alice approves Dispenser to spend tokens", async () => {
      // alice approves how many DT tokens wants to sell
      // we only approve an exact amount
      await mockDT18
        .connect(alice)
        .approve(dispenser.address, amountDTtoSell);

    });

    it("#6 - should check that the exchange has supply ", async () => {
      // NOW dtSupply has increased (because alice(exchangeOwner) approved DT). Bob approval has no effect on this
      const exchangeDetails = await dispenser.getExchange(
        eventsExchange[0].args.exchangeId
      );
      expect(exchangeDetails.dtSupply).to.equal(amountDTtoSell);
     
    
    });


    it("#7 - Bob should get 50% DataTokens available(50% amount exchangeOwner approved) using the fixed rate exchange contract", async () => {
      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceBeforeSwap).to.equal(0); // BOB HAS NO DT
      

      // BOB is going to buy 50% of all DT availables
      amountDT = web3.utils.toWei('5000')
      const receipt = await (
        await dispenser
          .connect(bob)
          .getDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "TokenDispensed");

      const args = SwappedEvent[0].args;
   

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );


      // BT are into the FixedRate contract.
      const exchangeDetails = await dispenser.getExchange(
        eventsExchange[0].args.exchangeId
      );
      

      // Bob bought all DT on sale so now dtSupply is half (equal to amountDT)
      expect(exchangeDetails.dtSupply).to.equal(amountDT);

    
      
     
    });


    it("#8- Bob buys  20% of DataTokens available", async () => {
      const exchangeDetailsBefore = await dispenser.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
    
      console.log(dtBobBalanceBeforeSwap.toString())
      expect(dtBobBalanceBeforeSwap).to.equal(web3.utils.toWei("5000")); // BOB HAS NO DT
 

      // BOB is going to buy20% of  all DT availables
      amountDT = web3.utils.toWei("2000");
      const receipt = await (
        await dispenser
          .connect(bob)
          .getDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "TokenDispensed");
      const args = SwappedEvent[0].args;

     

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

     


      const exchangeDetailsAfter = await dispenser.getExchange(
        eventsExchange[0].args.exchangeId
      );

     

      // Bob bought 20% of  DT on sale so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );

      

    });


    it("#9 - Bob get back all DT left (30%) of DataTokens available", async () => {
      const exchangeDetailsBefore = await dispenser.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
   
      expect(dtBobBalanceBeforeSwap).to.equal(web3.utils.toWei("7000")); // BOB HAS 50% of initial DT available
    

      // BOB is going to buy 30% of  all DT availables
      amountDT = web3.utils.toWei("3000");
      const receipt = await (
        await dispenser
          .connect(bob)
          .getDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "TokenDispensed");

      const args = SwappedEvent[0].args;
     
      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

  

      // BT are into the FixedRate contract.
      const exchangeDetailsAfter = await dispenser.getExchange(
        eventsExchange[0].args.exchangeId
      );

   
      // Bob got 20% of  DTs so now dtSupply decreased
      expect(exchangeDetailsAfter.dtSupply).to.equal(
        exchangeDetailsBefore.dtSupply.sub(
          SwappedEvent[0].args.dataTokenSwappedAmount
        )
      );



   
    });


    it("#10 - Bob attermps to buy more DT but fails, then alice approves more and he succeeds", async () => {
      const exchangeDetailsBefore = await dispenser.getExchange(
        eventsExchange[0].args.exchangeId
      );

      const dtBobBalanceBeforeSwap = await mockDT18.balanceOf(bob.address);
   
      expect(dtBobBalanceBeforeSwap).to.equal(amountDTtoSell); // BOB HAS 100% of initial DT available
   
      // BOB is going to buy more DT but fails because alice hasn't approved more
      amountDT = web3.utils.toWei("8000");

      expect(exchangeDetailsBefore.dtSupply).to.equal(0);

      await expectRevert(
        dispenser
          .connect(bob)
          .getDT(eventsExchange[0].args.exchangeId, amountDT),
        "ERC20: transfer amount exceeds allowance"
      );

      // now alice approves more DT (8000)

      await mockDT18
        .connect(alice)
        .approve(dispenser.address, amountDT);

      expect(
        (await dispenser.getExchange(eventsExchange[0].args.exchangeId))
          .dtSupply
      ).to.equal(amountDT);

      // Now bob can get more
      const receipt = await (
        await dispenser
          .connect(bob)
          .getDT(eventsExchange[0].args.exchangeId, amountDT)
      ).wait();

      const SwappedEvent = receipt.events.filter((e) => e.event === "TokenDispensed");
      const args = SwappedEvent[0].args;
      

      // BOB's DTbalance has increased
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      expect(dtBobBalanceAfterSwap).to.equal(
        SwappedEvent[0].args.dataTokenSwappedAmount.add(dtBobBalanceBeforeSwap)
      );

    

      const exchangeDetailsAfter = await dispenser.getExchange(
        eventsExchange[0].args.exchangeId
      );

  
      // Bob got again alls DT on sale so now dtSupply is 0
      expect(exchangeDetailsAfter.dtSupply).to.equal(0);

    });

 


  });
});