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
    newERC721Template

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  beforeEach("init contracts for each test", async () => {
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");
    const ERC20Factory = await ethers.getContractFactory("ERC20Factory");
    
    const Metadata = await ethers.getContractFactory("Metadata");


    [owner, reciever, user2] = await ethers.getSigners();

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
      owner.address,
      metadata.address,
      factoryERC20.address
    );
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      communityFeeCollector,
      factoryERC20.address
    );

    newERC721Template = await ERC721Template.deploy(
      "TemplateERC721",
      "TEMPLATE721",
      owner.address,
      metadata.address,
      factoryERC20.address
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
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);
    symbol = await tokenERC721.symbol();
    name = await tokenERC721.name();
    assert(name === "DT1");
    assert(symbol === "DTSYMBOL");
  });

  it("should check that the tokenERC721 contract is initialized", async () => {
    expect(await tokenERC721.isInitialized()).to.equal(true);
  });

  it("should fail to re-initialize the contracts", async () => {
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

  it("should mint 1 ERC721 to owner", async () => {
    let totalSupply = await tokenERC721.totalSupply();
    assert(totalSupply == 1);
   // await tokenERC721.mint(owner.address);

    totalSupply = await tokenERC721.totalSupply();
    assert(totalSupply == 1);

    assert((await tokenERC721.balanceOf(owner.address)) == 1);

  });

  it("should revert if caller is not NFTOwner", async () => {
    await expectRevert(
      tokenERC721.mint(owner.address),
      "ERC721: Cannot mint new erc721 tokens"
    );
  });

  it("should not be able to call create directly in Metadata", async () => {
    await expectRevert(
      metadata.create(tokenAddress, data, flags),
      "Metadata:NOT ORIGINAL TEMPLATE"
    );
  });

  it("should update the metadata", async () => {
    await tokenERC721.updateMetadata(data, flags);
  });

  it("should not be able to call update directly in Metadata", async () => {
    await expectRevert(
      metadata.update(tokenAddress, data, flags),
      "Metadata:NOT ORIGINAL TEMPLATE"
    );
  });
  it("should not be able to call update directly in Metadata from a contract", async () => {
    await owner.sendTransaction({
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
      tokenERC721.connect(user2).updateMetadata(data, flags),
      "ERC721Template: not NFTOwner"
    );
  });

  it("should create a new ERC20Token", async () => {
    await tokenERC721.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1
    );
  });

  it("should not allow to create a new ERC20Token if NOT Minter ROLE in ERC721Contract", async () => {
    await expectRevert(
      tokenERC721
        .connect(user2)
        .createERC20("ERC20DT1", "ERC20DT1Symbol", web3.utils.toWei("10"), 1),
      "ERC721Template: not NFTOwner"
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
          1
        ),
      "ERC20Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  it("should not allow to create a new ERC20Token directly if ERC721 contract is not on the list", async () => {
    //console.log(owner)
    // console.log(templateERC721.address)
    await owner.sendTransaction({
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
          1
        ),
      "ONLY ERC721 INSTANCE"
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
      "ONLY ERC721 INSTANCE"
    );
  });

  it("should mint new ERC20Tokens from minter", async () => {
    const trxERC20 = await tokenERC721.createERC20(
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
    const trxERC20 = await tokenERC721.createERC20(
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
      "ERC20Template: not NFTOwner"
    );
  });

  it("should allow to create multiple ERC20Token", async () => {
    await tokenERC721.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1
    );

    await tokenERC721.createERC20(
      "ERC20DT2",
      "ERC20DT2Symbol",
      web3.utils.toWei("10"),
      1
    );
  });

  it("should get templateCount from ERC20Factory", async () => {
    assert((await factoryERC20.templateCount()) == 1);
  });

  it("should add a new ERC20 Template from owner(owner)", async () => {
    await factoryERC20.addTokenTemplate(newERC721Template.address);
    assert((await factoryERC20.templateCount()) == 2);
  });
  it("should fail to add a new ERC20 Template from NO-owner", async () => {
    await expectRevert(
      factoryERC20.connect(user2).addTokenTemplate(newERC721Template.address),
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
      tokenERC721.createERC20(
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
      tokenERC721.createERC20(
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
      tokenERC721.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        3
      ),
      "Template index doesnt exist"
    );
  });

  // ERC721 Factory

  it("should get the templateCount from ERC721Factory", async () => {
    assert((await factoryERC721.templateCount()) == 1);
  });

  it("should add a new ERC721 Template from owner(owner)", async () => {
  
    await factoryERC721.addTokenTemplate(newERC721Template.address);
    assert((await factoryERC721.templateCount()) == 2);
  });
  it("should fail to add a new ERC721 Template from NO-owner", async () => {
    await expectRevert(
      factoryERC721.connect(user2).addTokenTemplate(newERC721Template.address),
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
      factoryERC721.deployERC721Contract(
        "DT1",
        "DTSYMBOL",
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
      factoryERC721.deployERC721Contract(
        "DT1",
        "DTSYMBOL",
        metadata.address,
        data,
        flags,
        3
      ),
      "Template index doesnt exist"
    );
  });

  it('should transfer properly the NFT, now the new user is the owner for ERC721Template and ERC20Template', async ()=> {
    const trxERC20 = await tokenERC721.createERC20(
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
    
    
    assert(await tokenERC721.ownerOf(1) == owner.address)
    await tokenERC721.transferFrom(owner.address,user2.address,1)
    assert(await tokenERC721.balanceOf(owner.address) == 0)
    assert(await tokenERC721.ownerOf(1) == user2.address)
    

    await expectRevert(
      tokenERC721.createERC20(
      "ERC20DT2",
      "ERC20DT2Symbol",
      web3.utils.toWei("10"),
      1
    ),"ERC721Template: not NFTOwner")

    await tokenERC721.connect(user2).createERC20(
      "ERC20DT2",
      "ERC20DT2Symbol",
      web3.utils.toWei("10"),
      1
    );

    
    await expectRevert(
      erc20Token.mint(user2.address, web3.utils.toWei("1")),
      "ERC20Template: not NFTOwner"
    );
    
    await erc20Token.connect(user2).mint(user2.address, web3.utils.toWei("2"));

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("4")
    );


    await expectRevert( tokenERC721.updateMetadata(flags,data),"ERC721Template: not NFTOwner" )

    await tokenERC721.connect(user2).updateMetadata(flags,data)
  })
});
