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
    newERC721Template;

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  const v3Datatoken = "0xa2B8b3aC4207CFCCbDe4Ac7fa40214fd00A2BA71"
  const v3DTOwner = "0x12BD31628075C20919BA838b89F414241b8c4869"
  
  const migrateFromV3 = async (v3DTOwner,v3Datatoken) => {
    // WE IMPERSONATE THE ACTUAL v3DT OWNER and create a new ERC721 Contract, from which we are going to wrap the v3 datatoken
    
    await impersonate(v3DTOwner)
    signer = ethers.provider.getSigner(v3DTOwner);
    const tx = await factoryERC721.connect(signer).deployERC721Contract(
      "NFT2",
      "NFTSYMBOL",
      data,
      flags,
      1
    );
    const txReceipt = await tx.wait();
  
    tokenAddress = txReceipt.events[4].args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);
    assert(await tokenERC721.v3DT(v3Datatoken) == false)
   
    // WE then have to Propose a new minter for the v3Datatoken
  
    v3DTContract = await ethers.getContractAt("IV3ERC20", v3Datatoken);
    await v3DTContract.connect(signer).proposeMinter(tokenAddress)
  
    // ONLY V3DTOwner can now call wrapV3DT() to transfer minter permission to the erc721Contract
    await tokenERC721.connect(signer).wrapV3DT(v3Datatoken,v3DTOwner)
    assert(await tokenERC721.v3DT(v3Datatoken) == true)
    assert((await tokenERC721._getPermissions(v3DTOwner)).v3Minter == true);
    
    return tokenERC721;
  }

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

    const Metadata = await ethers.getContractFactory("Metadata");

    [owner, reciever, user2, user3] = await ethers.getSigners();

    // cap = new BigNumber('1400000000')
    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);
   
    //console.log(metadata.address)

    templateERC20 = await ERC20Template
      .deploy();
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );

    metadata = await Metadata.deploy(factoryERC20.address);
    templateERC721 = await ERC721Template
      .deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      communityFeeCollector,
      factoryERC20.address,
      metadata.address
    );

    newERC721Template = await ERC721Template
      .deploy();

    //await metadata.setERC20Factory(factoryERC20.address);
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
    //await tokenERC721.addManager(owner.address);
  });

  it("#isInitialized - should check that the tokenERC721 contract is initialized", async () => {
    expect(await tokenERC721.isInitialized()).to.equal(true);
  });

  it("#initialize - should fail to re-initialize the contracts", async () => {
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

  it("#mint - should mint 1 ERC721 to owner", async () => {
  
    assert((await tokenERC721.balanceOf(owner.address)) == 1);
  });

  it("#updateMetadata - should not be allowed to update the metadata if NOT in MetadataList", async () => {
    await expectRevert(
      tokenERC721.updateMetadata(data, flags),
      "ERC721Template: NOT METADATA_ROLE"
    );
  });

  it("#updateMetadata - should update the metadata, after adding address to MetadataList", async () => {
    await tokenERC721.addToMetadataList(owner.address);

    const keyMetadata = web3.utils.keccak256("METADATA_KEY");
    assert(await tokenERC721.getData(keyMetadata) == data)

    let newData = web3.utils.asciiToHex('SomeNewData');
    await tokenERC721.updateMetadata(flags, newData);
    
    assert(await tokenERC721.getData(keyMetadata) == newData)
    
   
  });

  it("#createERC20 - should not allow to create a new ERC20Token if NOT in CreateERC20List", async () => {
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

  it("#createERC20 - should create a new ERC20Token, after adding address to CreateERC20List", async () => {
    await tokenERC721.addToCreateERC20List(owner.address);
    await tokenERC721.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1,
      owner.address
    );
  });

  it("#cleanPermissions - should fail to clean lists, if not NFT Owner", async () => {
    await expectRevert(
      tokenERC721.connect(user2).cleanPermissions(),
      "ERC721Template: not NFTOwner"
    );
  });

  it("#cleanPermissions - should clean lists, only NFT Owner", async () => {
    await tokenERC721.addToCreateERC20List(owner.address);
    await tokenERC721.addToCreateERC20List(user2.address);

    assert(
      (await tokenERC721._getPermissions(owner.address)).deployERC20 == true
    );
    assert(
      (await tokenERC721._getPermissions(user2.address)).deployERC20 == true
    );

    await expectRevert(
      tokenERC721.connect(user2).cleanPermissions(),
      "ERC721Template: not NFTOwner"
    );

    await tokenERC721.cleanPermissions();

    assert(
      (await tokenERC721._getPermissions(owner.address)).deployERC20 == false
    );
    assert(
      (await tokenERC721._getPermissions(user2.address)).deployERC20 == false
    );
    assert(
      (await tokenERC721._getPermissions(user3.address)).deployERC20 == false
    );

    await tokenERC721.addManager(owner.address); // WE CLEANED OURSELF TO FROM ALL LISTS, so we need to re-ADD us.

    await tokenERC721.addToCreateERC20List(user3.address);
    assert((await tokenERC721.auth(0)) == owner.address);
    assert((await tokenERC721.auth(1)) == user3.address);
  });

  it("#addManager - should succed to add a new manager, if NFT owner", async () => {
    assert(
      (await tokenERC721._getPermissions(user2.address)).manager == false
    );
    await tokenERC721.addManager(user2.address);

    assert(
      (await tokenERC721._getPermissions(user2.address)).manager == true
    );
   
  });
  it("#addManager - should fail to add a new manager, when NOT NFT owner", async () => {
    assert(
      (await tokenERC721._getPermissions(user3.address)).manager == false
    );
    
    await expectRevert(
      tokenERC721.connect(user2).addManager(user3.address),
      "ERC721Template: not NFTOwner"
    );
    
    assert(
      (await tokenERC721._getPermissions(user3.address)).manager == false
    );
    
  });

  it("#removeManager - should succed to remove a manager, if NFT owner", async () => {
    await tokenERC721.addManager(user2.address);
    assert(
      (await tokenERC721._getPermissions(user2.address)).manager == true
    );
    await tokenERC721.removeManager(user2.address);

    assert(
      (await tokenERC721._getPermissions(user2.address)).manager == false
    );
    
  });

  it("#removeManager - should fail to remove a manager, when NOT NFT owner", async () => {
    await tokenERC721.addManager(user3.address);
    assert(
      (await tokenERC721._getPermissions(user3.address)).manager == true
    );
    
    await expectRevert(
      tokenERC721.connect(user2).removeManager(user3.address),
      "ERC721Template: not NFTOwner"
    );
    
    assert(
      (await tokenERC721._getPermissions(user3.address)).manager == true
    );
    
  });

  it("#removeManager - should succed to remove and re-add the NFT owner from manager list, if NFT owner", async () => {
    
    assert(
      (await tokenERC721._getPermissions(owner.address)).manager == true
    );
    await tokenERC721.removeManager(owner.address);

    assert(
      (await tokenERC721._getPermissions(owner.address)).manager == false
    );
    await tokenERC721.addManager(owner.address);
    
    assert(
      (await tokenERC721._getPermissions(owner.address)).manager == true
    );
  });
  it("#executeCall - should fail to call executeCall, if NOT manager", async () => {
    const operation = 0
    const to = user2.address
    const value = 10
    const data = web3.utils.asciiToHex('SomeData');

    assert(
      (await tokenERC721._getPermissions(user2.address)).manager == false
    );
    
    await expectRevert(
      tokenERC721.connect(user2).executeCall(operation,to,value,data),
      "ERC721RolesAddress: NOT MANAGER"
    );

    
  });

  it("#executeCall - should succed to call executeCall, if Manager", async () => {
    const operation = 0
    const to = user2.address
    const value = 10
    const data = web3.utils.asciiToHex('SomeData');

    assert(
      (await tokenERC721._getPermissions(owner.address)).manager == true
    );
    
   
     await tokenERC721.executeCall(operation,to,value,data)
    
  });

  it("#setNewData - should fail to set new Data(725Y)(ARBITRARY KEY), if NOT store updater", async () => {
    const key = web3.utils.keccak256('ARBITRARY_KEY');
    const value = web3.utils.asciiToHex('SomeData')

    assert(
      (await tokenERC721._getPermissions(user2.address)).store == false
    );
    
    await expectRevert(
      tokenERC721.connect(user2).setNewData(key,value),
      "ERC721Template: NOT STORE UPDATER"
    );

    
  });

  it("#setNewData - should succed to set new Data(725Y)(ARBITRARY KEY), if store updater", async () => {
    const key = web3.utils.keccak256('ARBITRARY_KEY');
    const value = web3.utils.asciiToHex('SomeData')
    await tokenERC721.addTo725StoreList(user2.address)

    assert(
      (await tokenERC721._getPermissions(user2.address)).store == true
    );
    
    await tokenERC721.connect(user2).setNewData(key,value)

    assert(await tokenERC721.getData(key) == value)
    
  });

  it("#setDataERC20 - should fail to call setDataERC20(725Y), even if user has store updater permssion", async () => {
    const key = web3.utils.keccak256('ARBITRARY_KEY');
    const value = web3.utils.asciiToHex('SomeData')
    await tokenERC721.addTo725StoreList(user2.address)

    assert(
      (await tokenERC721._getPermissions(user2.address)).store == true
    );
    // ONLY CALLS from ERC20 contract are allowed
    await expectRevert(tokenERC721.connect(user2).setDataERC20(key,value),"ERC721Template: NOT ERC20 Contract" )
    result = await tokenERC721.getData(key)
   // console.log(result)
    assert(await tokenERC721.getData(key) == '0x')
    
  });

  it("#wrapV3DT - should fail to call wrapV3DT, if NOT NFT owner", async () => {
   
    await expectRevert(tokenERC721.connect(user2).wrapV3DT(v3Datatoken,owner.address),"ERC721Template: not NFTOwner" )
    
  });

  it("#wrapV3DT - should fail to call wrapV3DT, if caller is NOT ERC20 minter(v3 minter/owner as dt.minter())", async () => {
    // NOW CALLER IS NFT OWNER BUT IS NOT DT MINTER(V3) / OWNER
    await expectRevert(tokenERC721.wrapV3DT(v3Datatoken,owner.address),"ERC721Template: NOT ERC20 V3 datatoken owner" )
    
  });



  it("#wrapV3DT - should succed to wrapV3DT, if caller is  v3 minter/owner as dt.minter())", async () => {
    // v3DTOwner has to deploy a new ERC721Contract which will be the new minter
    await impersonate(v3DTOwner)
    signer = ethers.provider.getSigner(v3DTOwner);
    const tx = await factoryERC721.connect(signer).deployERC721Contract(
      "NFT2",
      "NFTSYMBOL",
      data,
      flags,
      1
    );
    const txReceipt = await tx.wait();

    tokenAddress = txReceipt.events[4].args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);
    symbol = await tokenERC721.symbol();
    name = await tokenERC721.name();
    assert(await tokenERC721.v3DT(v3Datatoken) == false)
   
    // WE NEED TO PROPOSE MINTER in a different step

    v3DTContract = await ethers.getContractAt("IV3ERC20", v3Datatoken);
    await v3DTContract.connect(signer).proposeMinter(tokenAddress)

    // V3DTOwner can now call wrapV3DT() to transfer minter permission to the erc721Contract
    await tokenERC721.connect(signer).wrapV3DT(v3Datatoken,v3DTOwner)
    assert(await tokenERC721.v3DT(v3Datatoken) == true)
    assert((await tokenERC721._getPermissions(v3DTOwner)).v3Minter == true);
  });

  it("#mintV3DT - should succeed to mintV3DT, if caller has v3Minter permission", async () => {
    
    tokenERC721 = await migrateFromV3(v3DTOwner,v3Datatoken)

    assert(await v3DTContract.balanceOf(user2.address) == 0)
    await tokenERC721.connect(signer).mintV3DT(v3Datatoken, user2.address,  web3.utils.toWei("10"))
    assert(await v3DTContract.balanceOf(user2.address) == web3.utils.toWei("10"))
  });

  it("#mintV3DT - should fail to mintV3DT, if caller has NO v3Minter permission", async () => {
    tokenERC721 = await migrateFromV3(v3DTOwner,v3Datatoken)

    assert((await tokenERC721._getPermissions(user2.address)).v3Minter == false);

    assert(await v3DTContract.balanceOf(user2.address) == 0)
    await expectRevert(tokenERC721.connect(user2).mintV3DT(v3Datatoken, user2.address,  web3.utils.toWei("10")),"ERC721Template: NOT v3 MINTER")
    assert(await v3DTContract.balanceOf(user2.address) == 0)
  });

  it("#mintV3DT - should fail to mintV3DT, if v3DT is has not being wrapped", async () => {
   
    assert(await tokenERC721.v3DT(v3Datatoken) == false)
    await tokenERC721.addV3Minter(owner.address)
    assert((await tokenERC721._getPermissions(owner.address)).v3Minter == true);

    assert(await v3DTContract.balanceOf(user2.address) == 0)
    await expectRevert(tokenERC721.mintV3DT(v3Datatoken, user2.address,  web3.utils.toWei("10")),"ERC721Template: v3Datatoken not WRAPPED")
    assert(await v3DTContract.balanceOf(user2.address) == 0)
  });

  it("#setDataV3 - should fail to call setDataV3, if it's not v3Minter", async () => {
    const value = web3.utils.asciiToHex('SomeData')
    assert((await tokenERC721._getPermissions(owner.address)).v3Minter == false);
    
    await expectRevert(tokenERC721.setDataV3(v3Datatoken, value,flags,data),"ERC721Template: NOT v3Minter")
    
  });

  it("#setDataV3 - should fail to call setDataV3, if it's not v3Datatoken is not wrapped", async () => {
    const value = web3.utils.asciiToHex('SomeData')
    await tokenERC721.addV3Minter(owner.address)
    await expectRevert(tokenERC721.setDataV3(v3Datatoken, value,flags,data),"ERC721Template: v3Datatoken not WRAPPED")
    
  });


  it("#setDataV3 - should succeed to call setDataV3, if token is wrapped and caller has minter role", async () => {
    tokenERC721 = await migrateFromV3(v3DTOwner,v3Datatoken)

    const value = web3.utils.asciiToHex('SomeData')
    let newData = web3.utils.asciiToHex('SomeNewData');

    await tokenERC721.connect(signer).setDataV3(v3Datatoken, value,flags,newData)  

    const key = web3.utils.keccak256(v3Datatoken);
    assert(await tokenERC721.getData(key) == value)
    
    // check events on Metadata.sol
    
    
    
  });



  it("#addV3Minter - should fail to addV3Minter, if caller has NOT MANAGER", async () => {
    
    assert((await tokenERC721._getPermissions(user2.address)).v3Minter == false);
    await expectRevert(tokenERC721.connect(user2).addV3Minter(user2.address),"ERC721RolesAddress: NOT MANAGER")
    assert((await tokenERC721._getPermissions(user2.address)).v3Minter == false);
  });

  it("#addV3Minter - should succeed to addV3Minter, if caller is MANAGER", async () => {
    
    assert((await tokenERC721._getPermissions(user2.address)).v3Minter == false);
    await tokenERC721.addV3Minter(user2.address)
    assert((await tokenERC721._getPermissions(user2.address)).v3Minter == true);
   
  });

  it("#removeV3Minter - should fail to removeV3Minter, if caller has NOT MANAGER", async () => {
    await tokenERC721.addV3Minter(user2.address)
    assert((await tokenERC721._getPermissions(user2.address)).v3Minter == true);
    await expectRevert(tokenERC721.connect(user2).removeV3Minter(user2.address),"ERC721RolesAddress: NOT MANAGER")
    assert((await tokenERC721._getPermissions(user2.address)).v3Minter == true);
  });

  it("#removeV3Minter - should succeed to removeV3Minter, if caller is MANAGER", async () => {
    await tokenERC721.addV3Minter(user2.address)
    assert((await tokenERC721._getPermissions(user2.address)).v3Minter == true);
    await tokenERC721.removeV3Minter(user2.address)
    assert((await tokenERC721._getPermissions(user2.address)).v3Minter == false);
  });

  
  it("#transferNFT - should transfer properly the NFT, now the new user is the owner for ERC721Template and ERC20Template", async () => {
    await tokenERC721.addToCreateERC20List(owner.address);
    const trxERC20 = await tokenERC721.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1,
      owner.address
    );
    const trxReceiptERC20 = await trxERC20.wait();
    erc20Address = trxReceiptERC20.events[3].args.erc20Address;

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);

    // OWNER is already minter, because it was set when deploying a new ERC20. Could be any other account(set as argument into createERC20())
    await erc20Token.mint(user2.address, web3.utils.toWei("2"));

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("2")
    );

    assert((await tokenERC721.ownerOf(1)) == owner.address);
    await tokenERC721.transferFrom(owner.address, user2.address, 1);
    assert((await tokenERC721.balanceOf(owner.address)) == 0);
    assert((await tokenERC721.ownerOf(1)) == user2.address);

    await expectRevert(
      tokenERC721.createERC20(
        "ERC20DT2",
        "ERC20DT2Symbol",
        web3.utils.toWei("10"),
        1,
        owner.address
      ),
      "ERC721Template: NOT MINTER_ROLE"
    );
  

  
    await tokenERC721.connect(user2).addToCreateERC20List(user2.address);
    await tokenERC721
      .connect(user2)
      .createERC20("ERC20DT2", "ERC20DT2Symbol", web3.utils.toWei("10"), 1,owner.address)

  

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
      tokenERC721.updateMetadata(flags, data),
      "ERC721Template: NOT METADATA_ROLE"
    );

    await expectRevert(
      tokenERC721.connect(user2).updateMetadata(flags, data),
      "ERC721Template: NOT METADATA_ROLE"
    );

    await expectRevert(
      tokenERC721.addToMetadataList(user2.address),
      "ERC721RolesAddress: NOT MANAGER"
    );

    await tokenERC721.connect(user2).addToMetadataList(user2.address);
   // await tokenERC721.connect(user2).updateMetadata(flags, data);

    const keyMetadata = web3.utils.keccak256("METADATA_KEY");
    assert(await tokenERC721.getData(keyMetadata) == data)
    let newData = web3.utils.asciiToHex('SomeNewData');
    await tokenERC721.connect(user2).updateMetadata(flags, newData);
    
    assert(await tokenERC721.getData(keyMetadata) == newData)
  });
});
