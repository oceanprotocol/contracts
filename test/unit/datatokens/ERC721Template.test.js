/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const ethers = hre.ethers;

describe("ERC721Template", () => {
  let name,
    symbol,
    owner,
    reciever,
    metadata,
    tokenERC721,
    tokenAddress,
    data,
    flags,
    factoryERC721,
    factoryERC20,
    templateERC721,
    templateERC20,
    newERC721Template;

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  beforeEach("init contracts for each test", async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/eOqKsGAdsiNLCVm846Vgb-6yY3jlcNEo",
          blockNumber: 12515000,
        }
      }]
    })
    
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");
    const ERC20Factory = await ethers.getContractFactory("ERC20Factory");

    const Metadata = await ethers.getContractFactory("Metadata");

    [owner, reciever, user2, user3] = await ethers.getSigners();

    // cap = new BigNumber('1400000000')
    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);
    metadata = await Metadata.deploy();
    //console.log(metadata.address)

    templateERC20 = await ERC20Template
      .deploy
      // "TemplateERC20",
      // "TEMPLATE20",
      // user2.address,
      // web3.utils.toWei("22"),
      // communityFeeCollector
      ();
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );
    templateERC721 = await ERC721Template
      .deploy
      // "TemplateERC721",
      // "TEMPLATE721"
      ();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      communityFeeCollector,
      factoryERC20.address
    );

    newERC721Template = await ERC721Template
      .deploy
      // "TemplateERC721",
      // "TEMPLATE721"
      ();

    await metadata.setERC20Factory(factoryERC20.address);
    await factoryERC20.setERC721Factory(factoryERC721.address);

    const tx = await factoryERC721.deployERC721Contract(
      "DT1",
      "DTSYMBOL",
      metadata.address,
      data,
      flags,
      1
    );
    const txReceipt = await tx.wait();

    //  console.log(txReceipt.events[3].topics[0])
    //console.log(txReceipt.events[3].args[0])
    //  const test = await expectEvent(txReceipt,'TokenCreated')
    //     console.log(test)
    tokenAddress = txReceipt.events[4].args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);
    symbol = await tokenERC721.symbol();
    name = await tokenERC721.name();
    assert(name === "DT1");
    assert(symbol === "DTSYMBOL");
    //await tokenERC721.addManager(owner.address);
  });

  it("#isInitialized - should check that the tokenERC721 contract is initialized", async () => {
    expect(await tokenERC721.isInitialized()).to.equal(true);
  });

  it("#initialize - should fail to re-initialize the contracts", async () => {
    await expectRevert(
      tokenERC721.initialize(
        owner.address,
        "NewName",
        "NN",
        metadata.address,
        factoryERC20.address,
        data,
        flags
      ),
      "ERC721Template: token instance already initialized"
    );
  });

  it("#mint - should mint 1 ERC721 to owner", async () => {
  
    assert((await tokenERC721.balanceOf(owner.address)) == 1);
  });

  it("#updateMetadata - should not be allowed to update the metadata if NOT in MetadataList", async () => {
    await expectRevert(
      tokenERC721.updateMetadata(data, flags),
      "ERC721Template: NOT METADATA_ROLE"
    );
  });

  it("#updateMetadata - should update the metadata, after adding address to MetadataList", async () => {
    await tokenERC721.addToMetadataList(owner.address);
    await tokenERC721.updateMetadata(data, flags);
  });

  it("#createERC20 - should not allow to create a new ERC20Token if NOT in CreateERC20List", async () => {
    await expectRevert(
      tokenERC721.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1
      ),
      "ERC721Template: NOT MINTER_ROLE"
    );
  });

  it("#createERC20 - should create a new ERC20Token, after adding address to CreateERC20List", async () => {
    await tokenERC721.addToCreateERC20List(owner.address);
    await tokenERC721.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1
    );
  });

  it("#cleanPermissions - should fail to clean lists, if not NFT Owner", async () => {
    await expectRevert(
      tokenERC721.connect(user2).cleanPermissions(),
      "ERC721Template: not NFTOwner"
    );
  });

  it("#cleanPermissions - should clean lists, only NFT Owner", async () => {
    await tokenERC721.addToCreateERC20List(owner.address);
    await tokenERC721.addToCreateERC20List(user2.address);

    assert(
      (await tokenERC721._getPermissions(owner.address)).deployERC20 == true
    );
    assert(
      (await tokenERC721._getPermissions(user2.address)).deployERC20 == true
    );

    await expectRevert(
      tokenERC721.connect(user2).cleanPermissions(),
      "ERC721Template: not NFTOwner"
    );

    await tokenERC721.cleanPermissions();

    assert(
      (await tokenERC721._getPermissions(owner.address)).deployERC20 == false
    );
    assert(
      (await tokenERC721._getPermissions(user2.address)).deployERC20 == false
    );
    assert(
      (await tokenERC721._getPermissions(user3.address)).deployERC20 == false
    );

    await tokenERC721.addManager(owner.address); // WE CLEANED OURSELF TO FROM ALL LISTS, so we need to re-ADD us.

    await tokenERC721.addToCreateERC20List(user3.address);
    assert((await tokenERC721.auth(0)) == owner.address);
    assert((await tokenERC721.auth(1)) == user3.address);
  });

  it("#addManager - should succed to add a new manager, if NFT owner", async () => {
    assert(
      (await tokenERC721._getPermissions(user2.address)).manager == false
    );
    await tokenERC721.addManager(user2.address);

    assert(
      (await tokenERC721._getPermissions(user2.address)).manager == true
    );
   
  });
  it("#addManager - should fail to add a new manager, when NOT NFT owner", async () => {
    assert(
      (await tokenERC721._getPermissions(user3.address)).manager == false
    );
    
    await expectRevert(
      tokenERC721.connect(user2).addManager(user3.address),
      "ERC721Template: not NFTOwner"
    );
    
    assert(
      (await tokenERC721._getPermissions(user3.address)).manager == false
    );
    
  });

  it("#removeManager - should succed to remove a manager, if NFT owner", async () => {
    await tokenERC721.addManager(user2.address);
    assert(
      (await tokenERC721._getPermissions(user2.address)).manager == true
    );
    await tokenERC721.removeManager(user2.address);

    assert(
      (await tokenERC721._getPermissions(user2.address)).manager == false
    );
    
  });

  it("#removeManager - should fail to remove a manager, when NOT NFT owner", async () => {
    await tokenERC721.addManager(user3.address);
    assert(
      (await tokenERC721._getPermissions(user3.address)).manager == true
    );
    
    await expectRevert(
      tokenERC721.connect(user2).removeManager(user3.address),
      "ERC721Template: not NFTOwner"
    );
    
    assert(
      (await tokenERC721._getPermissions(user3.address)).manager == true
    );
    
  });

  it("#removeManager - should succed to remove and re-add the NFT owner from manager list, if NFT owner", async () => {
    
    assert(
      (await tokenERC721._getPermissions(owner.address)).manager == true
    );
    await tokenERC721.removeManager(owner.address);

    assert(
      (await tokenERC721._getPermissions(owner.address)).manager == false
    );
    await tokenERC721.addManager(owner.address);
    
    assert(
      (await tokenERC721._getPermissions(owner.address)).manager == true
    );
  });
  it("#executeCall - should fail to call executeCall, if NOT manager", async () => {
    const operation = 0
    const to = user2.address
    const value = 10
    const data = '0x00'

    assert(
      (await tokenERC721._getPermissions(user2.address)).manager == false
    );
    
    await expectRevert(
      tokenERC721.connect(user2).executeCall(operation,to,value,data),
      "ERC721RolesAddress: NOT MANAGER"
    );

    
  });

  it("#executeCall - should succed to call executeCall, if Manager", async () => {
    const operation = 0
    const to = user2.address
    const value = 10
    const data = '0x00'

    assert(
      (await tokenERC721._getPermissions(owner.address)).manager == true
    );
    
   
     await tokenERC721.executeCall(operation,to,value,data)
    
  });


  xit("#transferNFT - should transfer properly the NFT, now the new user is the owner for ERC721Template and ERC20Template", async () => {
    await tokenERC721.addToCreateERC20List(owner.address);
    const trxERC20 = await tokenERC721.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1
    );
    const trxReceiptERC20 = await trxERC20.wait();
    erc20Address = trxReceiptERC20.events[3].args.erc20Address;

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);

    await erc20Token.addMinter(owner.address);
    await erc20Token.mint(user2.address, web3.utils.toWei("2"));

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("2")
    );

    assert((await tokenERC721.ownerOf(1)) == owner.address);
    await tokenERC721.transferFrom(owner.address, user2.address, 1);
    assert((await tokenERC721.balanceOf(owner.address)) == 0);
    assert((await tokenERC721.ownerOf(1)) == user2.address);

    await tokenERC721.removeFromCreateERC20List(owner.address); // WE CAN STILL DO THAT because the owner is still Manager

    await expectRevert(
      tokenERC721.createERC20(
        "ERC20DT2",
        "ERC20DT2Symbol",
        web3.utils.toWei("10"),
        1
      ),
      "ERC721Template: NOT MINTER_ROLE"
    );
    await tokenERC721.connect(user2).cleanPermissions();

    await tokenERC721.connect(user2).addManager(user2.address);
    await tokenERC721.connect(user2).addToCreateERC20List(user2.address);
    await tokenERC721
      .connect(user2)
      .createERC20("ERC20DT2", "ERC20DT2Symbol", web3.utils.toWei("10"), 1);

    await erc20Token.connect(user2).cleanPermissions();

    await expectRevert(
      erc20Token.mint(user2.address, web3.utils.toWei("1")),
      "ERC20Template: NOT MINTER"
    );

    await erc20Token.connect(user2).addMinter(user2.address);
    await erc20Token.connect(user2).mint(user2.address, web3.utils.toWei("2"));

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("4")
    );

    await expectRevert(
      tokenERC721.updateMetadata(flags, data),
      "ERC721Template: NOT METADATA_ROLE"
    );

    await expectRevert(
      tokenERC721.connect(user2).updateMetadata(flags, data),
      "ERC721Template: NOT METADATA_ROLE"
    );

    await expectRevert(
      tokenERC721.addToMetadataList(user2.address),
      "ERC721RolesAddress: NOT MANAGER"
    );

    await tokenERC721.connect(user2).addToMetadataList(user2.address);
    await tokenERC721.connect(user2).updateMetadata(flags, data);
  });
});
