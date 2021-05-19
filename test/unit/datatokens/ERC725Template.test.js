/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const ethers = hre.ethers;

describe("ERC725Template", () => {
  let name,
    symbol,
    owner,
    reciever,
    metadata,
    tokenERC725,
    tokenAddress,
    data,
    flags,
    factoryERC721,
    factoryERC20,
    templateERC725,
    templateERC20,
    newERC721Template;

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  beforeEach("init contracts for each test", async () => {
    const ERC725Template = await ethers.getContractFactory("ERC725Template");
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

    templateERC20 = await ERC20Template.deploy(
      // "TemplateERC20",
      // "TEMPLATE20",
      // user2.address,
      // web3.utils.toWei("22"),
      // communityFeeCollector
    );
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );
    templateERC725 = await ERC725Template.deploy(
      // "TemplateERC721",
      // "TEMPLATE721"
    );
    factoryERC721 = await ERC721Factory.deploy(
      templateERC725.address,
      communityFeeCollector,
      factoryERC20.address
    );

    newERC721Template = await ERC725Template.deploy(
      // "TemplateERC721",
      // "TEMPLATE721"
    );

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
    //console.log(txReceipt.events[3].args[0])
    //  const test = await expectEvent(txReceipt,'TokenCreated')
    //     console.log(test)
    tokenAddress = txReceipt.events[3].args[0];
    tokenERC725 = await ethers.getContractAt("ERC725Template", tokenAddress);
    symbol = await tokenERC725.symbol();
    name = await tokenERC725.name();
    assert(name === "DT1");
    assert(symbol === "DTSYMBOL");
    await tokenERC725.addManager(owner.address);
  });

  it("should check that the tokenERC725 contract is initialized", async () => {
    expect(await tokenERC725.isInitialized()).to.equal(true);
  });

  it("should fail to re-initialize the contracts", async () => {
    await expectRevert(
      tokenERC725.initialize(
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

  it("should mint 1 ERC721 to owner", async () => {
    // let totalSupply = await tokenERC725.totalSupply();
    // assert(totalSupply == 1);
    // // await tokenERC725.mint(owner.address);

    // totalSupply = await tokenERC725.totalSupply();
    // assert(totalSupply == 1);

    assert((await tokenERC725.balanceOf(owner.address)) == 1);
  });

  it("should revert if caller is not NFTOwner", async () => {
    await expectRevert(
      tokenERC725.mint(owner.address),
      "ERC721: Cannot mint new erc721 tokens"
    );
  });

  it("should not be allowed to update the metadata if NOT in MetadataList", async () => {
    await expectRevert(
      tokenERC725.updateMetadata(data, flags),
      "ERC721Template: NOT METADATA_ROLE"
    );
  });

  it("should update the metadata, after adding address to MetadataList", async () => {
    await tokenERC725.addToMetadataList(owner.address);
    await tokenERC725.updateMetadata(data, flags);
  });

 

  it("should not allow to create a new ERC20Token if NOT in CreateERC20List", async () => {
    await expectRevert(
      tokenERC725.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1
      ),
      "ERC721Template: NOT MINTER_ROLE"
    );
  });

  it("should create a new ERC20Token, after adding address to CreateERC20List", async () => {
    await tokenERC725.addToCreateERC20List(owner.address);
    await tokenERC725.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1
    );
  });

  it("should fail to clean lists, if not NFT Owner", async () => {
    await expectRevert(
      tokenERC725.connect(user2).cleanLists(),
      "ERC721Template: not NFTOwner"
    );
  });

  it("should clean lists, only NFT Owner", async () => {
    await tokenERC725.addToCreateERC20List(owner.address);
    await tokenERC725.addToCreateERC20List(user2.address);

    assert((await tokenERC725.isAllowedToCreateERC20(owner.address)) == true);
    assert((await tokenERC725.isAllowedToCreateERC20(user2.address)) == true);

    await expectRevert(
      tokenERC725.connect(user2).cleanLists(),
      "ERC721Template: not NFTOwner"
    );

    await tokenERC725.cleanLists();

    assert((await tokenERC725.isAllowedToCreateERC20(owner.address)) == false);
    assert((await tokenERC725.isAllowedToCreateERC20(user2.address)) == false);
    assert((await tokenERC725.isAllowedToCreateERC20(user3.address)) == false);

    await tokenERC725.addManager(owner.address); // WE CLEANED OURSELF TO FROM ALL LISTS, so we need to re-ADD us.

    await tokenERC725.addToCreateERC20List(user3.address);
    assert((await tokenERC725.createERC20List(0)) == user3.address);
  });

  xit("should transfer properly the NFT, now the new user is the owner for ERC721Template and ERC20Template", async () => {
    const trxERC20 = await tokenERC725.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1
    );
    const trxReceiptERC20 = await trxERC20.wait();
    erc20Address = trxReceiptERC20.events[3].args.erc20Address;

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
    await erc20Token.mint(user2.address, web3.utils.toWei("2"));

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("2")
    );

    assert((await tokenERC725.ownerOf(1)) == owner.address);
    await tokenERC725.transferFrom(owner.address, user2.address, 1);
    assert((await tokenERC725.balanceOf(owner.address)) == 0);
    assert((await tokenERC725.ownerOf(1)) == user2.address);

    await expectRevert(
      tokenERC725.createERC20(
        "ERC20DT2",
        "ERC20DT2Symbol",
        web3.utils.toWei("10"),
        1
      ),
      "ERC721Template: not NFTOwner"
    );

    await tokenERC725
      .connect(user2)
      .createERC20("ERC20DT2", "ERC20DT2Symbol", web3.utils.toWei("10"), 1);

    await expectRevert(
      erc20Token.mint(user2.address, web3.utils.toWei("1")),
      "ERC20Template: not NFTOwner"
    );

    await erc20Token.connect(user2).mint(user2.address, web3.utils.toWei("2"));

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("4")
    );

    await expectRevert(
      tokenERC725.updateMetadata(flags, data),
      "ERC721Template: not NFTOwner"
    );

    await tokenERC725.connect(user2).updateMetadata(flags, data);
  });
});
