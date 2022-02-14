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
describe("Dispenser", () => {
  let alice, // DT Owner and exchange Owner
    exchangeOwner,
    bob, // baseToken Holder
    charlie,
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
    erc20Token2,
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
  

  before("init contracts for each test", async () => {
  
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
      opcCollector,
    ] = await ethers.getSigners();

    alice = user3;
    exchangeOwner = user3;
    bob = user4;
    charlie = user5;

    rate = web3.utils.toWei("1");




    data = web3.utils.asciiToHex("SomeData");
    flags = web3.utils.asciiToHex(constants.blob[0]);

    // DEPLOY ROUTER, SETTING OWNER
    router = await Router.deploy(
      owner.address,
      oceanAddress,
      oceanAddress, // pooltemplate field, unused in this test
      opcCollector.address,
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
      opcCollector.address,
      router.address
    );

    // SET REQUIRED ADDRESS


    await router.addFactory(factoryERC721.address);

    await router.addDispenserContract(dispenser.address);

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


  describe("#1 - Dispenser", async () => {

    amountDTtoSell = web3.utils.toWei("10000"); // exact amount so that we can check if balances works
    marketFee = 0
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

    it("#2 - user3 (alice) create a new erc20DT, assigning herself as minter", async () => {
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

      erc20Token2 = await ethers.getContractAt("ERC20Template", erc20Address);
      assert((await erc20Token2.permissions(user3.address)).minter == true);



    });

    it('#2 - Alice creates a dispenser with minter role', async () => {
      let tx = await erc20Token.connect(alice).createDispenser(
        dispenser.address, web3.utils.toWei('1'), web3.utils.toWei('1'), true, ZERO_ADDRESS)
      assert(tx,
        'Cannot activate dispenser')
      const dispensers = await erc20Token.getDispensers()
      assert(dispensers.includes(web3.utils.toChecksumAddress(dispenser.address)), "Dispenser not found in erc20Token.getDispensers()")
    })

    it("#getId - should return templateID", async () => {
      const templateId = 1;
      assert((await dispenser.getId()) == templateId);
    });
    it('#3 - Alice gets the dispenser status', async () => {
      const status = await dispenser.status(erc20Token.address)
      assert(status.active === true, 'Dispenser not active')
      assert(status.owner === alice.address, 'Dispenser owner is not alice')
      assert(status.isMinter === true, 'Dispenser is not a minter')
    })

    it('#4 - Bob requests more datatokens then allowed', async () => {
      await expectRevert(
        dispenser
          .connect(bob)
          .dispense(erc20Token.address, web3.utils.toWei('10'),bob.address),
        "Amount too high"
      );
    })
    it('Bob requests datatokens', async () => {
      const tx = await dispenser.connect(bob).dispense(erc20Token.address, web3.utils.toWei('1'),bob.address)
      assert(tx,
        'Bob failed to get 1DT')
    })
    it('Bob requests more datatokens but he exceeds maxBalance', async () => {
      await expectRevert(
        dispenser
          .connect(bob)
          .dispense(erc20Token.address, web3.utils.toWei('1'),bob.address),
        "Caller balance too high"
      );
    })
    it('Alice deactivates the dispenser', async () => {
      await dispenser.connect(alice).deactivate(erc20Token.address)
      const status = await dispenser.status(erc20Token.address)
      assert(status.active === false, 'Dispenser is still active')
    })
    it('Charlie should fail to get datatokens', async () => {
      await expectRevert(
        dispenser
          .connect(charlie)
          .dispense(erc20Token.address, web3.utils.toWei('1'),charlie.address),
        "Dispenser not active"
      );
    })

    it('Bob should fail to activate a dispenser for a token for he is not a mineter', async () => {
      await expectRevert(
        dispenser
          .connect(bob)
          .activate(erc20Token.address, web3.utils.toWei('1'), web3.utils.toWei('1')),
        "Invalid owner"
      );
    })

    it('Alice creates a dispenser without minter role', async () => {
      const tx = await erc20Token2.connect(alice).createDispenser(
        dispenser.address, web3.utils.toWei('1'), web3.utils.toWei('1'), false, ZERO_ADDRESS)
      assert(tx,
        'Cannot activate dispenser')
    })
    it('Bob requests datatokens but there are none', async () => {
      await expectRevert(
        dispenser
          .connect(bob)
          .dispense(erc20Token2.address, web3.utils.toWei('1'),bob.address),
        "Not enough reserves"
      );
    })
    it('Alice mints tokens and transfer them to the dispenser.', async () => {
      await erc20Token2.connect(alice).mint(dispenser.address, cap)
      const status = await dispenser.status(erc20Token2.address)
      assert(status.balance.eq(await erc20Token2.balanceOf(dispenser.address)), 'Balances do not match')
    })
    it('Bob requests datatokens', async () => {
      const tx = await dispenser.connect(bob).dispense(erc20Token2.address, web3.utils.toWei('1'),bob.address)
      assert(tx,
        'Bob failed to get 1DT')
    })
    it('Bob tries to withdraw all datatokens', async () => {
      await expectRevert(
        dispenser
          .connect(bob)
          .ownerWithdraw(erc20Token2.address),
        "Invalid owner"
      );
    })
    it('Alice withdraws all datatokens', async () => {
      const tx = await dispenser.connect(alice).ownerWithdraw(erc20Token2.address)
      assert(tx,
        'ALice failed to withdraw all datatokens')
      const status = await dispenser.status(erc20Token2.address)
      assert(status.balance.eq(0), 'Balance > 0')
    })



  });

});