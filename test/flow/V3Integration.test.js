/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

const { impersonate } = require("../helpers/impersonate");
const constants = require("../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const ethers = hre.ethers;

describe("V3 Integration flow", () => {
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
    newERC721Template,
    newERC20Token,
    v3Owner;

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  const v3Datatoken = "0xa2B8b3aC4207CFCCbDe4Ac7fa40214fd00A2BA71";
  const v3DTOwnerAddress = "0x12BD31628075C20919BA838b89F414241b8c4869";

  before("init contracts for each test", async () => {
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");
    const ERC20Factory = await ethers.getContractFactory("ERC20Factory");

    const Metadata = await ethers.getContractFactory("Metadata");

    [newOwner, reciever, user2, user3, user4] = await ethers.getSigners();

    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);
    
 
    templateERC20 = await ERC20Template.deploy();
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );
    metadata = await Metadata.deploy(factoryERC20.address);

    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      communityFeeCollector,
      factoryERC20.address,
      metadata.address
    );


   
    await factoryERC20.setERC721Factory(factoryERC721.address);

    await impersonate(v3DTOwnerAddress);
    v3Owner = ethers.provider.getSigner(v3DTOwnerAddress);
  });

  it("#1 - v3DT Owner deploys a new ERC721 Contract", async () => {
    const tx = await factoryERC721
      .connect(v3Owner)
      .deployERC721Contract(
        "NFT",
        "NFTSYMBOL",
        data,
        flags,
        1
      );
    const txReceipt = await tx.wait();

    tokenAddress = txReceipt.events[4].args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);

    assert((await tokenERC721.balanceOf(v3DTOwnerAddress)) == 1);
  });

  it("#2 - v3DTOwner propose a new minter, which is the ERC721 address", async () => {
    v3DTContract = await ethers.getContractAt("IV3ERC20", v3Datatoken);
    await v3DTContract.connect(v3Owner).proposeMinter(tokenAddress);
  });

  it("#3 - v3DTOwner wraps v3Datatoken into the ERC721", async () => {
    await tokenERC721.connect(v3Owner).wrapV3DT(v3Datatoken, v3DTOwnerAddress);
    assert((await tokenERC721.v3DT(v3Datatoken)) == true);
    assert(
      (await tokenERC721._getPermissions(v3DTOwnerAddress)).v3Minter == true
    );
  });

  it("#4 - v3DTOwner mints new V3DTokens, from the ERC721Contract", async () => {
    assert((await v3DTContract.balanceOf(user2.address)) == 0);
    await tokenERC721
      .connect(v3Owner)
      .mintV3DT(v3Datatoken, user2.address, web3.utils.toWei("10"));
    assert(
      (await v3DTContract.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
  });

  it("#5 - v3DTOwner is the manager and the v3Minter, he assigns a new user to be v3Minter, then new user mints", async () => {
    assert(
      (await tokenERC721._getPermissions(user2.address)).v3Minter == false
    );
    await tokenERC721.connect(v3Owner).addV3Minter(user2.address);
    await tokenERC721
      .connect(user2)
      .mintV3DT(v3Datatoken, user3.address, web3.utils.toWei("5"));
    assert(
      (await v3DTContract.balanceOf(user3.address)) == web3.utils.toWei("5")
    );
  });

  it("#6 - user2 updates metadata for V3 calling setDataV3, if token is wrapped and caller has minter role", async () => {
    const key = web3.utils.keccak256(v3Datatoken);
    const value = web3.utils.asciiToHex('SomeData')
 
    await tokenERC721.connect(user2).setDataV3(v3Datatoken, value,flags,data)  
    
    assert(await tokenERC721.getData(key) == value)
  });

  it("#7 - v3DTOwner  is the NFT Owner, he can assign or revoke roles just as any other NFT Owner", async () => {
    assert((await tokenERC721._getPermissions(user2.address)).store == false);
    assert(
      (await tokenERC721._getPermissions(user2.address)).deployERC20 == false
    );
    assert(
      (await tokenERC721._getPermissions(user2.address)).updateMetadata == false
    );

    await tokenERC721.connect(v3Owner).addTo725StoreList(user2.address);
    await tokenERC721.connect(v3Owner).addToCreateERC20List(user2.address);
    await tokenERC721.connect(v3Owner).addToMetadataList(user2.address);

    assert((await tokenERC721._getPermissions(user2.address)).store == true);
    assert(
      (await tokenERC721._getPermissions(user2.address)).deployERC20 == true
    );
    assert(
      (await tokenERC721._getPermissions(user2.address)).updateMetadata == true
    );

    await tokenERC721.connect(v3Owner).removeFromMetadataList(user2.address);
    assert(
      (await tokenERC721._getPermissions(user2.address)).updateMetadata == false
    );
  });

  it("#8 - user2 (now with erc20 deployment permission), deploys a new ERC20 contract (v4 type)", async () => {
    // the last argument is the minter for the erc20(v4)
    const trxERC20 = await tokenERC721
      .connect(user2)
      .createERC20("ERC20DT1", "ERC20DT1Symbol", web3.utils.toWei("10"), 1, user2.address);
    const trxReceiptERC20 = await trxERC20.wait();
    erc20Address = trxReceiptERC20.events[3].args.erc20Address;

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
    // user2 is already minter (last argument in createERC20())
    assert((await erc20Token.permissions(user2.address)).minter == true)
  });

  it("#9 - user2 (erc20 deployment permission), is already minter on the newly erc20 contract(v4), then mints some ERC20DT tokens", async () => {
   // user2 already has minting permission because was set as default minter when deploying a new erc20
   assert(
    (await erc20Token.balanceOf(user2.address)) == 0
  ); 
   
   await erc20Token.connect(user2).mint(user2.address, web3.utils.toWei("2"));

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("2")
    );
  });

  it("#10 - v3DTOwnerAddress now decides to sell and transfer the NFT, he first calls cleanPermissions, then transfer the NFT", async () => {
    

    assert((await tokenERC721.ownerOf(1)) == v3DTOwnerAddress);

    await tokenERC721
      .connect(v3Owner)
      .transferFrom(v3DTOwnerAddress, newOwner.address, 1);

    assert((await tokenERC721.balanceOf(v3DTOwnerAddress)) == 0);

    assert((await tokenERC721.ownerOf(1)) == newOwner.address);
  });

  it("#11 - v3DTOwnerAddress is not NFT owner anymore, nor has any other role, neither older users", async () => {
    
    await expectRevert(
      tokenERC721
        .connect(v3Owner)
        .createERC20("ERC20DT2", "ERC20DT2Symbol", web3.utils.toWei("10"), 1, v3DTOwnerAddress),
      "ERC721Template: NOT MINTER_ROLE"
    );
    
    
    await expectRevert(
      tokenERC721
        .connect(user2)
        .createERC20("ERC20DT2", "ERC20DT2Symbol", web3.utils.toWei("10"), 1, user2.address),
      "ERC721Template: NOT MINTER_ROLE"
    );

    await expectRevert(
      erc20Token.connect(user2).mint(user2.address, web3.utils.toWei("1")),
      "ERC20Template: NOT MINTER"
    );
  });

  it("#12 - newOwner now owns the NFT but still has no roles, so transactions revert", async () => {
    await expectRevert(
      tokenERC721
        .connect(newOwner)
        .createERC20("ERC20DT2", "ERC20DT2Symbol", web3.utils.toWei("10"), 1,newOwner.address),
      "ERC721Template: NOT MINTER_ROLE"
    );

    await expectRevert(
      erc20Token.connect(newOwner).mint(user2.address, web3.utils.toWei("1")),
      "ERC20Template: NOT MINTER"
    );
  });

  it("#13 - newOwner is already manager when receiving the NFT, can start assigning roles", async () => {
    // we don't need to connect(newOwner) since it's the first user when getSigners() so it goes by default
  

    // ROLES in 721:
    // if the NFT owner assigns another manager, the new manager could grant or revoke these roles too.

    await tokenERC721.addTo725StoreList(user2.address); // Add data into the store (725Y)
    await tokenERC721.addToCreateERC20List(user2.address); // Create new erc20 tokens (v4)
    await tokenERC721.addToMetadataList(user2.address); // Update Metadata (for Aqua and 725Y)
    await tokenERC721.addV3Minter(user2.address); // Minting on wrapped v3 DT
  });

  it("#14 - user2 mints on v3 wrapped token to a new user ", async () => {
    await tokenERC721
      .connect(user2)
      .mintV3DT(v3Datatoken, user4.address, web3.utils.toWei("5"));
    assert(
      (await v3DTContract.balanceOf(user4.address)) == web3.utils.toWei("5")
    );
  });

  it("#15 - user2 mints on an already existing v4 erc20 contract, after being added as minter at erc20 level ", async () => {
    await erc20Token.connect(user2).addMinter(user2.address) // whoever has deployer erc20 roles can add minters 
    await erc20Token.connect(user2).mint(user4.address, web3.utils.toWei("2"));

    assert(
      (await erc20Token.balanceOf(user4.address)) == web3.utils.toWei("2")
    );
  });

  it("#16 - user2 deploys a new erc20 contract(v4), then mints some tokens ", async () => {
    const trxERC20 = await tokenERC721
      .connect(user2)
      .createERC20("ERC20DT1", "ERC20DT1Symbol", web3.utils.toWei("10"), 1,user2.address);
    const trxReceiptERC20 = await trxERC20.wait();
    newERC20Address = trxReceiptERC20.events[3].args.erc20Address;

    newERC20Token = await ethers.getContractAt("ERC20Template", newERC20Address);

    // user2 was assigned as minter, Now it can mint
    await newERC20Token.connect(user2).mint(user4.address, web3.utils.toWei("2"));

    assert(
      (await newERC20Token.balanceOf(user4.address)) == web3.utils.toWei("2")
    );

  });

  // NOTE: each time an NFT is transferred (sold), we'll have to clean permissions at the 721 level, plus at erc20 level for each v4 DT deployed.
  


});
