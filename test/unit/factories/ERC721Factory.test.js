/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent, BN } = require("@openzeppelin/test-helpers");
const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { sha256 } = require("@ethersproject/sha2");
const {getEventFromTx} = require("../../helpers/utils");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const ethers = hre.ethers;
const { ecsign } = require("ethereumjs-util");


async function signMessage(message, address) {
  let signedMessage = await web3.eth.sign(message, address)
    signedMessage = signedMessage.substr(2) // remove 0x
    const r = '0x' + signedMessage.slice(0, 64)
    const s = '0x' + signedMessage.slice(64, 128)
    const v = '0x' + signedMessage.slice(128, 130)
    const vDecimal = web3.utils.hexToNumber(v)
    return { v,r,s };
  /*const { v, r, s } = ecsign(
    Buffer.from(message.slice(2), "hex"),
    Buffer.from(privateKey, "hex")
  );
  return { v, r, s };
  */
}


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
    mockErc20,
    mockErc20Decimals,
    erc20Token,
    erc20Address,
    erc20TokenWithPublishFee,
    erc20AddressWithPublishFee,
    publishMarketFeeAddress
    cap = web3.utils.toWei("100000");

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  const publishMarketFeeAmount = "5";
  const addressZero = '0x0000000000000000000000000000000000000000';

  beforeEach("init contracts for each test", async () => {
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");
    const MockErc20 = await ethers.getContractFactory('MockERC20');
    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
    const Router = await ethers.getContractFactory("FactoryRouter");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );
    const Dispenser = await ethers.getContractFactory(
      "Dispenser"
    );


    [owner, reciever, user2, user3,user4, user5, user6, provider, opcCollector, marketFeeCollector, publishMarketAccount] = await ethers.getSigners();
    publishMarketFeeAddress = publishMarketAccount.address
    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);

    mockErc20 = await MockErc20.deploy(owner.address,"MockERC20",'MockERC20');
    mockErc20Decimals = await MockErc20Decimals.deploy("Mock6Digits",'Mock6Digits',6);
 // DEPLOY ROUTER, SETTING OWNER

    router = await Router.deploy(
     owner.address,
     '0x000000000000000000000000000000000000dead', // approved tokens list, unused in this test
     '0x000000000000000000000000000000000000dead', // pooltemplate field, unused in this test
     opcCollector.address,
     []
   );
      

   fixedRateExchange = await FixedRateExchange.deploy(
     router.address
   );

   dispenser = await Dispenser.deploy(
    router.address
  );
 
   templateERC20 = await ERC20Template.deploy();
 
   
   // SETUP ERC721 Factory with template
   templateERC721 = await ERC721Template.deploy();
   newERC721Template = await ERC721Template.deploy();

   factoryERC721 = await ERC721Factory.deploy(
     templateERC721.address,
     templateERC20.address,
     router.address
   );
 
   // SET REQUIRED ADDRESS
 
   await router.addFactory(factoryERC721.address);
 
   await router.addFixedRateContract(fixedRateExchange.address); 
   await router.addDispenserContract(dispenser.address); 
 

    // by default connect() in ethers goes with the first address (owner in this case)
    const tx = await factoryERC721.deployERC721Contract(
      "NFT",
      "NFTSYMBOL",
      1,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/",
      true,
      owner.address
    );
    
    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt,'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
    tokenAddress = event.args[0];
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
    const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1","ERC20DT1Symbol"],
      [user3.address,user6.address, user3.address,'0x0000000000000000000000000000000000000000'],
      [cap,0],
      []
    );
    const trxReceiptERC20 = await trxERC20.wait();
    event = getEventFromTx(trxReceiptERC20,'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    erc20Address = event.args[0];
    
    

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
    assert((await erc20Token.permissions(user3.address)).minter == true);

    //deploy a erc20 with publishFee as well
    const trxERC20WithPublishFee = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1P","ERC20DT1SymbolP"],
      [user3.address,user6.address, publishMarketFeeAddress,mockErc20Decimals.address],
      [cap,web3.utils.toWei(publishMarketFeeAmount)],
      []
    );
    const trxReceiptERC20WithPublishFee = await trxERC20WithPublishFee.wait();
    event = getEventFromTx(trxReceiptERC20WithPublishFee,'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    erc20AddressWithPublishFee = event.args[0];
    erc20TokenWithPublishFee = await ethers.getContractAt("ERC20Template", erc20AddressWithPublishFee);
    assert((await erc20TokenWithPublishFee.permissions(user3.address)).minter == true);
  });

  it("#deployERC721Contract - should deploy a new erc721 contract and send tokenId=1 to contract owner", async () => {
    const tx = await factoryERC721.deployERC721Contract(
      "DT1",
      "DTSYMBOL",
      1,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/",
      true,
      owner.address
    );
    const txReceipt = await tx.wait();
    const event = getEventFromTx(txReceipt,'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
    tokenAddress = event.args[0];
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
      1,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/",
      true,
      owner.address
    );
    const txReceipt = await tx.wait();
    const event = getEventFromTx(txReceipt,'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
    tokenAddress = event.args[0];

    assert(event.args[1] == templateERC721.address);
    assert(event.args[3] == owner.address);
  });

  it("#deployERC721Contract - should fail to deploy a new erc721 contract if template index doesn't exist", async () => {
    await expectRevert(
      factoryERC721.deployERC721Contract("DT1", "DTSYMBOL", 7,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/",
      true,
      owner.address),
      "ERC721DTFactory: Template index doesnt exist"
    );
  });

  it("#deployERC721Contract - should fail to deploy a new erc721 contract if template index is ZERO", async () => {
    await expectRevert(
      factoryERC721.deployERC721Contract("DT1", "DTSYMBOL", 0,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/",
      true,
      owner.address),
      "ERC721DTFactory: Template index doesnt exist"
    );
  });

  it("#deployERC721Contract - should fail if token template is not active", async () => {
    
    const tx = await factoryERC721.add721TokenTemplate(newERC721Template.address);
    const txReceipt = await tx.wait();
    const event = getEventFromTx(txReceipt,'Template721Added')
    assert(event, "Cannot find Template721Added event")
    const templateIndex = event.args[1];
    await factoryERC721.disable721TokenTemplate(templateIndex);

    await expectRevert(
      factoryERC721.deployERC721Contract("DT1", "DTSYMBOL",  templateIndex,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/",
      true,
      owner.address),
      "ERC721DTFactory: ERC721Token Template disabled"
    );
  });

  it("#getCurrentNFTCount - should return token count", async () => {
    assert((await factoryERC721.getCurrentNFTCount()) == 1);

    await factoryERC721.deployERC721Contract("DT1", "DTSYMBOL",  1,
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
    "https://oceanprotocol.com/nft/",
    true,
    owner.address);

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
      tokenERC721.connect(user6).createERC20(1,
        ["ERC20DT1","ERC20DT1Symbol"],
        [owner.address,user6.address, owner.address,'0x0000000000000000000000000000000000000000'],
        [web3.utils.toWei("10"),0],
        []
      ),
      "ERC721Template: NOT ERC20DEPLOYER_ROLE"
    );
  });

  it("#createToken - should create a new ERC20Token, after adding address to CreateERC20List", async () => {
    await tokenERC721.addToCreateERC20List(user6.address);
    await tokenERC721.connect(user6).createERC20(1,
      ["ERC20DT1","ERC20DT1Symbol"],
      [owner.address,user6.address, owner.address,'0x0000000000000000000000000000000000000000'],
      [web3.utils.toWei("10"),0],
      []
    );
  });

  it("#createToken - should fail to create an ERC20 calling the factory directly", async () => {
    await expectRevert(
      factoryERC721.createToken(
        1,
        ["ERC20DT1","ERC20DT1Symbol"],
        [owner.address,user6.address, owner.address, '0x0000000000000000000000000000000000000000'],
        [web3.utils.toWei("10"),0],
        []
      ),
      "ERC721Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  it("#createToken - should not allow to create a new ERC20Token directly if ERC721 contract is not on the list", async () => {

    const transactionHash = await owner.sendTransaction({
      to: templateERC721.address,
      value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
    });
    // this test will fail when doing solidity coverage because the templateERC721 has no ether and no fallback
    await impersonate(templateERC721.address);
   
    const signer = await ethers.provider.getSigner(templateERC721.address);

    await expectRevert(
      factoryERC721
        .connect(signer)
        .createToken(
            1,
            ["ERC20DT1","ERC20DT1Symbol"],
            [owner.address,user6.address, owner.address, '0x0000000000000000000000000000000000000000'],
            [web3.utils.toWei("10"),0],
            []
        ),
      "ERC721Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  it("#createToken - should not allow to create a new ERC20Token directly from the ERC721Factory even if is a contract", async () => {
      // this test will fail when doing solidity coverage because the templateERC721 has no ether and no fallback
      const transactionHash = await owner.sendTransaction({
        to: newERC721Template.address,
        value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
      });
    await impersonate(newERC721Template.address);
    const signer = await ethers.provider.getSigner(newERC721Template.address);

    await expectRevert(
      factoryERC721
        .connect(signer)
        .createToken(
            1,
            ["ERC20DT1","ERC20DT1Symbol"],
            [owner.address,user6.address, owner.address, '0x0000000000000000000000000000000000000000'],
            [web3.utils.toWei("10"),0],
            []
        ),
      "ERC721Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  it("#createToken - should fail to create a specific ERC20 Template if the index is ZERO", async () => {
    await tokenERC721.addToCreateERC20List(owner.address);
    await expectRevert(
      tokenERC721.createERC20(0,
        ["ERC20DT1","ERC20DT1Symbol"],
        [owner.address,user6.address, owner.address,'0x0000000000000000000000000000000000000000'],
        [web3.utils.toWei("10"),0],
        []
      ),
      "ERC20Factory: Template index doesnt exist"
    );
  });

  it("#createToken - should fail to create a specific ERC20 Template if the index doesn't exist", async () => {
    await tokenERC721.addToCreateERC20List(owner.address);
    await expectRevert(
      tokenERC721.createERC20(3,
        ["ERC20DT1","ERC20DT1Symbol"],
        [owner.address,user6.address, owner.address,'0x0000000000000000000000000000000000000000'],
        [web3.utils.toWei("10"),0],
        []
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
      tokenERC721.createERC20(1,
        ["ERC20DT1","ERC20DT1Symbol"],
        [owner.address,user6.address, owner.address,'0x0000000000000000000000000000000000000000'],
        [web3.utils.toWei("10"),0],
        []
      ),
      "ERC721Token Template disabled"
    );
    templateStruct = await factoryERC721.templateList(1);
    assert(templateStruct.isActive == false);
  });

  it("#getCurrentTokenCount - should get the current token count (deployed ERC20)", async () => {
    assert((await factoryERC721.getCurrentTokenCount()) == 2);
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



  it("#startMultipleTokenOrder - user should succeed to call startOrder on a ERC20 without publishFee", async () => {
    
    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceIndex = 1; // dummy index
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
    const providerFeeAddress = user3.address; // marketplace fee Collector
    const providerFeeToken = mockErc20.address; 
    const providerFeeAmount = "0"
    //sign provider data
    const providerData=JSON.stringify({ "timeout":0 })
    const providerValidUntil = 0;
    const message = ethers.utils.solidityKeccak256(
      ["bytes", "address", "address", "uint256", "uint256"],
      [
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
        providerFeeAddress,
        providerFeeToken,
        providerFeeAmount,
        providerValidUntil
      ]
    );
    const signedMessage = await signMessage(message, providerFeeAddress);
    await erc20Token
      .connect(user2)
      .approve(factoryERC721.address, web3.utils.toWei(dtAmount));
    const tx = await factoryERC721
      .connect(user2)
      .startMultipleTokenOrder(
        [{
          "tokenAddress":erc20Token.address,
          "consumer":consumer,
          "amount":dtAmount,
          "serviceIndex":serviceIndex,
          "_providerFee": {
            providerFeeAddress: providerFeeAddress,
            providerFeeToken:providerFeeToken,
            providerFeeAmount:providerFeeAmount,
            v:signedMessage.v,
            r:signedMessage.r,
            s:signedMessage.s,
            providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
            validUntil:providerValidUntil
          },
          "_consumeMarketFee":  {
            consumeMarketFeeAddress: consumeMarketFeeAddress,
            consumeMarketFeeToken: consumeMarketFeeToken,
            consumeMarketFeeAmount: consumeMarketFeeAmount,
          }
        }]
      );
      const txReceipt = await tx.wait();
      
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9"), 'Invalid user balance, DT was not substracted'
    );

    assert(
      (await erc20Token.balanceOf(opcCollector.address)) ==
        web3.utils.toWei("0.03"), 'Invalid OPF balance, we should get 0.03 DTs'
    );
    assert(
      (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getPaymentCollector())) ==
        web3.utils.toWei("0.97"), 'Invalid publisher reward, we should have 0.97 DT'
    );
  });

  it("#startMultipleTokenOrder - user should succeed to call startOrder on a ERC20 without publishFee", async () => {
    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceIndex = 1; // dummy index
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
    const providerFeeAddress = user3.address; // marketplace fee Collector
    const providerFeeToken = mockErc20.address; 
    const providerFeeAmount = "0"
    //sign provider data
    const providerData=JSON.stringify({ "timeout":0 })
    const providerValidUntil = 0;
    const message = ethers.utils.solidityKeccak256(
      ["bytes", "address", "address", "uint256", "uint256"],
      [
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
        providerFeeAddress,
        providerFeeToken,
        providerFeeAmount,
        providerValidUntil
      ]
    );
    const signedMessage = await signMessage(message, providerFeeAddress);
    await erc20Token
    .connect(user2)
    .approve(factoryERC721.address, dtAmount);
    const tx = await factoryERC721
      .connect(user2)
      .startMultipleTokenOrder(
        [{
          "tokenAddress":erc20Token.address,
          "consumer":consumer,
          "amount":dtAmount,
          "serviceIndex":serviceIndex,
          "_providerFee": {
            providerFeeAddress: providerFeeAddress,
            providerFeeToken:providerFeeToken,
            providerFeeAmount:providerFeeAmount,
            v:signedMessage.v,
            r:signedMessage.r,
            s:signedMessage.s,
            providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
            validUntil:providerValidUntil
          },
          "_consumeMarketFee":  {
            consumeMarketFeeAddress: consumeMarketFeeAddress,
            consumeMarketFeeToken: consumeMarketFeeToken,
            consumeMarketFeeAmount: consumeMarketFeeAmount,
          }
        }]
      );
    const txReceipt = await tx.wait();
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9"), 'Invalid user balance, DT was not substracted'
    );

    assert(
      (await erc20Token.balanceOf(opcCollector.address)) ==
        web3.utils.toWei("0.03"), 'Invalid OPF balance, we should get 0.03 DTs'
    );
    assert(
      (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getPaymentCollector())) ==
        web3.utils.toWei("0.97"), 'Invalid publisher reward, we should have 0.97 DT'
    );
  });

  it("#startMultipleTokenOrder - user should succeed to call startOrder on a ERC20 without publishFee", async () => {
   
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceIndex = 1; // dummy index
    const providerFeeAddress = user3.address; // marketplace fee Collector
    const providerFeeToken = mockErc20.address; 
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,

    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    
    await erc20Token
      .connect(user2)
      .approve(factoryERC721.address, dtAmount);
    const providerFeeAmount = "0"
    //sign provider data
    const providerData=JSON.stringify({ "timeout":0 })
    const providerValidUntil = 0;
    const message = ethers.utils.solidityKeccak256(
      ["bytes", "address", "address", "uint256", "uint256"],
      [
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
        providerFeeAddress,
        providerFeeToken,
        providerFeeAmount,
        providerValidUntil
      ]
    );
    const signedMessage = await signMessage(message, providerFeeAddress);
    const tx = await factoryERC721
    .connect(user2)
    .startMultipleTokenOrder(
      [{
        "tokenAddress":erc20Token.address,
        "consumer":consumer,
        "amount":dtAmount,
        "serviceIndex":serviceIndex,
        "_providerFee": {
          providerFeeAddress: providerFeeAddress,
          providerFeeToken:providerFeeToken,
          providerFeeAmount:providerFeeAmount,
          v:signedMessage.v,
          r:signedMessage.r,
          s:signedMessage.s,
          providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
          validUntil:providerValidUntil
        },
        "_consumeMarketFee":  {
          consumeMarketFeeAddress: consumeMarketFeeAddress,
          consumeMarketFeeToken: consumeMarketFeeToken,
          consumeMarketFeeAmount: consumeMarketFeeAmount,
        }
      }]
      );
    const txReceipt = await tx.wait();
    
    
   
    
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9")
    );

    
    assert(
      (await erc20Token.balanceOf(await erc20Token.getPaymentCollector())) ==
        web3.utils.toWei("0.97"), 'Invalid publisher reward, he should get 0.97 DT'
    );
  });

  //////////
  it("#startMultipleTokenOrder - user should succeed to call startOrder on a ERC20 with 5 USDC publishFee", async () => {
    
    //MINT SOME DT20 to USER2 so he can start order
    await erc20TokenWithPublishFee.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceIndex = 1; // dummy index
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
    const providerFeeAddress = user3.address; // marketplace fee Collector
    const providerFeeToken = mockErc20.address; 
    const providerFeeAmount = "0"
    const publishFee = await erc20TokenWithPublishFee
     .connect(user2)
     .getPublishingMarketFee();
    // GET SOME consumeFeeToken
    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      publishFee[1]
    );
    await Mock20DecimalContract
      .connect(owner)
      .transfer(user2.address, publishFee[2]);
    
    // we approve the erc20Token contract to pull feeAmount
    await Mock20DecimalContract
      .connect(user2)
      .approve(factoryERC721.address, publishFee[2]);
    
    await erc20TokenWithPublishFee
      .connect(user2)
      .approve(factoryERC721.address, dtAmount);

    //sign provider data
    const providerData=JSON.stringify({ "timeout":0 })
    const providerValidUntil = 0;
    const message = ethers.utils.solidityKeccak256(
      ["bytes", "address", "address", "uint256", "uint256"],
      [
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
        providerFeeAddress,
        providerFeeToken,
        providerFeeAmount,
        providerValidUntil
      ]
    );
    const signedMessage = await signMessage(message, providerFeeAddress);
    
    const tx = await factoryERC721
      .connect(user2)
      .startMultipleTokenOrder(
        [{
          "tokenAddress":erc20TokenWithPublishFee.address,
          "consumer":consumer,
          "serviceIndex":serviceIndex,
          "_providerFee": {
            providerFeeAddress: providerFeeAddress,
            providerFeeToken:providerFeeToken,
            providerFeeAmount:providerFeeAmount,
            v:signedMessage.v,
            r:signedMessage.r,
            s:signedMessage.s,
            providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
            validUntil:providerValidUntil
          },
          "_consumeMarketFee":  {
            consumeMarketFeeAddress: consumeMarketFeeAddress,
            consumeMarketFeeToken: consumeMarketFeeToken,
            consumeMarketFeeAmount: consumeMarketFeeAmount,
          }
        }]
      );
    const txReceipt = await tx.wait();
    
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("9"), 'Invalid user balance, DT was not substracted'
    );

    assert(
      (await erc20TokenWithPublishFee.balanceOf(opcCollector.address)) ==
        web3.utils.toWei("0.03"), 'Invalid OPF balance, we should get 0.03 DTs'
    );
    
    assert(
      (await erc20TokenWithPublishFee.balanceOf(await erc20TokenWithPublishFee.getPaymentCollector())) ==
        web3.utils.toWei("0.97"), 'Invalid publisher reward, we should have 0.97 DT'
    );
  });

  it("#startMultipleTokenOrder - user should succeed to call startOrder on a ERC20 with 5 mockErc20Decimal publishFee,", async () => {
    
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceIndex = 1; // dummy index
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
    const providerFeeAddress = user3.address; // marketplace fee Collector
    const providerFeeToken = mockErc20.address; 
    const providerFeeAmount = "0"
    const publishFee = await erc20TokenWithPublishFee
     .connect(user2)
     .getPublishingMarketFee();
    // GET SOME publishFeeToken
    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      publishFee[1]
    );
    await Mock20DecimalContract
      .connect(owner)
      .transfer(user2.address, publishFee[2]);
    
    // we approve the erc20Token contract to pull feeAmount
    await Mock20DecimalContract
      .connect(user2)
      .approve(factoryERC721.address, publishFee[2]);
  

    //MINT SOME DT20 to USER2 so he can start order
    await erc20TokenWithPublishFee.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    
    await erc20TokenWithPublishFee
      .connect(user2)
      .approve(factoryERC721.address, dtAmount);
    
    //sign provider data
    const providerData=JSON.stringify({ "timeout":0 })
    const providerValidUntil = 0;
    const message = ethers.utils.solidityKeccak256(
      ["bytes", "address", "address", "uint256", "uint256"],
      [
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
        providerFeeAddress,
        providerFeeToken,
        providerFeeAmount,
        providerValidUntil
      ]
    );

    const signedMessage = await signMessage(message, providerFeeAddress);
    const tx = await factoryERC721
      .connect(user2)
      .startMultipleTokenOrder(
        [{
          "tokenAddress":erc20TokenWithPublishFee.address,
          "consumer":consumer,
          "serviceIndex":serviceIndex,
          "_providerFee": {
            providerFeeAddress: providerFeeAddress,
            providerFeeToken:providerFeeToken,
            providerFeeAmount:providerFeeAmount,
            v:signedMessage.v,
            r:signedMessage.r,
            s:signedMessage.s,
            providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
            validUntil:providerValidUntil
          },
          "_consumeMarketFee":  {
            consumeMarketFeeAddress: consumeMarketFeeAddress,
            consumeMarketFeeToken: consumeMarketFeeToken,
            consumeMarketFeeAmount: consumeMarketFeeAmount,
          }
        }]
      );
    const txReceipt = await tx.wait();
    
 

    const balancePublish = await Mock20DecimalContract.balanceOf(publishFee[0])
    const balanceOpfPublish = await Mock20DecimalContract.balanceOf(opcCollector.address)
    const expectedPublish = new BN(publishFee[2].toString())
    const expectedOpfPublish = new BN(publishFee[2].toString()).div(new BN(100))
    
    assert(balancePublish.toString() === expectedPublish.toString(),'Invalid publish Fee')
    
    
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("9")
    );

    assert(
      (await erc20TokenWithPublishFee.balanceOf(opcCollector.address)) ==
        web3.utils.toWei("0.03"), 'Invalid OPF balance, we should get 0.03 DTs'
    );
    assert(
      (await erc20TokenWithPublishFee.balanceOf(await erc20TokenWithPublishFee.getPaymentCollector())) ==
        web3.utils.toWei("0.97"), 'Invalid publisher reward, he should get 0.97 DT'
    );
  });

  it("#startMultipleTokenOrder - user should succeed to call startMultipleTokenOrder on an ERC20 without publishFee, and an ERC20 with 5 mockErc20Decimal publishFee,", async () => {
  
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceIndex = 1; // dummy index
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
    const providerFeeAddress = user3.address; // marketplace fee Collector
    const providerFeeToken = mockErc20.address; 
   
    const publishFee = await erc20TokenWithPublishFee
     .connect(user2)
     .getPublishingMarketFee();
    // GET SOME publishFeeToken 
    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      publishFee[1]
    );
    await Mock20DecimalContract
      .connect(owner)
      .transfer(user2.address, publishFee[2]);
    
    // we approve the erc20Token contract to pull feeAmount
    await Mock20DecimalContract
      .connect(user2)
      .approve(factoryERC721.address, publishFee[2]);
    
    

    //MINT SOME DT20 to USER2 so he can start order
    await erc20TokenWithPublishFee.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    
    await erc20TokenWithPublishFee
      .connect(user2)
      .approve(factoryERC721.address, dtAmount);
    await erc20Token
      .connect(user2)
      .approve(factoryERC721.address, dtAmount);
    //sign provider data
    const providerData=JSON.stringify({ "timeout":0 })
    const providerFeeAmount = "0"
    const providerValidUntil = 0;
    const message = ethers.utils.solidityKeccak256(
      ["bytes", "address", "address", "uint256", "uint256"],
      [
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
        providerFeeAddress,
        providerFeeToken,
        providerFeeAmount,
        providerValidUntil
      ]
    );

    const signedMessage = await signMessage(message, providerFeeAddress);
    const tx = await factoryERC721
      .connect(user2)
      .startMultipleTokenOrder(
        [{
          "tokenAddress":erc20TokenWithPublishFee.address,
          "consumer":consumer,
          "serviceIndex":serviceIndex,
          "_providerFee": {
            providerFeeAddress: providerFeeAddress,
            providerFeeToken:providerFeeToken,
            providerFeeAmount:providerFeeAmount,
            v:signedMessage.v,
            r:signedMessage.r,
            s:signedMessage.s,
            providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
            validUntil:providerValidUntil
          },
          "_consumeMarketFee":  {
            consumeMarketFeeAddress: consumeMarketFeeAddress,
            consumeMarketFeeToken: consumeMarketFeeToken,
            consumeMarketFeeAmount: consumeMarketFeeAmount,
          }
        },
        {
          "tokenAddress":erc20Token.address,
          "consumer":consumer,
          "serviceIndex":serviceIndex,
          "_providerFee": {
            providerFeeAddress: providerFeeAddress,
            providerFeeToken:providerFeeToken,
            providerFeeAmount:providerFeeAmount,
            v:signedMessage.v,
            r:signedMessage.r,
            s:signedMessage.s,
            providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
            validUntil:providerValidUntil
          },
          "_consumeMarketFee":  {
            consumeMarketFeeAddress: consumeMarketFeeAddress,
            consumeMarketFeeToken: consumeMarketFeeToken,
            consumeMarketFeeAmount: consumeMarketFeeAmount,
          }
        }]
      );
    const txReceipt = await tx.wait();
 
   
    
    
    const balancePublish = await Mock20DecimalContract.balanceOf(publishFee[0])
    const balanceOpfPublish = await Mock20DecimalContract.balanceOf(opcCollector.address)
    const expectedPublish = new BN(publishFee[2].toString())
    const expectedOpfPublish = new BN(publishFee[2].toString()).div(new BN(100))
    assert(balancePublish.toString() === expectedPublish.toString(),'Invalid publish Fee')
    
    
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("9")
    );
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9")
    );

    assert(
      (await erc20Token.balanceOf(opcCollector.address)) ==
        web3.utils.toWei("0.03"), 'Invalid OPF balance, we should get 0.03 DTs'
    );
    assert(
      (await erc20TokenWithPublishFee.balanceOf(opcCollector.address)) ==
        web3.utils.toWei("0.03"), 'Invalid OPF balance, we should get 0.03 DTs'
    );
    assert(
      (await erc20TokenWithPublishFee.balanceOf(await erc20TokenWithPublishFee.getPaymentCollector())) ==
        web3.utils.toWei("0.97"), 'Invalid publisher reward, he should get 0.97 DT'
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getPaymentCollector())) ==
        web3.utils.toWei("0.97"), 'Invalid publisher reward, he should get 0.97 DT'
    );
  });
 

  it("#createNftWithErc20 - should create a new erc721 and new erc20 in one single call and get their addresses", async () => {    
    const tx = await factoryERC721.createNftWithErc20(
      {
      "name": "72120Bundle",
      "symbol": "72Bundle",
      "templateIndex": 1,
      "tokenURI":"https://oceanprotocol.com/nft/",
      "transferable": true,
      "owner": owner.address
      },
      {
      "strings":["ERC20B1","ERC20DT1Symbol"],
      "templateIndex":1,
      "addresses":[user3.address,user6.address,user3.address,"0x0000000000000000000000000000000000000000"],
      "uints":[cap,0],
      "bytess":[]
      });

    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt,'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
    nftAddress = event.args[0];
    event = getEventFromTx(txReceipt,'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    erc20Address = event.args[0];
    
    const NftContract = await ethers.getContractAt(
      "contracts/interfaces/IERC721Template.sol:IERC721Template",
      nftAddress
    );
    assert(await NftContract.name() === "72120Bundle");
    const Erc20ontract = await ethers.getContractAt(
      "contracts/interfaces/IERC20Template.sol:IERC20Template",
      erc20Address
    );
    assert(await Erc20ontract.name() === "ERC20B1");
  });


  it("#createNftWithErc20WithFixedRate - should create a new erc721 and new erc20 and a FixedRate in one single call and get their addresses/exchangeId", async () => {    
    const marketFee = 1e15;
    const rate = web3.utils.toWei("1");
    const tx = await factoryERC721.createNftWithErc20WithFixedRate(
      {
      "name": "72120PBundle",
      "symbol": "72PBundle",
      "templateIndex": 1, 
      "tokenURI":"https://oceanprotocol.com/nft/",
      "transferable": true,
      "owner": owner.address
      },
      {
      "strings":["ERC20WithPool","ERC20P"],
      "templateIndex":1,
      "addresses":[user3.address,user6.address,user3.address,"0x0000000000000000000000000000000000000000"],
      "uints":[cap,0],
      "bytess":[]
      },
      {

        "fixedPriceAddress":fixedRateExchange.address,
        "addresses":[erc20TokenWithPublishFee.address,user3.address,user6.address, ZERO_ADDRESS],
        "uints":[18,18,rate,marketFee,0, 0]
       
      }
      );

    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt,'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
    const nftAddress = event.args[0];
    event = getEventFromTx(txReceipt,'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    const erc20Address = event.args[0];

    event = getEventFromTx(txReceipt,'NewFixedRate')
    assert(event, "Cannot find NewFixedRate event")
    const exchangeId = event.args[0];

    const NftContract = await ethers.getContractAt(
      "contracts/interfaces/IERC721Template.sol:IERC721Template",
      nftAddress
    );
    assert(await NftContract.name() === "72120PBundle");
    const Erc20ontract = await ethers.getContractAt(
      "contracts/interfaces/IERC20Template.sol:IERC20Template",
      erc20Address
    );
    assert(await Erc20ontract.name() === "ERC20WithPool");

    
  });

  it("#createNftWithErc20WithDispenser - should create a new erc721 and new erc20 and a Dispenser in one single call and get their addresses", async () => {    
    const marketFee = 1e15;
    const rate = web3.utils.toWei("1");
    const tx = await factoryERC721.createNftWithErc20WithDispenser(
      {
      "name": "72120PBundle",
      "symbol": "72PBundle",
      "templateIndex": 1, 
      "tokenURI":"https://oceanprotocol.com/nft/",
      "transferable": true,
      "owner": owner.address
      },
      {
      "strings":["ERC20WithPool","ERC20P"],
      "templateIndex":1,
      "addresses":[user3.address,user6.address,user3.address,ZERO_ADDRESS],
      "uints":[cap,0],
      "bytess":[]
      },
      {
        "dispenserAddress":dispenser.address,
        "maxTokens":web3.utils.toWei("1"),
        "maxBalance":web3.utils.toWei("1"),
        "withMint":true,
        "allowedSwapper": ZERO_ADDRESS
      }
      );

    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt,'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
    const nftAddress = event.args[0];
    event = getEventFromTx(txReceipt,'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    const erc20Address = event.args[0];

    event = getEventFromTx(txReceipt,'DispenserCreated')
    assert(event, "Cannot find DispenserCreated event")
    const dispenserToken = event.args[0];

    const NftContract = await ethers.getContractAt(
      "contracts/interfaces/IERC721Template.sol:IERC721Template",
      nftAddress
    );
    assert(await NftContract.name() === "72120PBundle");
    const Erc20ontract = await ethers.getContractAt(
      "contracts/interfaces/IERC20Template.sol:IERC20Template",
      erc20Address
    );
    assert(await Erc20ontract.name() === "ERC20WithPool");

    const dispenserStatus = await dispenser.status(erc20Address)
    assert(dispenserStatus.active==true)
    assert(dispenserToken === erc20Address)
    
  });

  it("#createNftWithMetaData - should create a new erc721 with metadata in one single call and get address", async () => {    
    const marketFee = 1e15;
    const rate = web3.utils.toWei("1");
    const data = web3.utils.asciiToHex('my cool metadata');
    const dataHash = sha256(data);
    const metaDataDecryptorUrl = 'http://myprovider:8030';
    const tx = await factoryERC721.createNftWithMetaData(
      {
      "name": "72120PBundle",
      "symbol": "72PBundle",
      "templateIndex": 1, 
      "tokenURI":"https://oceanprotocol.com/nft/",
      "transferable": true,
      "owner": owner.address
      },
      {
        "_metaDataState": 1,
        "_metaDataDecryptorUrl": metaDataDecryptorUrl,
        "_metaDataDecryptorAddress": '0x123',
        "flags":0,
        "data": data,
        "_metaDataHash": dataHash,
        "_metadataProofs": []
      }
      );

    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt,'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
    const nftAddress = event.args[0];
    
    

    const tokenERC721 = await ethers.getContractAt(
      "contracts/interfaces/IERC721Template.sol:IERC721Template",
      nftAddress
    );
    assert(await tokenERC721.name() === "72120PBundle");
    metadataInfo = await tokenERC721.getMetaData()
    assert(metadataInfo[3] === true)
    assert(metadataInfo[0] == metaDataDecryptorUrl);
  });
});