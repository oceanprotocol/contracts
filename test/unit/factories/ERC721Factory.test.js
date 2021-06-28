/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const ethers = hre.ethers;

describe("ERC721Factory", () => {
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
      params: [
        {
          forking: {
            jsonRpcUrl:
              "https://eth-mainnet.alchemyapi.io/v2/eOqKsGAdsiNLCVm846Vgb-6yY3jlcNEo",
            blockNumber: 12515000,
          },
        },
      ],
    });

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

    templateERC20 = await ERC20Template.deploy();
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      communityFeeCollector,
      factoryERC20.address
    );

    newERC721Template = await ERC721Template.deploy();

    await metadata.setERC20Factory(factoryERC20.address);
    await factoryERC20.setERC721Factory(factoryERC721.address);
  });

  it("#deployERC721Contract - should deploy a new erc721 contract and send tokenId=1 to contract owner", async () => {
    const tx = await factoryERC721.deployERC721Contract(
      "DT1",
      "DTSYMBOL",
      metadata.address,
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
  });

  it("#deployERC721Contract - should deploy a new erc721 contract and emit TokenCreated event", async () => {
    const tx = await factoryERC721.deployERC721Contract(
      "DT1",
      "DTSYMBOL",
      metadata.address,
      data,
      flags,
      1
    );
    const txReceipt = await tx.wait();
    tokenAddress = txReceipt.events[4].args[0];

    assert(txReceipt.events[4].event == "TokenCreated");
    assert(txReceipt.events[4].args[1] == templateERC721.address);
    assert(txReceipt.events[4].args[3] == owner.address);
  });

  it("#deployERC721Contract - should fail to deploy a new erc721 contract if template index doesn't exist", async () => {
    await expectRevert(
      factoryERC721.deployERC721Contract(
        "DT1",
        "DTSYMBOL",
        metadata.address,
        data,
        flags,
        7
      ),
      "ERC721DTFactory: Template index doesnt exist"
    );
  });

  it("#deployERC721Contract - should fail to deploy a new erc721 contract if template index is ZERO", async () => {
    await expectRevert(
      factoryERC721.deployERC721Contract(
        "DT1",
        "DTSYMBOL",
        metadata.address,
        data,
        flags,
        0
      ),
      "ERC721DTFactory: Template index doesnt exist"
    );
  });

  it("#deployERC721Contract - should fail if token template is not active", async () => {
    await factoryERC721.addTokenTemplate(newERC721Template.address);
    await factoryERC721.disableTokenTemplate(2);

    await expectRevert(
      factoryERC721.deployERC721Contract(
        "DT1",
        "DTSYMBOL",
        metadata.address,
        data,
        flags,
        2
      ),
      "ERC721DTFactory: ERC721Token Template disabled"
    );
  });

  it("#getCurrentTokenCount - should return token count", async () => {
    assert((await factoryERC721.getCurrentTokenCount()) == 1);

    await factoryERC721.deployERC721Contract(
      "DT1",
      "DTSYMBOL",
      metadata.address,
      data,
      flags,
      1
    );

    assert((await factoryERC721.getCurrentTokenCount()) == 2);
  });

  it("#getTokenTemplate - should return token template struct", async () => {
    const template = await factoryERC721.getTokenTemplate(1);

    assert(template.templateAddress == templateERC721.address);
    assert(template.isActive == true);
  });

  it("#getCurrentTemplateCount - should return template count", async () => {
    assert((await factoryERC721.getCurrentTemplateCount()) == 1);

    await factoryERC721.addTokenTemplate(newERC721Template.address);

    assert((await factoryERC721.getCurrentTemplateCount()) == 2);
  });

  it("#addTokenTemplate - should fail to add Token Template if not Owner", async () => {
    await expectRevert(
      factoryERC721.connect(user2).addTokenTemplate(newERC721Template.address),
      "Ownable: caller is not the owner"
    );
  });

  it("#addTokenTemplate - should succeed to add Token Template if Owner", async () => {
    await factoryERC721.addTokenTemplate(newERC721Template.address);
    assert((await factoryERC721.getCurrentTemplateCount()) == 2);
  });

  it("#disableTokenTemplate - should fail to disable Token Template if not Owner", async () => {
    await expectRevert(
      factoryERC721.connect(user2).disableTokenTemplate(1),
      "Ownable: caller is not the owner"
    );
  });

  it("#disableTokenTemplate - should succeed to disable Token Template if Owner", async () => {
    await factoryERC721.addTokenTemplate(newERC721Template.address);
    let template = await factoryERC721.getTokenTemplate(2);
    assert(template.templateAddress == newERC721Template.address);
    // active by default
    assert(template.isActive == true);

    await factoryERC721.disableTokenTemplate(2)

    template = await factoryERC721.getTokenTemplate(2);

    assert(template.templateAddress == newERC721Template.address);
    assert(template.isActive == false);
  });

  it("#reactivateTokenTemplate - should fail to reactivate Token Template if not Owner", async () => {
    
    await expectRevert(
      factoryERC721.connect(user2).disableTokenTemplate(1),
      "Ownable: caller is not the owner"
    );
  });

  it("#reactivateTokenTemplate - should succeed to reactivate Token Template if Owner", async () => {
    await factoryERC721.addTokenTemplate(newERC721Template.address);
    let template = await factoryERC721.getTokenTemplate(2);
    assert(template.templateAddress == newERC721Template.address);
    // active by default
    assert(template.isActive == true);

    await factoryERC721.disableTokenTemplate(2)

    template = await factoryERC721.getTokenTemplate(2);

    assert(template.isActive == false);

    await factoryERC721.reactivateTokenTemplate(2)

    template = await factoryERC721.getTokenTemplate(2);

    assert(template.isActive == true);

  });

  // TODO: complete template functions unit test
});
