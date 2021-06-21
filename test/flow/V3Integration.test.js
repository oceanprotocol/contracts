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
    erc20Token,
    newERC721Template;

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  const v3Datatoken = "0xa2B8b3aC4207CFCCbDe4Ac7fa40214fd00A2BA71"
  const v3DTOwner = "0x12BD31628075C20919BA838b89F414241b8c4869"
  

  before("init contracts for each test", async () => {
   
    
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
      .deploy();
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );
    templateERC721 = await ERC721Template
      .deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      communityFeeCollector,
      factoryERC20.address
    );

    newERC721Template = await ERC721Template
      .deploy();

    await metadata.setERC20Factory(factoryERC20.address);
    await factoryERC20.setERC721Factory(factoryERC721.address);
    
    await impersonate(v3DTOwner)
    signer = ethers.provider.getSigner(v3DTOwner);

  });

  it("#1 - v3DT Owner deploys a new ERC721 Contract", async () => {
    
    const tx = await factoryERC721.connect(signer).deployERC721Contract(
      "NFT",
      "NFTSYMBOL",
      metadata.address,
      data,
      flags,
      1
    );
    const txReceipt = await tx.wait();
  
    tokenAddress = txReceipt.events[4].args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);

    assert((await tokenERC721.balanceOf(v3DTOwner)) == 1);
  });

  it("#2 - v3DTOwner propose a new minter, which is the ERC721 address", async () => {

    v3DTContract = await ethers.getContractAt("IV3ERC20", v3Datatoken);
    await v3DTContract.connect(signer).proposeMinter(tokenAddress)

  });

  it("#3 - v3DTOwner wraps v3Datatoken into the ERC721", async () => {
    await tokenERC721.connect(signer).wrapV3DT(v3Datatoken,v3DTOwner)
    assert(await tokenERC721.v3DT(v3Datatoken) == true)
    assert((await tokenERC721._getPermissions(v3DTOwner)).v3Minter == true);
    
  });

  it("#4 - v3DTOwner mints new V3DTokens, from the ERC721Contract", async () => {
    
    assert(await v3DTContract.balanceOf(user2.address) == 0)
    await tokenERC721.connect(signer).mintV3DT(v3Datatoken, user2.address,  web3.utils.toWei("10"))
    assert(await v3DTContract.balanceOf(user2.address) == web3.utils.toWei("10"))

  });

  it("#5 - v3DTOwner is the manager and the v3Minter, he assigns a new user to be v3Minter, then new user mints", async () => {
    assert((await tokenERC721._getPermissions(user2.address)).v3Minter == false);
    await tokenERC721.connect(signer).addV3Minter(user2.address)
    await tokenERC721.connect(user2).mintV3DT(v3Datatoken,user3.address, web3.utils.toWei("5"))
    assert(await v3DTContract.balanceOf(user3.address) == web3.utils.toWei("5"))
  });

  it("#6 - v3DTOwner is the NFT Owner, he can assign or revoke roles just as any other NFT Owner", async () => {
    assert((await tokenERC721._getPermissions(user2.address)).store == false);
    assert((await tokenERC721._getPermissions(user2.address)).deployERC20 == false);
    assert((await tokenERC721._getPermissions(user2.address)).updateMetadata == false);
    
    await tokenERC721.connect(signer).addTo725StoreList(user2.address)
    await tokenERC721.connect(signer).addToCreateERC20List(user2.address)
    await tokenERC721.connect(signer).addToMetadataList(user2.address)
    
    assert((await tokenERC721._getPermissions(user2.address)).store == true);
    assert((await tokenERC721._getPermissions(user2.address)).deployERC20 == true);
    assert((await tokenERC721._getPermissions(user2.address)).updateMetadata == true);
    
    await tokenERC721.connect(signer).removeFromMetadataList(user2.address)
    assert((await tokenERC721._getPermissions(user2.address)).updateMetadata == false);
  });

  it("#7 - user2 (now with erc20 deployment permission), deploys a new ERC20 contract (v4 type)", async () => {

    const trxERC20 = await tokenERC721.connect(user2).createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1
    );
    const trxReceiptERC20 = await trxERC20.wait();
    erc20Address = trxReceiptERC20.events[3].args.erc20Address;

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);

  });

  it("#8 - user2 (erc20 deployment permission), add itself as minter on the newly erc20 contract, then mints some ERC20DT tokens", async () => {

    await erc20Token.connect(user2).addMinter(user2.address);
    await erc20Token.connect(user2).mint(user2.address, web3.utils.toWei("2"));

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("2")
    );

  });

  it("#9 - v3DTOwner now decides to sell and transfer the NFT, he first calls cleanPermissions, then transfer the NFT", async () => {
    // NOTE: calling cleanPermissions will remove all permission to granted to any user, even the NFT Owner which is manager by default when deploying,
    // we'll have to re-add itself as manager.
    // cleanPermissions is not a required step for transfering but highly recommended, at least by the new NFT owner asap.
    // even better, we shouldn't allow to transfer without cleaning permissions
    // minter roles permissions need to be cleaned also for each new erc20Token (we could pack all these steps)
    
    await erc20Token.connect(signer).cleanPermissions();
    await tokenERC721.connect(signer).cleanPermissions();

    assert((await tokenERC721.ownerOf(1)) == v3DTOwner);
    
    await tokenERC721.connect(signer).transferFrom(v3DTOwner, owner.address, 1);
    
    assert((await tokenERC721.balanceOf(v3DTOwner)) == 0);
    
    assert((await tokenERC721.ownerOf(1)) == owner.address);
    
  });

  it("#10 - v3DTOwner is not NFT owner anymore, nor has any other role, neither older users", async () => {
    
    await expectRevert(
      tokenERC721.connect(user2).createERC20(
        "ERC20DT2",
        "ERC20DT2Symbol",
        web3.utils.toWei("10"),
        1
      ),
      "ERC721Template: NOT MINTER_ROLE"
    );  

    await expectRevert(
      erc20Token.connect(user2).mint(user2.address, web3.utils.toWei("1")),
      "ERC20Template: NOT MINTER"
    );
    
  });






 
  


 
});
