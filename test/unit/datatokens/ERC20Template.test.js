/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const ethers = hre.ethers;

describe("ERC20Template", () => {
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
    erc20Address,
    erc20Token;

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  const v3Datatoken = "0xa2B8b3aC4207CFCCbDe4Ac7fa40214fd00A2BA71";
  const v3DTOwner = "0x12BD31628075C20919BA838b89F414241b8c4869";

  const migrateFromV3 = async (v3DTOwner, v3Datatoken) => {
    // WE IMPERSONATE THE ACTUAL v3DT OWNER and create a new ERC721 Contract, from which we are going to wrap the v3 datatoken

    await impersonate(v3DTOwner);
    signer = ethers.provider.getSigner(v3DTOwner);
    const tx = await factoryERC721
      .connect(signer)
      .deployERC721Contract(
        "NFT2",
        "NFTSYMBOL",
        metadata.address,
        data,
        flags,
        1
      );
    const txReceipt = await tx.wait();

    tokenAddress = txReceipt.events[4].args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);
    assert((await tokenERC721.v3DT(v3Datatoken)) == false);

    // WE then have to Propose a new minter for the v3Datatoken

    v3DTContract = await ethers.getContractAt("IV3ERC20", v3Datatoken);
    await v3DTContract.connect(signer).proposeMinter(tokenAddress);

    // ONLY V3DTOwner can now call wrapV3DT() to transfer minter permission to the erc721Contract
    await tokenERC721.connect(signer).wrapV3DT(v3Datatoken, v3DTOwner);
    assert((await tokenERC721.v3DT(v3Datatoken)) == true);
    assert((await tokenERC721._getPermissions(v3DTOwner)).v3Minter == true);

    return tokenERC721;
  };

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

    tokenAddress = txReceipt.events[4].args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);
    symbol = await tokenERC721.symbol();
    name = await tokenERC721.name();
    assert(name === "DT1");
    assert(symbol === "DTSYMBOL");

    // WE add owner as erc20Deployer so he can deploy an new erc20Contract
    await tokenERC721.addToCreateERC20List(owner.address);

    receipt = await (
      await tokenERC721.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1,
        owner.address
      )
    ).wait();
    const events = receipt.events.filter((e) => e.event === "ERC20Created");
    //console.log(events[0].args.erc20Address)
    erc20Token = await ethers.getContractAt(
      "ERC20Template",
      events[0].args.erc20Address
    );
    assert((await erc20Token.name()) === "ERC20DT1");
    assert((await erc20Token.symbol()) === "ERC20DT1Symbol");
  });

  it("#isInitialized - should check that the erc20Token contract is initialized", async () => {
    expect(await erc20Token.isInitialized()).to.equal(true);
  });

  it("#initialize - should fail to re-initialize the contracts", async () => {
    await expectRevert(
      erc20Token.initialize(
        "ERC20DT1",
        "ERC20DT1Symbol",
        tokenERC721.address,
        web3.utils.toWei("10"),
        communityFeeCollector,
        owner.address
      ),
      "ERC20Template: token instance already initialized"
    );
  });

  it("#mint - owner should succeed to mint 1 ERC20Token to user2", async () => {
    await erc20Token.mint(user2.address, web3.utils.toWei("1"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("1")
    );
  });

  it("#mint - should fail to mint 1 ERC20Token to user2 if NOT MINTER", async () => {
    await expectRevert(
      erc20Token.connect(user2).mint(user2.address, web3.utils.toWei("1")),
      "ERC20Template: NOT MINTER"
    );
  });

  it("#setFeeCollector - should fail to set new FeeCollector if not NFTOwner", async () => {
    await expectRevert(
      erc20Token.connect(user2).setFeeCollector(user2.address),
      "ERC20Template: not NFTOwner"
    );
  });

  it("#setFeeCollector - should succeed to set new FeeCollector if NFTOwner", async () => {
    assert((await erc20Token.getFeeCollector()) == owner.address);
    await erc20Token.setFeeCollector(user2.address);
    assert((await erc20Token.getFeeCollector()) == user2.address);
  });

  it("#addMinter - should fail to addMinter if not erc20Deployer (permission to deploy the erc20Contract at 721 level)", async () => {
    assert((await erc20Token.permissions(user2.address)).minter == false);

    await expectRevert(
      erc20Token.connect(user2).addMinter(user2.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(user2.address)).minter == false);
  });

  it("#addMinter - should fail to addMinter if it's already minter", async () => {
    assert((await erc20Token.permissions(user2.address)).minter == false);

    await erc20Token.addMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == true);

    await expectRevert(
      erc20Token.addMinter(user2.address),
      "ERC20Roles:  ALREADY A MINTER"
    );
  });

  it("#addMinter - should succeed to addMinter if erc20Deployer (permission to deploy the erc20Contract at 721 level)", async () => {
    assert((await erc20Token.permissions(user2.address)).minter == false);

    // owner is already erc20Deployer
    await erc20Token.addMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == true);
  });

  it("#removeMinter - should fail to removeMinter if NOT erc20Deployer", async () => {
    assert((await erc20Token.permissions(owner.address)).minter == true);

    await expectRevert(
      erc20Token.connect(user2).removeMinter(owner.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(owner.address)).minter == true);
  });

  it("#removeMinter - should fail to removeMinter even if it's minter", async () => {
    await erc20Token.addMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == true);

    await expectRevert(
      erc20Token.connect(user2).removeMinter(owner.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(owner.address)).minter == true);
  });

  it("#removeMinter - should succeed to removeMinter if erc20Deployer", async () => {
    await erc20Token.addMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == true);

    await erc20Token.removeMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == false);
  });
  
  it("#setData - should fail to setData if NOT erc20Deployer", async () => {
    const key = web3.utils.keccak256(erc20Token.address);
    const value = web3.utils.asciiToHex('SomeData')


    await expectRevert(
      erc20Token.connect(user2).setData(value),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert(await tokenERC721.getData(key) == '0x')

  });

  it("#setData - should succeed to setData if erc20Deployer", async () => {
    const key = web3.utils.keccak256(erc20Token.address);
    const value = web3.utils.asciiToHex('SomeData')


    await erc20Token.setData(value)

    assert(await tokenERC721.getData(key) == value)

  });

  it("#cleanPermissions - should fail to call cleanPermissions if NOT NFTOwner", async () => {
    assert((await erc20Token.permissions(owner.address)).minter == true);

    await expectRevert(
      erc20Token.connect(user2).cleanPermissions(),
      "ERC20Template: not NFTOwner"
    );
    
    assert((await erc20Token.permissions(owner.address)).minter == true);
  });

  it("#cleanPermissions - should succeed to call cleanPermissions if NFTOwner", async () => {
    // owner is already minter
    assert((await erc20Token.permissions(owner.address)).minter == true);

    // we set a new FeeCollector
    await erc20Token.setFeeCollector(user2.address);
    assert((await erc20Token.getFeeCollector()) == user2.address);
    // WE add 2 more minters
    await erc20Token.addMinter(user2.address);
    await erc20Token.addMinter(user3.address);
    assert((await erc20Token.permissions(user2.address)).minter == true);
    assert((await erc20Token.permissions(user3.address)).minter == true);
    
    // NFT Owner cleans
    await erc20Token.cleanPermissions()
    
    // check permission were removed
    assert((await erc20Token.permissions(owner.address)).minter == false);
    assert((await erc20Token.permissions(user2.address)).minter == false);
    assert((await erc20Token.permissions(user3.address)).minter == false);
    // we reassigned feeCollector to address(0) when cleaning permissions, so now getFeeCollector points to NFT Owner
    assert((await erc20Token.getFeeCollector()) == owner.address);
  });
});
