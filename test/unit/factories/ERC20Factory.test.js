/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { getContractFactory } = require("@nomiclabs/hardhat-ethers/types");
const ethers = hre.ethers;

describe("ERC20Factory", () => {
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
    newERC721Template,
    oceanContract;

  const oceanAddress = "0x967da4048cd07ab37855c090aaf366e4ce1b9f48";
  const vaultAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
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


    // const OceanFactory = await ethers.getContractFactory('OceanPoolFactory')
    // const oceanFactory = await OceanFactory.deploy(
    //   '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    //   '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
    // )
    const Metadata = await ethers.getContractFactory("Metadata");

    [owner, reciever, user2, user3] = await ethers.getSigners();

    // cap = new BigNumber('1400000000')
    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);
    metadata = await Metadata.deploy();
    //console.log(metadata.address)

    templateERC20 = await ERC20Template.deploy();
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      communityFeeCollector,
      factoryERC20.address,
      metadata.address
    );

    newERC721Template = await ERC721Template.deploy();

    await metadata.setERC20Factory(factoryERC20.address);
    await factoryERC20.setERC721Factory(factoryERC721.address);

    const tx = await factoryERC721.deployERC721Contract(
      "DT1",
      "DTSYMBOL",
      data,
      flags,
      1
    );
    const txReceipt = await tx.wait();

    tokenAddress = txReceipt.events[4].args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);
    symbol = await tokenERC721.symbol();
    name = await tokenERC721.name();
    assert(name === "DT1");
    assert(symbol === "DTSYMBOL");
    assert((await tokenERC721.balanceOf(owner.address)) == 1);
    //await tokenERC721.addManager(owner.address);

    // GET SOME OCEAN TOKEN FROM OUR MAINNET FORK
    const userWithOcean = "0x53aB4a93B31F480d17D3440a6329bDa86869458A";
    await impersonate(userWithOcean);

    oceanContract = await ethers.getContractAt("contracts/interfaces/IERC20.sol:IERC20", oceanAddress);
    const signer = await ethers.provider.getSigner(userWithOcean);
    await oceanContract
      .connect(signer)
      .transfer(owner.address, ethers.utils.parseEther("10000"));
    // result = (await oceanContract.balanceOf(owner.address)).toString()
    //   console.log(result)
    // assert(
    //   (await oceanContract.balanceOf(owner.address)).toString() ==
    //     ethers.utils.parseEther("10000")
    // );

    
  });

  it("#isInitialized - should check that the tokenERC721 contract is initialized", async () => {
    expect(await tokenERC721.isInitialized()).to.equal(true);
  });

  it("#createToken - should not allow to create a new ERC20Token if NOT in CreateERC20List", async () => {
    await expectRevert(
      tokenERC721.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1,
        owner.address
      ),
      "ERC721Template: NOT MINTER_ROLE"
    );
  });

  it("#createToken - should create a new ERC20Token, after adding address to CreateERC20List", async () => {
    await tokenERC721.addToCreateERC20List(owner.address);
    await tokenERC721.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1,
      owner.address
    );
  });

  it("#createToken - should fail to create an ERC20 calling the factory directly", async () => {
    await expectRevert(
      factoryERC20.createToken(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1,
        owner.address
      ),
      "ERC20Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  it("#createToken - should not allow to create a new ERC20Token directly if ERC721 contract is not on the list", async () => {
 
    await impersonate(templateERC721.address);

    const signer = await ethers.provider.getSigner(templateERC721.address);

    await expectRevert(
      factoryERC20
        .connect(signer)
        .createToken("ERC20DT1", "ERC20DT1Symbol", web3.utils.toWei("10"), 1,owner.address),
      "ERC20Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  it("#createToken - should not allow to create a new ERC20Token directly from the ERC20Factory even if is a contract", async () => {
    
    await impersonate(newERC721Template.address);
    const signer = await ethers.provider.getSigner(newERC721Template.address);

    await expectRevert(
      factoryERC20
        .connect(signer)
        .createToken("ERC20DT1", "ERC20DT1Symbol", web3.utils.toWei("10"), 1,owner.address),
      "ERC20Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  it("#createToken - should fail to create a specific ERC20 Template if the index is ZERO", async () => {
    await tokenERC721.addToCreateERC20List(owner.address);
    await expectRevert(
      tokenERC721.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        0,
        owner.address
      ),
      "ERC20Factory: Template index doesnt exist"
    );
  });

  it("#createToken - should fail to create a specific ERC20 Template if the index doesn't exist", async () => {
    await tokenERC721.addToCreateERC20List(owner.address);
    await expectRevert(
      tokenERC721.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        3,
        owner.address
      ),
      "Template index doesnt exist"
    );
  });

  it("#templateCount - should get templateCount from ERC20Factory", async () => {
    assert((await factoryERC20.templateCount()) == 1);
  });

  it("#addTokenTemplate - should add a new ERC20 Template from owner(owner)", async () => {
    await factoryERC20.addTokenTemplate(newERC721Template.address);
    assert((await factoryERC20.templateCount()) == 2);
  });

  it("#addTokenTemplate - should fail to add a new ERC20 Template if not owner", async () => {
    await expectRevert(factoryERC20.connect(user2).addTokenTemplate(newERC721Template.address), 'Ownable: caller is not the owner')
    
  });

  it("#disableTokenTemplate - should disable a specific ERC20 Template from owner", async () => {
    let templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == true);
    await factoryERC20.disableTokenTemplate(1);
    templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == false);
  });

  it("#disableTokenTemplate - should fail to disable a specific ERC20 Template from NOT owner", async () => {
    let templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == true);
    await expectRevert(
      factoryERC20.connect(user2).disableTokenTemplate(1),
      "Ownable: caller is not the owner"
    );
    templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == true);
  });

  it("#disableTokenTemplate - should fail to create a specific ERC20 Template if the template is disabled", async () => {
    await factoryERC20.disableTokenTemplate(1);
    await tokenERC721.addToCreateERC20List(owner.address);
    await expectRevert(
      tokenERC721.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1,
        owner.address
      ),
      "ERC721Token Template disabled"
    );
    templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == false);
  });

  it("#getCurrentTokenCount - should get the current token count (deployed ERC20)", async () => {
    assert((await factoryERC20.getCurrentTokenCount()) == 1);
  });

  it("#getTokenTemplate - should get the ERC20token template struct", async () => {
    const template = await factoryERC20.getTokenTemplate(1);
    assert(template.isActive == true);
    assert(template.templateAddress == templateERC20.address);
  });

  it("#getTokenTemplate - should fail to get the ERC20token template struct if index == 0", async () => {
    await expectRevert(
      factoryERC20.getTokenTemplate(0),
      "ERC20Factory: Template index doesnt exist"
    );
  });

  it("#getTokenTemplate - should fail to get the ERC20token template struct if index > templateCount", async () => {
    await expectRevert(
      factoryERC20.getTokenTemplate(3),
      "ERC20Factory: Template index doesnt exist"
    );
  });

  it("#addToERC721Registry - should fail to add a new allowed ERC721 contract if not from erc721 factory", async () => {
    await expectRevert(
      factoryERC20.addToERC721Registry(newERC721Template.address),
      "ERC20Factory: ONLY ERC721FACTORY CONTRACT"
    );
  });

  it("#addToERC721Registry - should succeed to add a new allowed ERC721 contract from erc721 factory contract", async () => {
   
    await impersonate(factoryERC721.address);
    const signer = await ethers.provider.getSigner(factoryERC721.address);

    assert(
      (await factoryERC20.erc721List(newERC721Template.address)) == ZERO_ADDRESS
    );

    await factoryERC20
      .connect(signer)
      .addToERC721Registry(newERC721Template.address);

    assert(
      (await factoryERC20.erc721List(newERC721Template.address)) ==
        newERC721Template.address
    );
  });

  it("#getCurrentTemplateCount - should succeed to get Template count", async () => {
    assert(await factoryERC20.getCurrentTemplateCount() == 1)
  });

 
});

