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

    templateERC20 = await ERC20Template.deploy();
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );
    templateERC725 = await ERC725Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC725.address,
      communityFeeCollector,
      factoryERC20.address
    );

    newERC721Template = await ERC725Template.deploy();

    await metadata.setERC20Factory(factoryERC20.address);
    await factoryERC20.setERC721Factory(factoryERC721.address);

    // const tx = await factoryERC721.deployERC721Contract(
    //   "DT1",
    //   "DTSYMBOL",
    //   metadata.address,
    //   data,
    //   flags,
    //   1
    // );
    // const txReceipt = await tx.wait();

    // tokenAddress = txReceipt.events[4].args[0];
    // tokenERC725 = await ethers.getContractAt("ERC725Template", tokenAddress);
    // symbol = await tokenERC725.symbol();
    // name = await tokenERC725.name();
    // assert(name === "DT1");
    // assert(symbol === "DTSYMBOL");
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
    tokenERC725 = await ethers.getContractAt("ERC725Template", tokenAddress);
    symbol = await tokenERC725.symbol();
    name = await tokenERC725.name();

    assert(name === "DT1");
    assert(symbol === "DTSYMBOL");

    assert((await tokenERC725.balanceOf(owner.address)) == 1);
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
    assert(txReceipt.events[4].args[1] == templateERC725.address);
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
});
