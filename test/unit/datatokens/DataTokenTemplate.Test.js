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
    factory,
    admin,
    reciever,
    metadata,
    template,
    token,
    tokenAddress,
    minter,
    data,
    flags;

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  beforeEach("init contracts for each test", async () => {
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");
    const ERC20Factory = await ethers.getContractFactory("ERC20Factory");
    const Token = await ethers.getContractFactory("ERC721Template");
    const Metadata = await ethers.getContractFactory("Metadata");
    // blob = 'https://example.com/dataset-1'
    // decimals = 18

    [admin, reciever, user2] = await ethers.getSigners();

    // cap = new BigNumber('1400000000')
    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);
    metadata = await Metadata.deploy();
    //console.log(metadata.address)

    templateERC20 = await ERC20Template.deploy(
      "TemplateERC20",
      "TEMPLATE20",
      user2.address,
      web3.utils.toWei("22"),
      communityFeeCollector
    );
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );
    templateERC721 = await ERC721Template.deploy(
      "TemplateERC721",
      "TEMPLATE721",
      admin.address,
      metadata.address,
      factoryERC20.address,
      data,
      flags
    );
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      communityFeeCollector,
      factoryERC20.address
    );
    await metadata.setERC20Factory(factoryERC20.address);
    await factoryERC20.setERC721Factory(factoryERC721.address);
    // blob = 'https://example.com/dataset-1'
    const tx = await factoryERC721.createERC721Token(
      "DT1",
      "DTSYMBOL",
      admin.address,
      metadata.address,
      data,
      flags,
      1
    );
    const txReceipt = await tx.wait();
    //  const test = await expectEvent(txReceipt,'TokenCreated')
    //     console.log(test)
    tokenAddress = txReceipt.events[5].args[0];
    token = await ethers.getContractAt("ERC721Template", tokenAddress);
    symbol = await token.symbol();
    name = await token.name();
    assert(name === "DT1");
    assert(symbol === "DTSYMBOL");
  });

  it("should check that the token contract is initialized", async () => {
    expect(await token.isInitialized()).to.equal(true);
  });

  it("should fail to re-initialize the contracts", async () => {
    await expectRevert(
      token.initialize(
        admin.address,
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

  it("should mint 1 ERC721 to admin", async () => {
    let totalSupply = await token.totalSupply();
    assert(totalSupply == 0);
    await token.mint(admin.address);

    totalSupply = await token.totalSupply();
    assert(totalSupply == 1);

    assert((await token.balanceOf(admin.address)) == 1);

    //await expectRevert(token.mint(admin,{from: admin}),'ERC721: token already minted')
  });

  it("should revert if caller is not MINTER", async () => {
    await expectRevert(
      token.connect(user2).mint(admin.address),
      "NOT MINTER_ROLE"
    );
  });

  it("should not be able to call create directly in Metadata", async () => {
    await expectRevert(
      metadata.create(tokenAddress, data, flags),
      "Metadata:NOT ORIGINAL TEMPLATE"
    );
  });

  it("should update the metadata", async () => {
    await token.updateMetadata(data, flags);
  });

  it("should not be able to call update directly in Metadata", async () => {
    await expectRevert(
      metadata.update(tokenAddress, data, flags),
      "Metadata:NOT ORIGINAL TEMPLATE"
    );
  });
  it("should not be able to call update directly in Metadata from a contract", async () => {
    await admin.sendTransaction({
      to: templateERC721.address,
      value: ethers.utils.parseEther("1"),
    });

    await impersonate(templateERC721.address);

    const signer = await ethers.provider.getSigner(templateERC721.address);

    await expectRevert(
      metadata.connect(signer).update(templateERC721.address, data, flags),
      "Metadata:NOT ORIGINAL TEMPLATE"
    );
  });

  it("should not be allowed to update the metadata if not METADATA_ROLE", async () => {
    await expectRevert(
      token.connect(user2).updateMetadata(data, flags),
      "NOT METADATA_ROLE"
    );
  });

  it("should create a new ERC20Token", async () => {
    await token.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1
    );
  });

  it("should not allow to create a new ERC20Token if NOT Minter ROLE in ERC721Contract", async () => {
    await expectRevert(
      token
        .connect(user2)
        .createERC20("ERC20DT1", "ERC20DT1Symbol", web3.utils.toWei("10"), 1),
      "NOT MINTER_ROLE"
    );
  });
  it("should not allow to create a new ERC20Token directly from the ERC20Factory", async () => {
    await expectRevert(
      factoryERC20
        .connect(user2)
        .createToken(
          "ERC20DT1",
          "ERC20DT1Symbol",
          web3.utils.toWei("10"),
          admin.address,
          1
        ),
      "ERC20Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  it("should not allow to create a new ERC20Token directly if ERC721 contract is not on the list", async () => {
    //console.log(admin)
    // console.log(templateERC721.address)
    await admin.sendTransaction({
      to: templateERC721.address,
      value: ethers.utils.parseEther("1"),
    });

    await impersonate(templateERC721.address);

    const signer = await ethers.provider.getSigner(templateERC721.address);

    await expectRevert(
      factoryERC20
        .connect(signer)
        .createToken(
          "ERC20DT1",
          "ERC20DT1Symbol",
          web3.utils.toWei("10"),
          admin.address,
          1
        ),
      "ONLY ERC721 INSTANCE"
    );
  });

  it("should not allow to create a new ERC20Token directly from the ERC20Factory even if is a contract", async () => {
    //console.log(admin)
    // console.log(factoryERC721.address)
    const tx = await admin.sendTransaction({
      to: factoryERC721.address,
      value: ethers.utils.parseEther("1"),
    });
    await impersonate(factoryERC721.address);
    const signer = await ethers.provider.getSigner(factoryERC721.address);
    //console.log(signer)
    await signer.sendTransaction({
      to: admin.address,
      value: ethers.utils.parseEther("0.01"),
    });
    // console.log(test)
    await expectRevert(
      factoryERC20
        .connect(signer)
        .createToken(
          "ERC20DT1",
          "ERC20DT1Symbol",
          web3.utils.toWei("10"),
          admin.address,
          1
        ),
      "ONLY ERC721 INSTANCE"
    );
  });

  it("should mint new ERC20Tokens from minter", async () => {
    const trxERC20 = await token.createERC20(
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
  });

  it("should not allow to mint new ERC20Tokens if not ERC721 minter", async () => {
    const trxERC20 = await token.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1
    );

    const trxReceiptERC20 = await trxERC20.wait();
    erc20Address = trxReceiptERC20.events[3].args.erc20Address;

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);

    await expectRevert(
      erc20Token.connect(user2).mint(user2.address, web3.utils.toWei("1")),
      "DataTokenTemplate: invalid minter"
    );
  });

  it("should allow to create multiple ERC20Token", async () => {
    await token.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1
    );

    await token.createERC20(
      "ERC20DT2",
      "ERC20DT2Symbol",
      web3.utils.toWei("10"),
      1
    );
  });

  it("should get templateCount from ERC20Factory", async () => {
    assert((await factoryERC20.templateCount()) == 1);
  });

  it("should add a new ERC20 Template from owner(admin)", async () => {
    await factoryERC20.addTokenTemplate(user2.address);
    assert((await factoryERC20.templateCount()) == 2);
  });
  it("should fail to add a new ERC20 Template from NO-owner", async () => {
    await expectRevert(
      factoryERC20.connect(user2).addTokenTemplate(user2.address),
      "Ownable: caller is not the owner"
    );
    assert((await factoryERC20.templateCount()) == 1);
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

    await expectRevert(
      token.createERC20(
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
    await expectRevert(
      token.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        0
      ),
      "ERC20Factory: Template index doesnt exist"
    );
  });

  it("should fail to create a specific ERC20 Template if the index doesn't exist", async () => {
    await expectRevert(
      token.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        3
      ),
      "Template index doesnt exist"
    );
  });

  it("should get the templateCount from ERC721Factory", async () => {
    assert((await factoryERC721.templateCount()) == 1);
  });

  it("should add a new ERC721 Template from owner(admin)", async () => {
    await factoryERC721.addTokenTemplate(user2.address);
    assert((await factoryERC721.templateCount()) == 2);
  });
  it("should fail to add a new ERC721 Template from NO-owner", async () => {
    await expectRevert(
      factoryERC721.connect(user2).addTokenTemplate(user2.address),
      "Ownable: caller is not the owner"
    );
    assert((await factoryERC721.templateCount()) == 1);
  });
  it("should disable a specific ERC721 Template from owner", async () => {
    let templateStruct = await factoryERC721.templateList(1);
    assert(templateStruct.isActive == true);
    await factoryERC721.disableTokenTemplate(1);
    templateStruct = await factoryERC721.templateList(1);
    assert(templateStruct.isActive == false);
  });
  it("should fail to disable a specific ERC721 Template from NOT owner", async () => {
    let templateStruct = await factoryERC721.templateList(1);
    assert(templateStruct.isActive == true);
    await expectRevert(
      factoryERC721.connect(user2).disableTokenTemplate(1),
      "Ownable: caller is not the owner"
    );
    templateStruct = await factoryERC721.templateList(1);
    assert(templateStruct.isActive == true);
  });
  it("should fail to create a specific ERC721 Template if the template is disabled", async () => {
    await factoryERC721.disableTokenTemplate(1);

    await expectRevert(
      factoryERC721.createERC721Token(
        "DT1",
        "DTSYMBOL",
        admin.address,
        metadata.address,
        data,
        flags,
        1
      ),
      "ERC721Token Template disabled"
    );
    templateStruct = await factoryERC721.templateList(1);
    assert(templateStruct.isActive == false);
  });

  it("should fail to create a specific ERC721 Template if the index doesn't exist", async () => {
    await expectRevert(
      factoryERC721.createERC721Token(
        "DT1",
        "DTSYMBOL",
        admin.address,
        metadata.address,
        data,
        flags,
        3
      ),
      "Template index doesnt exist"
    );
  });
});
