/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const {getEventFromTx} = require("../helpers/utils")
const { impersonate } = require("../helpers/impersonate");
const constants = require("../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const ethers = hre.ethers;

describe("NFT Creation, roles and erc20 deployments", () => {
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
    erc20Token2;

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";

  const oceanAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
  before("init contracts for each test", async () => {
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");
    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("SideStaking");
    const BPool = await ethers.getContractFactory("BPool");

    [
      owner,
      reciever,
      user2,
      user3,
      user4,
      newOwner,
      opcCollector
    ] = await ethers.getSigners();

    data = web3.utils.asciiToHex("SomeData");
    flags = web3.utils.asciiToHex(constants.blob[0]);
    
    poolTemplate = await BPool.deploy();

   
    // DEPLOY ROUTER, SETTING OWNER
    router = await Router.deploy(
      owner.address,
      oceanAddress,
      poolTemplate.address,
      opcCollector.address,
      []
    );

    sideStaking = await SSContract.deploy(router.address);

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

    await router.addSSContract(sideStaking.address)

    //await router.addFixedRate()
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
    const event = getEventFromTx(txReceipt,'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
    tokenAddress = event.args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);

    assert((await tokenERC721.balanceOf(owner.address)) == 1);
  });

  it("#2 - owner is already manager and can assign or revoke roles to himself or others", async () => {
    // NFT Owner is also added as manager when deploying (first time), if transferred that doesn't apply
    assert((await tokenERC721.getPermissions(owner.address)).manager == true);

    // In this test we are going to assign user2 as manager, which then adds roles and delegates user3 as store updater(725Y), erc20 deployer and metadata updater.
    assert((await tokenERC721.getPermissions(user2.address)).manager == false);
    await tokenERC721.addManager(user2.address);
    assert((await tokenERC721.getPermissions(user2.address)).manager == true);

    assert((await tokenERC721.getPermissions(user3.address)).store == false);
    assert(
      (await tokenERC721.getPermissions(user3.address)).deployERC20 == false
    );
    assert(
      (await tokenERC721.getPermissions(user3.address)).updateMetadata == false
    );

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
      [user3.address,user4.address, user3.address,'0x0000000000000000000000000000000000000000'],
      [web3.utils.toWei("10"),0],
      []
    );
    const trxReceiptERC20 = await trxERC20.wait();
    const event = getEventFromTx(trxReceiptERC20,'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    erc20Address = event.args[0];

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
    assert((await erc20Token.permissions(user3.address)).minter == true);
  });

  it("#4 - user3 mints new erc20 token to user4", async () => {
    await erc20Token.connect(user3).mint(user4.address, web3.utils.toWei("2"));

    assert(
      (await erc20Token.balanceOf(user4.address)) == web3.utils.toWei("2")
    );
  });

  it("#5 - user3 deploys a new erc20DT, assigning user4 as minter", async () => {
    const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1","ERC20DT1Symbol"],
      [user4.address,user4.address, user4.address,'0x0000000000000000000000000000000000000000'],
      [web3.utils.toWei("10"),0],
      []
    );
    const trxReceiptERC20 = await trxERC20.wait();
    const event = getEventFromTx(trxReceiptERC20,'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    erc20Address = event.args[0];
    
    erc20Token2 = await ethers.getContractAt("ERC20Template", erc20Address);
    assert((await erc20Token2.permissions(user4.address)).minter == true);
  });

  it("#7 - user4 mints new erc20 token2 to user3", async () => {
    await erc20Token2.connect(user4).mint(user3.address, web3.utils.toWei("2"));

    assert(
      (await erc20Token2.balanceOf(user3.address)) == web3.utils.toWei("2")
    );
  });

  it("#8 - user3 (has erc20 deployer permission) updates ERC20 data (fix key)", async () => {
    // This is a special metadata, it's callable only from the erc20Token contract and
    // can be done only by who has deployERC20 rights(rights to create new erc20 token contract)
    // the value is stored into the 725Y standard with a predefined key which is the erc20Token address
    const key = web3.utils.keccak256(erc20Token.address);
    const value = web3.utils.asciiToHex("SomeData");
    assert((await tokenERC721.getData(key)) == "0x");
    await erc20Token.connect(user3).setData(value);
    assert((await tokenERC721.getData(key)) == value);
  });

  it("#9 - user3 updates the metadata (725Y) with arbitrary keys", async () => {
    // This one is the generic version of updating data into the key-value story.
    // Only users with 'store' permission can do that.
    // NOTE: in this function the key is chosen by the caller.
    const key = web3.utils.keccak256("ARBITRARY_KEY");
    const value = web3.utils.asciiToHex("SomeData");

    assert((await tokenERC721.getData(key)) == "0x");

    await tokenERC721.connect(user3).setNewData(key, value);

    assert((await tokenERC721.getData(key)) == value);
  });

  it("#10 - owner now decides to sell and transfer the NFT, he first calls cleanPermissions, then transfer the NFT", async () => {
    // WHEN TRANSFERING THE NFT with transferFrom we actually perform a safeTransferFrom.
    // Transferring the NFT cleans all permissions both at 721 level and into each erc20

    assert((await tokenERC721.ownerOf(1)) == owner.address);

    await expectRevert(
      tokenERC721
        .connect(user2)
        .transferFrom(owner.address, newOwner.address, 1),
      "ERC721: transfer caller is not owner nor approved"
    );

    await tokenERC721
      .connect(owner)
      .transferFrom(owner.address, newOwner.address, 1);

    assert((await tokenERC721.balanceOf(owner.address)) == 0);

    assert((await tokenERC721.ownerOf(1)) == newOwner.address);
  });

  it("#11 - owner is not NFT owner anymore, nor has any other role, neither older users", async () => {
    await expectRevert(
      tokenERC721
        .connect(user3)
        .createERC20(1,
          ["ERC20DT2","ERC20DT2Symbol"],
          [user2.address,user3.address, user2.address,'0x0000000000000000000000000000000000000000'],
          [web3.utils.toWei("10"),0],
          []
        ),
      "ERC721Template: NOT ERC20DEPLOYER_ROLE"
    );

    await expectRevert(
      erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("1")),
      "ERC20Template: NOT MINTER"
    );

    await expectRevert(
      erc20Token2.connect(user4).mint(user2.address, web3.utils.toWei("1")),
      "ERC20Template: NOT MINTER"
    );
  });

  it("#12 - newOwner now owns the NFT, is already Manager by default and has all roles", async () => {
    assert(
      (await tokenERC721.getPermissions(newOwner.address)).manager == true
    );
    await 
      tokenERC721
        .connect(newOwner)
        .createERC20(1,
          ["ERC20DT2","ERC20DT2Symbol"],
          [user2.address,user3.address, user2.address,'0x0000000000000000000000000000000000000000'],
          [web3.utils.toWei("10"),0],
          []
        ),
     
    await erc20Token.connect(newOwner).addMinter(newOwner.address);
    await erc20Token.connect(newOwner).mint(user2.address, web3.utils.toWei("1"))
     
    
  });

  it("#13 - owner deploys a new non-transferable ERC721 Contract and fails to transfer", async () => {
    // by default connect() in ethers goes with the first address (owner in this case)
    const tx = await factoryERC721.deployERC721Contract(
      "NFT",
      "NFTSYMBOL",
      1,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/",
      false,
      owner.address
    );
    const txReceipt = await tx.wait();
    const event = getEventFromTx(txReceipt,'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
    tokenAddress = event.args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);

    assert((await tokenERC721.balanceOf(owner.address)) == 1);

    assert((await tokenERC721.ownerOf(1)) == owner.address);

    await expectRevert(
      tokenERC721
        .connect(user2)
        .transferFrom(owner.address, newOwner.address, 1),
      "ERC721Template: Is non transferable"
    );
  });
});
