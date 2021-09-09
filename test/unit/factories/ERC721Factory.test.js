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
    templateERC721,
    templateERC20,
    newERC721Template,
    cap = web3.utils.toWei("100000");

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  const oceanAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
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

    const Metadata = await ethers.getContractFactory("Metadata");
    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("ssFixedRate");
    const BPool = await ethers.getContractFactory("BPool");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );


    [owner, reciever, user2, user3,user4, user5, user6, provider, opfCollector, marketFeeCollector] = await ethers.getSigners();

    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);

 // DEPLOY ROUTER, SETTING OWNER

    poolTemplate = await BPool.deploy();



    router = await Router.deploy(
     owner.address,
     oceanAddress,
     poolTemplate.address, // pooltemplate field,
     opfCollector.address,
     []
   );
      

   ssFixedRate = await SSContract.deploy(router.address);

   fixedRateExchange = await FixedRateExchange.deploy(
     router.address,
     opfCollector.address
   );
 
   templateERC20 = await ERC20Template.deploy();
 
   metadata = await Metadata.deploy();
 
   // SETUP ERC721 Factory with template
   templateERC721 = await ERC721Template.deploy();
   newERC721Template = await ERC721Template.deploy();

   factoryERC721 = await ERC721Factory.deploy(
     templateERC721.address,
     templateERC20.address,
     opfCollector.address,
     router.address,
     metadata.address
   );
 
   // SET REQUIRED ADDRESS
 
   await metadata.addTokenFactory(factoryERC721.address);
 
   await router.addFactory(factoryERC721.address);
 
   await router.addFixedRateContract(fixedRateExchange.address); 

   await router.addSSContract(ssFixedRate.address)
    

    // by default connect() in ethers goes with the first address (owner in this case)
    const tx = await factoryERC721.deployERC721Contract(
      "NFT",
      "NFTSYMBOL",
      data,
      flags,
      1
    );
    const txReceipt = await tx.wait();

    tokenAddress = txReceipt.events[4].args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);

    assert((await tokenERC721.balanceOf(owner.address)) == 1);

    await tokenERC721.addManager(user2.address);
    await tokenERC721.connect(user2).addTo725StoreList(user3.address);
    await tokenERC721.connect(user2).addToCreateERC20List(user3.address);
    await tokenERC721.connect(user2).addToMetadataList(user3.address);

    assert((await tokenERC721.getPermissions(user3.address)).store == true);
    assert(
      (await tokenERC721.getPermissions(user3.address)).deployERC20 == true
    );
    assert(
      (await tokenERC721.getPermissions(user3.address)).updateMetadata == true
    );
    const trxERC20 = await tokenERC721.connect(user3).createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      cap,
      1,
      user3.address, // minter
      user6.address // feeManager
    );
    const trxReceiptERC20 = await trxERC20.wait();
    erc20Address = trxReceiptERC20.events[3].args.erc20Address;

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
    assert((await erc20Token.permissions(user3.address)).minter == true);
  });

  it("#deployERC721Contract - should deploy a new erc721 contract and send tokenId=1 to contract owner", async () => {
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
  });

  it("#deployERC721Contract - should deploy a new erc721 contract and emit TokenCreated event", async () => {
    const tx = await factoryERC721.deployERC721Contract(
      "DT1",
      "DTSYMBOL",
      data,
      flags,
      1
    );
    const txReceipt = await tx.wait();
    tokenAddress = txReceipt.events[4].args[0];

    assert(txReceipt.events[4].event == "NFTCreated");
    assert(txReceipt.events[4].args[1] == templateERC721.address);
    assert(txReceipt.events[4].args[3] == owner.address);
  });

  it("#deployERC721Contract - should fail to deploy a new erc721 contract if template index doesn't exist", async () => {
    await expectRevert(
      factoryERC721.deployERC721Contract("DT1", "DTSYMBOL", data, flags, 7),
      "ERC721DTFactory: Template index doesnt exist"
    );
  });

  it("#deployERC721Contract - should fail to deploy a new erc721 contract if template index is ZERO", async () => {
    await expectRevert(
      factoryERC721.deployERC721Contract("DT1", "DTSYMBOL", data, flags, 0),
      "ERC721DTFactory: Template index doesnt exist"
    );
  });

  it("#deployERC721Contract - should fail if token template is not active", async () => {
    
    await factoryERC721.add721TokenTemplate(newERC721Template.address);
    await factoryERC721.disable721TokenTemplate(2);

    await expectRevert(
      factoryERC721.deployERC721Contract("DT1", "DTSYMBOL", data, flags, 2),
      "ERC721DTFactory: ERC721Token Template disabled"
    );
  });

  it("#getCurrentNFTCount - should return token count", async () => {
    assert((await factoryERC721.getCurrentNFTCount()) == 1);

    await factoryERC721.deployERC721Contract("DT1", "DTSYMBOL", data, flags, 1);

    assert((await factoryERC721.getCurrentNFTCount()) == 2);
  });

  it("#getNFTTemplate - should return token template struct", async () => {
    const template = await factoryERC721.getNFTTemplate(1);

    assert(template.templateAddress == templateERC721.address);
    assert(template.isActive == true);
  });

  it("#getCurrentNFTTemplateCount - should return template count", async () => {
    assert((await factoryERC721.getCurrentNFTTemplateCount()) == 1);

    await factoryERC721.add721TokenTemplate(newERC721Template.address);

    assert((await factoryERC721.getCurrentNFTTemplateCount()) == 2);
  });

  it("#add721TokenTemplate - should fail to add Token Template if not Owner", async () => {
    await expectRevert(
      factoryERC721.connect(user2).add721TokenTemplate(newERC721Template.address),
      "Ownable: caller is not the owner"
    );
  });

  it("#add721TokenTemplate - should succeed to add Token Template if Owner", async () => {
    await factoryERC721.add721TokenTemplate(newERC721Template.address);
    assert((await factoryERC721.getCurrentNFTTemplateCount()) == 2);
  });

  it("#disable721TokenTemplate - should fail to disable Token Template if not Owner", async () => {
    await expectRevert(
      factoryERC721.connect(user2).disable721TokenTemplate(1),
      "Ownable: caller is not the owner"
    );
  });

  it("#disable721TokenTemplate - should succeed to disable Token Template if Owner", async () => {
    await factoryERC721.add721TokenTemplate(newERC721Template.address);
    let template = await factoryERC721.getNFTTemplate(2);
    assert(template.templateAddress == newERC721Template.address);
    // active by default
    assert(template.isActive == true);

    await factoryERC721.disable721TokenTemplate(2);

    template = await factoryERC721.getNFTTemplate(2);

    assert(template.templateAddress == newERC721Template.address);
    assert(template.isActive == false);
  });

  it("#reactivate721TokenTemplate - should fail to reactivate Token Template if not Owner", async () => {
    await expectRevert(
      factoryERC721.connect(user2).disable721TokenTemplate(1),
      "Ownable: caller is not the owner"
    );
  });

  it("#reactivate721TokenTemplate - should succeed to reactivate Token Template if Owner", async () => {
    await factoryERC721.add721TokenTemplate(newERC721Template.address);
    let template = await factoryERC721.getNFTTemplate(2);
    assert(template.templateAddress == newERC721Template.address);
    // active by default
    assert(template.isActive == true);

    await factoryERC721.disable721TokenTemplate(2);

    template = await factoryERC721.getNFTTemplate(2);

    assert(template.isActive == false);

    await factoryERC721.reactivate721TokenTemplate(2);

    template = await factoryERC721.getNFTTemplate(2);

    assert(template.isActive == true);
  });

  it("#createToken - should not allow to create a new ERC20Token if NOT in CreateERC20List", async () => {
    assert((await tokenERC721.getPermissions(user6.address)).deployERC20 == false);
    await expectRevert(
      tokenERC721.connect(user6).createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1,
        owner.address,
        user6.address
      ),
      "ERC721Template: NOT ERC20DEPLOYER_ROLE"
    );
  });

  it("#createToken - should create a new ERC20Token, after adding address to CreateERC20List", async () => {
    await tokenERC721.addToCreateERC20List(user6.address);
    await tokenERC721.connect(user6).createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1,
      owner.address,
      user6.address
    );
  });

  it("#createToken - should fail to create an ERC20 calling the factory directly", async () => {
    await expectRevert(
      factoryERC721.createToken(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1,
        owner.address,
        user6.address
      ),
      "ERC721Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  it("#createToken - should not allow to create a new ERC20Token directly if ERC721 contract is not on the list", async () => {
    // this test will fail when doing solidity coverage because the templateERC721 has no ether and no fallback
    await impersonate(templateERC721.address);
   
    const signer = await ethers.provider.getSigner(templateERC721.address);

    await expectRevert(
      factoryERC721
        .connect(signer)
        .createToken(
          "ERC20DT1",
          "ERC20DT1Symbol",
          web3.utils.toWei("10"),
          1,
          owner.address,
          user6.address
        ),
      "ERC721Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  it("#createToken - should not allow to create a new ERC20Token directly from the ERC721Factory even if is a contract", async () => {
      // this test will fail when doing solidity coverage because the templateERC721 has no ether and no fallback
    await impersonate(newERC721Template.address);
    const signer = await ethers.provider.getSigner(newERC721Template.address);

    await expectRevert(
      factoryERC721
        .connect(signer)
        .createToken(
          "ERC20DT1",
          "ERC20DT1Symbol",
          web3.utils.toWei("10"),
          1,
          owner.address,
          user6.address
        ),
      "ERC721Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
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
        owner.address,
        user6.address
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
        owner.address,
        user6.address
      ),
      "Template index doesnt exist"
    );
  });

  it("#templateCount - should get templateCount from ERC20Factory", async () => {
    assert((await factoryERC721.templateCount()) == 1);
  });

  it("#addTokenTemplate - should add a new ERC20 Template from owner(owner)", async () => {
    await factoryERC721.addTokenTemplate(newERC721Template.address);
    assert((await factoryERC721.templateCount()) == 2);
  });

  it("#addTokenTemplate - should fail to add a new ERC20 Template if not owner", async () => {
    await expectRevert(
      factoryERC721.connect(user2).addTokenTemplate(newERC721Template.address),
      "Ownable: caller is not the owner"
    );
  });

  it("#disableTokenTemplate - should disable a specific ERC20 Template from owner", async () => {
    let templateStruct = await factoryERC721.templateList(1);
    assert(templateStruct.isActive == true);
    await factoryERC721.disableTokenTemplate(1);
    templateStruct = await factoryERC721.templateList(1);
    assert(templateStruct.isActive == false);
  });

  it("#disableTokenTemplate - should fail to disable a specific ERC20 Template from NOT owner", async () => {
    let templateStruct = await factoryERC721.templateList(1);
    assert(templateStruct.isActive == true);
    await expectRevert(
      factoryERC721.connect(user2).disableTokenTemplate(1),
      "Ownable: caller is not the owner"
    );
    templateStruct = await factoryERC721.templateList(1);
    assert(templateStruct.isActive == true);
  });

  it("#disableTokenTemplate - should fail to create a specific ERC20 Template if the template is disabled", async () => {
    await factoryERC721.disableTokenTemplate(1);
    await tokenERC721.addToCreateERC20List(owner.address);
    await expectRevert(
      tokenERC721.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1,
        owner.address,
        user6.address
      ),
      "ERC721Token Template disabled"
    );
    templateStruct = await factoryERC721.templateList(1);
    assert(templateStruct.isActive == false);
  });

  it("#getCurrentTokenCount - should get the current token count (deployed ERC20)", async () => {
    assert((await factoryERC721.getCurrentTokenCount()) == 1);
  });

  it("#getTokenTemplate - should get the ERC20token template struct", async () => {
    const template = await factoryERC721.getTokenTemplate(1);
    assert(template.isActive == true);
    assert(template.templateAddress == templateERC20.address);
  });

  it("#getTokenTemplate - should fail to get the ERC20token template struct if index == 0", async () => {
    await expectRevert(
      factoryERC721.getTokenTemplate(0),
      "ERC20Factory: Template index doesnt exist"
    );
  });

  it("#getTokenTemplate - should fail to get the ERC20token template struct if index > templateCount", async () => {
    await expectRevert(
      factoryERC721.getTokenTemplate(3),
      "ERC20Factory: Template index doesnt exist"
    );
  });


  it("#getCurrentTemplateCount - should succeed to get Template count", async () => {
    assert((await factoryERC721.getCurrentTemplateCount()) == 1);
  });

 
});
