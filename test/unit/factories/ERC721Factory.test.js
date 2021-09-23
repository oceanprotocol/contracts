/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent, BN } = require("@openzeppelin/test-helpers");
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
    mockErc20,
    mockErc20Decimals,
    erc20Token,
    erc20Address,
    erc20TokenWithPublishFee,
    erc20AddressWithPublishFee,
    publishMarketFeeAddress
    cap = web3.utils.toWei("100000");

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  const oceanAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
  const publishMarketFeeAmount = "5";
  const addressZero = '0x0000000000000000000000000000000000000000';

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
    const MockErc20 = await ethers.getContractFactory('MockERC20');
    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
    const Metadata = await ethers.getContractFactory("Metadata");
    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("ssFixedRate");
    const BPool = await ethers.getContractFactory("BPool");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );


    [owner, reciever, user2, user3,user4, user5, user6, provider, opfCollector, marketFeeCollector, publishMarketAccount] = await ethers.getSigners();
    publishMarketFeeAddress = publishMarketAccount.address
    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);

    mockErc20 = await MockErc20.deploy(owner.address,"MockERC20",'MockERC20');
    mockErc20Decimals = await MockErc20Decimals.deploy("Mock6Digits",'Mock6Digits',6);
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
    const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1","ERC20DT1Symbol"],
      [user3.address,user6.address, user3.address,'0x0000000000000000000000000000000000000000'],
      [cap,0],
      []
    );
    const trxReceiptERC20 = await trxERC20.wait();
    erc20Address = trxReceiptERC20.events[3].args.erc20Address;

    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
    assert((await erc20Token.permissions(user3.address)).minter == true);

    //deploy a erc20 with publishFees as well
    const trxERC20WithPublishFee = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1P","ERC20DT1SymbolP"],
      [user3.address,user6.address, publishMarketFeeAddress,mockErc20Decimals.address],
      [cap,web3.utils.toWei(publishMarketFeeAmount)],
      []
    );
    const trxReceiptERC20WithPublishFee = await trxERC20WithPublishFee.wait();
    erc20AddressWithPublishFee = trxReceiptERC20WithPublishFee.events[3].args.erc20Address;
    erc20TokenWithPublishFee = await ethers.getContractAt("ERC20Template", erc20AddressWithPublishFee);
    assert((await erc20TokenWithPublishFee.permissions(user3.address)).minter == true);
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



  it("#startMultipleTokenOrder - user should succeed to call startOrder on a ERC20 without publishFees, consumeFeeAmount on top is ZERO", async () => {
    
    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceId = 1; // dummy index
    const consumeFeeAddress = user3.address; // marketplace fee Collector
    const consumeFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeFeeToken = mockErc20.address; // token address for the feeAmount, in this case DAI
    
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
          "serviceId":serviceId,
          "consumeFeeAddress":consumeFeeAddress,
          "consumeFeeToken":consumeFeeToken,
          "consumeFeeAmount":web3.utils.toWei(String(consumeFeeAmount))
        }]
      );
      const txReceipt = await tx.wait();
      
      //erc20Address = trxReceiptERC20.events[3].args.erc20Address;
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9"), 'Invalid user balance, DT was not substracted'
    );

    assert(
      (await erc20Token.balanceOf(opfCollector.address)) ==
        web3.utils.toWei("0"), 'Invalid OPF balance, we should not get any DTs'
    );
    assert(
      (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getFeeCollector())) ==
        web3.utils.toWei("1"), 'Invalid publisher reward, we should have 1 DT'
    );
  });

  it("#startMultipleTokenOrder - user should succeed to call startOrder on a ERC20 without publishFees, consumeFeeToken on top is ZERO", async () => {
    
    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceId = 1; // dummy index
    const consumeFeeAddress = user3.address; // marketplace fee Collector
    const consumeFeeAmount = 1; // fee to be collected on top, requires approval
    const consumeFeeToken = addressZero; // token address for the feeAmount, in this case DAI
    
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
          "serviceId":serviceId,
          "consumeFeeAddress":consumeFeeAddress,
          "consumeFeeToken":consumeFeeToken,
          "consumeFeeAmount":web3.utils.toWei(String(consumeFeeAmount))
        }]
      );
    const txReceipt = await tx.wait();
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9"), 'Invalid user balance, DT was not substracted'
    );

    assert(
      (await erc20Token.balanceOf(opfCollector.address)) ==
        web3.utils.toWei("0"), 'Invalid OPF balance, we should not get any DTs'
    );
    assert(
      (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getFeeCollector())) ==
        web3.utils.toWei("1"), 'Invalid publisher reward, we should have 1 DT'
    );
  });

  it("#startMultipleTokenOrder - user should succeed to call startOrder on a ERC20 without publishFees, consumeFee on top is 3 MockERC20", async () => {
    const consumeFeeToken = mockErc20.address; // token address for the feeAmount, in this case mockErc20
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceId = 1; // dummy index
    const consumeFeeAddress = user3.address; // marketplace fee Collector
    const consumeFeeAmount = "3"; // fee to be collected on top, requires approval
    // GET SOME consumeFeeToken
    const Mock20Contract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      mockErc20.address
    );
    await Mock20Contract
      .connect(owner)
      .transfer(user2.address, ethers.utils.parseEther(consumeFeeAmount));
    
    // we approve the erc20Token contract to pull feeAmount (3 DAI)

    await Mock20Contract
      .connect(user2)
      .approve(factoryERC721.address, web3.utils.toWei(consumeFeeAmount));

    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    
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
        "serviceId":serviceId,
        "consumeFeeAddress":consumeFeeAddress,
        "consumeFeeToken":consumeFeeToken,
        "consumeFeeAmount":web3.utils.toWei(String(consumeFeeAmount))
      }]
      );
    const txReceipt = await tx.wait();
    
    const balance = await Mock20Contract.balanceOf(consumeFeeAddress)
    const balanceOpf = await Mock20Contract.balanceOf(opfCollector.address)
    const expected = web3.utils.toWei(new BN(consumeFeeAmount)).sub(web3.utils.toWei(new BN(consumeFeeAmount)).div(new BN(100)))
    const expectedOpf = web3.utils.toWei(new BN(consumeFeeAmount)).div(new BN(100))
    console.log(balance.toString()+" vs "+ expected.toString())
    assert(balance.toString() === expected.toString(),'Invalid consume Fee')
    
    
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9")
    );

    assert(
      balanceOpf.toString() == expectedOpf.toString(), 'Invalid OPF fee, we should have 1% of the fee'
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getFeeCollector())) ==
        web3.utils.toWei("1"), 'Invalid publisher reward, he should get 1 DT'
    );
  });

  //////////
  it("#startMultipleTokenOrder - user should succeed to call startOrder on a ERC20 with 5 USDC publishFees, consumeFee on top is ZERO", async () => {
    
    //MINT SOME DT20 to USER2 so he can start order
    await erc20TokenWithPublishFee.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceId = 1; // dummy index
    const consumeFeeAddress = user3.address; // marketplace fee Collector
    const consumeFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeFeeToken = "0x6b175474e89094c44da98b954eedeac495271d0f"; // token address for the feeAmount, in this case DAI
    const publishFees = await erc20TokenWithPublishFee
     .connect(user2)
     .getPublishingMarketFee();
    // GET SOME consumeFeeToken
    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      publishFees[1]
    );
    await Mock20DecimalContract
      .connect(owner)
      .transfer(user2.address, publishFees[2]);
    
    // we approve the erc20Token contract to pull feeAmount
    await Mock20DecimalContract
      .connect(user2)
      .approve(factoryERC721.address, publishFees[2]);
    
    await erc20TokenWithPublishFee
      .connect(user2)
      .approve(factoryERC721.address, dtAmount);
    const tx = await factoryERC721
      .connect(user2)
      .startMultipleTokenOrder(
        [{
          "tokenAddress":erc20TokenWithPublishFee.address,
          "consumer":consumer,
          "amount":dtAmount,
          "serviceId":serviceId,
          "consumeFeeAddress":consumeFeeAddress,
          "consumeFeeToken":consumeFeeToken,
          "consumeFeeAmount":web3.utils.toWei(String(consumeFeeAmount))
        }]
      );
    const txReceipt = await tx.wait();
    
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("9"), 'Invalid user balance, DT was not substracted'
    );

    assert(
      (await erc20TokenWithPublishFee.balanceOf(opfCollector.address)) ==
        web3.utils.toWei("0"), 'Invalid OPF balance, we should not get any DTs'
    );
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
    );
    assert(
      (await erc20TokenWithPublishFee.balanceOf(await erc20TokenWithPublishFee.getFeeCollector())) ==
        web3.utils.toWei("1"), 'Invalid publisher reward, we should have 1 DT'
    );
  });

  it("#startMultipleTokenOrder - user should succeed to call startOrder on a ERC20 with 5 mockErc20Decimal publishFees, consumeFee on top is 3 mockErc20", async () => {
    const consumeFeeToken = mockErc20.address; // token address for the feeAmount, in this case mockErc20
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceId = 1; // dummy index
    const consumeFeeAddress = user3.address; // marketplace fee Collector
    const consumeFeeAmount = "3"; // fee to be collected on top, requires approval
    const publishFees = await erc20TokenWithPublishFee
     .connect(user2)
     .getPublishingMarketFee();
    // GET SOME consumeFeeToken
    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      publishFees[1]
    );
    await Mock20DecimalContract
      .connect(owner)
      .transfer(user2.address, publishFees[2]);
    
    // we approve the erc20Token contract to pull feeAmount
    await Mock20DecimalContract
      .connect(user2)
      .approve(factoryERC721.address, publishFees[2]);
    
      // GET SOME consumeFeeToken
    const Mock20Contract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      mockErc20.address
    );
    await Mock20Contract
      .connect(owner)
      .transfer(user2.address, ethers.utils.parseEther(consumeFeeAmount));
    
    // we approve the erc20Token contract to pull feeAmount (3 DAI)

    await Mock20Contract
      .connect(user2)
      .approve(factoryERC721.address, web3.utils.toWei(consumeFeeAmount));

    //MINT SOME DT20 to USER2 so he can start order
    await erc20TokenWithPublishFee.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    
    await erc20TokenWithPublishFee
      .connect(user2)
      .approve(factoryERC721.address, dtAmount);

    const tx = await factoryERC721
      .connect(user2)
      .startMultipleTokenOrder(
        [{
          "tokenAddress":erc20TokenWithPublishFee.address,
          "consumer":consumer,
          "amount":dtAmount,
          "serviceId":serviceId,
          "consumeFeeAddress":consumeFeeAddress,
          "consumeFeeToken":consumeFeeToken,
          "consumeFeeAmount":web3.utils.toWei(String(consumeFeeAmount))
        }]
      );
    const txReceipt = await tx.wait();
    
    const balanceConsume = await Mock20Contract.balanceOf(consumeFeeAddress)
    const balanceOpfConsume = await Mock20Contract.balanceOf(opfCollector.address)
    const expectedConsume = web3.utils.toWei(new BN(consumeFeeAmount)).sub(web3.utils.toWei(new BN(consumeFeeAmount)).div(new BN(100)))
    const expectedOpfConsume = web3.utils.toWei(new BN(consumeFeeAmount)).div(new BN(100))

    const balancePublish = await Mock20DecimalContract.balanceOf(publishFees[0])
    const balanceOpfPublish = await Mock20DecimalContract.balanceOf(opfCollector.address)
    const expectedPublish = new BN(publishFees[2].toString()).sub(new BN(publishFees[2].toString()).div(new BN(100)))
    const expectedOpfPublish = new BN(publishFees[2].toString()).div(new BN(100))
    console.log(balanceConsume.toString()+" vs "+ expectedConsume.toString())
    assert(balanceConsume.toString() === expectedConsume.toString(),'Invalid consume Fee')
    console.log(balancePublish.toString()+" vs "+ expectedPublish.toString())
    assert(balancePublish.toString() === expectedPublish.toString(),'Invalid publish Fee')
    
    
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("9")
    );

    assert(
      balanceOpfConsume.toString() == expectedOpfConsume.toString(), 'Invalid OPF fee, we should have 1% of the fee'
    );
    assert(
      balanceOpfPublish.toString() == expectedOpfPublish.toString(), 'Invalid OPF fee, we should have 1% of the publish fee'
    );
    assert(
      (await erc20TokenWithPublishFee.balanceOf(await erc20TokenWithPublishFee.getFeeCollector())) ==
        web3.utils.toWei("1"), 'Invalid publisher reward, he should get 1 DT'
    );
  });

  it("#startMultipleTokenOrder - user should succeed to call startMultipleTokenOrder on an ERC20 without publishFees,consumeFee on top is 4 mockErc20 and an ERC20 with 5 mockErc20Decimal publishFees, consumeFee on top is 3 mockErc20", async () => {
    const consumeFeeToken = mockErc20.address; // token address for the feeAmount, in this case mockErc20
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceId = 1; // dummy index
    const consumeFeeAddress = user3.address; // marketplace fee Collector
    const consumeFeeAmount1 = "4"; // fee to be collected on top, requires approval
    const consumeFeeAmount2 = "3"; // fee to be collected on top, requires approval
    const totalConsumeFee = String(parseInt(consumeFeeAmount1)+parseInt(consumeFeeAmount2))
    const publishFees = await erc20TokenWithPublishFee
     .connect(user2)
     .getPublishingMarketFee();
    // GET SOME consumeFeeToken
    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      publishFees[1]
    );
    await Mock20DecimalContract
      .connect(owner)
      .transfer(user2.address, publishFees[2]);
    
    // we approve the erc20Token contract to pull feeAmount
    await Mock20DecimalContract
      .connect(user2)
      .approve(factoryERC721.address, publishFees[2]);
    
    // GET SOME consumeFeeToken
    const Mock20Contract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      mockErc20.address
    );
    await Mock20Contract
      .connect(owner)
      .transfer(user2.address, ethers.utils.parseEther(totalConsumeFee));
    
    // we approve the erc20Token contract to pull feeAmount (3 DAI)

    await Mock20Contract
      .connect(user2)
      .approve(factoryERC721.address, web3.utils.toWei(totalConsumeFee));

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

    const tx = await factoryERC721
      .connect(user2)
      .startMultipleTokenOrder(
        [{
          "tokenAddress":erc20TokenWithPublishFee.address,
          "consumer":consumer,
          "amount":dtAmount,
          "serviceId":serviceId,
          "consumeFeeAddress":consumeFeeAddress,
          "consumeFeeToken":consumeFeeToken,
          "consumeFeeAmount":web3.utils.toWei(String(consumeFeeAmount1))
        },
        {
          "tokenAddress":erc20Token.address,
          "consumer":consumer,
          "amount":dtAmount,
          "serviceId":serviceId,
          "consumeFeeAddress":consumeFeeAddress,
          "consumeFeeToken":consumeFeeToken,
          "consumeFeeAmount":web3.utils.toWei(String(consumeFeeAmount2))
        }]
      );
    const txReceipt = await tx.wait();
    const balanceConsume = await Mock20Contract.balanceOf(consumeFeeAddress)
    const balanceOpfConsume = await Mock20Contract.balanceOf(opfCollector.address)
    const expectedConsume = web3.utils.toWei(new BN(totalConsumeFee)).sub(web3.utils.toWei(new BN(totalConsumeFee)).div(new BN(100)))
    const expectedOpfConsume = web3.utils.toWei(new BN(totalConsumeFee)).div(new BN(100))
    assert(balanceConsume.toString() === expectedConsume.toString(),'Invalid consume Fee')
    
    const balancePublish = await Mock20DecimalContract.balanceOf(publishFees[0])
    const balanceOpfPublish = await Mock20DecimalContract.balanceOf(opfCollector.address)
    const expectedPublish = new BN(publishFees[2].toString()).sub(new BN(publishFees[2].toString()).div(new BN(100)))
    const expectedOpfPublish = new BN(publishFees[2].toString()).div(new BN(100))
    assert(balancePublish.toString() === expectedPublish.toString(),'Invalid publish Fee')
    
    
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("9")
    );
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9")
    );

    assert(
      balanceOpfConsume.toString() == expectedOpfConsume.toString(), 'Invalid OPF fee, we should have 1% of the fee'
    );
    assert(
      balanceOpfPublish.toString() == expectedOpfPublish.toString(), 'Invalid OPF fee, we should have 1% of the publish fee'
    );
    assert(
      (await erc20TokenWithPublishFee.balanceOf(await erc20TokenWithPublishFee.getFeeCollector())) ==
        web3.utils.toWei("1"), 'Invalid publisher reward, he should get 1 DT'
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getFeeCollector())) ==
        web3.utils.toWei("1"), 'Invalid publisher reward, he should get 1 DT'
    );
  });
 
});
