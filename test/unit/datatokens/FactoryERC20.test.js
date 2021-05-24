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
    templateERC725 = await ERC725Template
      .deploy
      // "TemplateERC721",
      // "TEMPLATE721"
      ();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC725.address,
      communityFeeCollector,
      factoryERC20.address
    );

    newERC721Template = await ERC725Template
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
    tokenERC725 = await ethers.getContractAt("ERC725Template", tokenAddress);
    symbol = await tokenERC725.symbol();
    name = await tokenERC725.name();
    assert(name === "DT1");
    assert(symbol === "DTSYMBOL");
    assert((await tokenERC725.balanceOf(owner.address)) == 1);
    //await tokenERC725.addManager(owner.address);
  });

  it("should check that the tokenERC725 contract is initialized", async () => {
    expect(await tokenERC725.isInitialized()).to.equal(true);
  });


  it("should not allow to create a new ERC20Token if NOT in CreateERC20List", async () => {
    await expectRevert(
      tokenERC725.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1
      ),
      "ERC725Template: NOT MINTER_ROLE"
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

  it("should fail to create an ERC20 calling the factory directly", async()=> {
    await expectRevert(factoryERC20.createToken( "ERC20DT1",
    "ERC20DT1Symbol",
    web3.utils.toWei("10"),
    1), "ERC20Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY")
  })

  it("should not allow to create a new ERC20Token directly if ERC721 contract is not on the list", async () => {
    //console.log(owner)
    // console.log(templateERC721.address)
    await owner.sendTransaction({
      to: templateERC725.address,
      value: ethers.utils.parseEther("1"),
    });

    await impersonate(templateERC725.address);

    const signer = await ethers.provider.getSigner(templateERC725.address);

    await expectRevert(
      factoryERC20
        .connect(signer)
        .createToken(
          "ERC20DT1",
          "ERC20DT1Symbol",
          web3.utils.toWei("10"),
          1
        ),
      "ERC20Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  it("should not allow to create a new ERC20Token directly from the ERC20Factory even if is a contract", async () => {

    const tx = await owner.sendTransaction({
      to: factoryERC721.address,
      value: ethers.utils.parseEther("1"),
    });
    await impersonate(factoryERC721.address);
    const signer = await ethers.provider.getSigner(factoryERC721.address);

    await signer.sendTransaction({
      to: owner.address,
      value: ethers.utils.parseEther("0.01"),
    });

    await expectRevert(
      factoryERC20
        .connect(signer)
        .createToken(
          "ERC20DT1",
          "ERC20DT1Symbol",
          web3.utils.toWei("10"),
          1
        ),
      "ERC20Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });
  it("should get templateCount from ERC20Factory", async () => {
    assert((await factoryERC20.templateCount()) == 1);
  });

  it("should add a new ERC20 Template from owner(owner)", async () => {
    await factoryERC20.addTokenTemplate(newERC721Template.address);
    assert((await factoryERC20.templateCount()) == 2);
  });
 
  it("should disable a specific ERC20 Template from owner", async () => {
    let templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == true);
    await factoryERC20.disableTokenTemplate(1);
    templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == false);
  });
  it("should fail to disable a specific ERC20 Template from NOT owner", async () => {
    let templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == true);
    await expectRevert(
      factoryERC20.connect(user2).disableTokenTemplate(1),
      "Ownable: caller is not the owner"
    );
    templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == true);
  });
  it("should fail to create a specific ERC20 Template if the template is disabled", async () => {
    await factoryERC20.disableTokenTemplate(1);
    await tokenERC725.addToCreateERC20List(owner.address);
    await expectRevert(
      tokenERC725.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1
      ),
      "ERC721Token Template disabled"
    );
    templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == false);
  });

  it("should fail to create a specific ERC20 Template if the index is ZERO", async () => {
    await tokenERC725.addToCreateERC20List(owner.address);
    await expectRevert(
      tokenERC725.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        0
      ),
      "ERC20Factory: Template index doesnt exist"
    );
  });

  it("should fail to create a specific ERC20 Template if the index doesn't exist", async () => {
    await tokenERC725.addToCreateERC20List(owner.address);
    await expectRevert(
      tokenERC725.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        3
      ),
      "Template index doesnt exist"
    );
  });


  
  xit("should transfer properly the NFT, now the new user is the owner for ERC721Template and ERC20Template", async () => {
    await tokenERC725.addToCreateERC20List(owner.address);
    const trxERC20 = await tokenERC725.createERC20(
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

    assert((await tokenERC725.ownerOf(1)) == owner.address);
    await tokenERC725.transferFrom(owner.address, user2.address, 1);
    assert((await tokenERC725.balanceOf(owner.address)) == 0);
    assert((await tokenERC725.ownerOf(1)) == user2.address);

    await tokenERC725.removeFromCreateERC20List(owner.address); // WE CAN STILL DO THAT because the owner is still Manager

    await expectRevert(
      tokenERC725.createERC20(
        "ERC20DT2",
        "ERC20DT2Symbol",
        web3.utils.toWei("10"),
        1
      ),
      "ERC725Template: NOT MINTER_ROLE"
    );
    await tokenERC725.connect(user2).cleanPermissions();

    await tokenERC725.connect(user2).addManager(user2.address);
    await tokenERC725.connect(user2).addToCreateERC20List(user2.address);
    await tokenERC725
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
      tokenERC725.updateMetadata(flags, data),
      "ERC725Template: NOT METADATA_ROLE"
    );

    await expectRevert(
      tokenERC725.connect(user2).updateMetadata(flags, data),
      "ERC725Template: NOT METADATA_ROLE"
    );

    await expectRevert(
      tokenERC725.addToMetadataList(user2.address),
      "ERC721RolesAddress: NOT MANAGER"
    );

    await tokenERC725.connect(user2).addToMetadataList(user2.address);
    await tokenERC725.connect(user2).updateMetadata(flags, data);
  });
});
