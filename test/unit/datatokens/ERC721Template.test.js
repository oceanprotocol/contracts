/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const {getEventFromTx} = require("../../helpers/utils")
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
    newERC721Template,
    cap = web3.utils.toWei("100000");

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  const v3Datatoken = "0xa2B8b3aC4207CFCCbDe4Ac7fa40214fd00A2BA71"
  const v3DTOwner = "0x12BD31628075C20919BA838b89F414241b8c4869"
  const oceanAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
  const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
  const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  const metaDataDecryptorUrl = 'http://myprovider:8030';
  const metaDataDecryptorAddress = "0x123";
  const metaDataState = 1;

  const migrateFromV3 = async (v3DTOwner,v3Datatoken) => {
    // WE IMPERSONATE THE ACTUAL v3DT OWNER and create a new ERC721 Contract, from which we are going to wrap the v3 datatoken
    
    await impersonate(v3DTOwner)
    signer = ethers.provider.getSigner(v3DTOwner);
    const tx = await factoryERC721.connect(signer).deployERC721Contract(
      "NFT2",
      "NFTSYMBOL",
      1,
      "0x0000000000000000000000000000000000000000"
    );
    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt,'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
    tokenAddress = event.args[0];

    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);
    assert(await tokenERC721.v3DT(v3Datatoken) == false)
   
    // WE then have to Propose a new minter for the v3Datatoken
  
    v3DTContract = await ethers.getContractAt("IV3ERC20", v3Datatoken);
    await v3DTContract.connect(signer).proposeMinter(tokenAddress)
  
    // ONLY V3DTOwner can now call wrapV3DT() to transfer minter permission to the erc721Contract
    await tokenERC721.connect(signer).wrapV3DT(v3Datatoken,v3DTOwner)
    assert(await tokenERC721.v3DT(v3Datatoken) == true)
    assert((await tokenERC721.getPermissions(v3DTOwner)).v3Minter == true);
    
    return tokenERC721;
  }

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

    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("SideStaking");
    const BPool = await ethers.getContractFactory("BPool");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );


    [owner, reciever, user2, user3,user4, user5, user6, provider, opfCollector, marketFeeCollector] = await ethers.getSigners();

    data = web3.utils.asciiToHex(constants.blob[0]);
    dataHash = web3.utils.asciiToHex(constants.blob[0]);
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
      
   sideStaking = await SSContract.deploy(router.address);

   fixedRateExchange = await FixedRateExchange.deploy(
     router.address,
     opfCollector.address
   );
 
   templateERC20 = await ERC20Template.deploy();
 
 
 
   // SETUP ERC721 Factory with template
   templateERC721 = await ERC721Template.deploy();
   factoryERC721 = await ERC721Factory.deploy(
     templateERC721.address,
     templateERC20.address,
     opfCollector.address,
     router.address
   );
 
   // SET REQUIRED ADDRESS
 
   
   await router.addFactory(factoryERC721.address);
 
   await router.addFixedRateContract(fixedRateExchange.address); 

   await router.addSSContract(sideStaking.address); 

    // by default connect() in ethers goes with the first address (owner in this case)
    const tx = await factoryERC721.deployERC721Contract(
      "NFT",
      "NFTSYMBOL",
      1,
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/"
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
        factoryERC721.address,
        '0x0000000000000000000000000000000000000000',
        "https://oceanprotocol.com/nft/"
      ),
      "ERC721Template: token instance already initialized"
    );
  });

  it("#mint - should mint 1 ERC721 to owner", async () => {
  
    assert((await tokenERC721.balanceOf(owner.address)) == 1);
  });

  it("#tokenURI - should get proper tokenURI", async () => {
    assert((await tokenERC721.tokenURI(1)) == "https://oceanprotocol.com/nft/1");
  });
  

  it("#updateMetadata - should not be allowed to update the metadata if NOT in MetadataList", async () => {
    assert((await tokenERC721.getPermissions(user6.address)).updateMetadata == false)
    await expectRevert(
      tokenERC721.connect(user6).setMetaData(metaDataState, metaDataDecryptorUrl, metaDataDecryptorAddress, flags, data, dataHash),
      "ERC721Template: NOT METADATA_ROLE"
    );
  });

  it("#updateMetadata - should not be allowed to update the metadata state if NOT in MetadataList", async () => {
    assert((await tokenERC721.getPermissions(user6.address)).updateMetadata == false)
    await expectRevert(
      tokenERC721.connect(user6).setMetaDataState(metaDataState),
      "ERC721Template: NOT METADATA_ROLE"
    );
  });

  it("#updateMetadata - should create & update the metadata, after adding address to MetadataList", async () => {
    assert((await tokenERC721.getPermissions(user6.address)).updateMetadata == false)
    await tokenERC721.addToMetadataList(user6.address);
    let metadataInfo = await tokenERC721.getMetaData()
    assert(metadataInfo[3] === false)

    let tx = await tokenERC721.connect(user6).setMetaData(metaDataState, metaDataDecryptorUrl, metaDataDecryptorAddress, flags, data, dataHash);
    let txReceipt = await tx.wait();
   
    let event = getEventFromTx(txReceipt,'MetadataCreated')
    assert(event, "Cannot find MetadataCreated event")
    tokenAddress = event.args[0];
    assert(event.args[2] == metaDataDecryptorUrl);
    
    metadataInfo = await tokenERC721.getMetaData()
    assert(metadataInfo[3] === true)
    assert(metadataInfo[0] == metaDataDecryptorUrl);

    const metaDataDecryptorUrl2 = 'http://someurl';
    tx = await tokenERC721.connect(user6).setMetaData(metaDataState, metaDataDecryptorUrl2, metaDataDecryptorAddress, flags, data, dataHash);
    txReceipt = await tx.wait();
    event = getEventFromTx(txReceipt,'MetadataUpdated')
    assert(event, "Cannot find MetadataUpdated event")
    assert(event.args[2] == metaDataDecryptorUrl2);
    
    metadataInfo = await tokenERC721.getMetaData()
    assert(metadataInfo[3] === true)
    assert(metadataInfo[0] == metaDataDecryptorUrl2);

  });

  it("#updateMetadata - should be able to update metadata state", async () => {
    assert((await tokenERC721.getPermissions(user6.address)).updateMetadata == false)
    await tokenERC721.addToMetadataList(user6.address);
    let metadataInfo = await tokenERC721.getMetaData()
    assert(metadataInfo[3] === false)

    let tx = await tokenERC721.connect(user6).setMetaDataState(metaDataState);
    let txReceipt = await tx.wait();
   
    let event = getEventFromTx(txReceipt,'MetadataState')
    assert(event, "Cannot find MetadataState event")
    assert(event.args[1] == metaDataState);
    
    metadataInfo = await tokenERC721.getMetaData()
    assert(metadataInfo[2] === metaDataState)
    
  });

  it("#createERC20 - should not allow to create a new ERC20Token if NOT in CreateERC20List", async () => {
    assert((await tokenERC721.getPermissions(user6.address)).deployERC20 == false)
    await expectRevert(
      tokenERC721.connect(user6).createERC20(1,
        ["ERC20DT1","ERC20DT1Symbol"],
        [owner.address,user2.address, owner.address,'0x0000000000000000000000000000000000000000'],
        [web3.utils.toWei("10"),0],
        []
      ),
      "ERC721Template: NOT ERC20DEPLOYER_ROLE"
    );
  });

  it("#createERC20 - owner should create a new ERC20Token, no need to be added into the CreateERC20List", async () => {
    assert((await tokenERC721.getPermissions(owner.address)).deployERC20 == true)
    
    await tokenERC721.createERC20(1,
      ["ERC20DT1","ERC20DT1Symbol"],
      [owner.address,user2.address, owner.address,'0x0000000000000000000000000000000000000000'],
      [cap,0],
      []
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
      (await tokenERC721.getPermissions(owner.address)).deployERC20 == true
    );
    assert(
      (await tokenERC721.getPermissions(user2.address)).deployERC20 == true
    );

    await expectRevert(
      tokenERC721.connect(user2).cleanPermissions(),
      "ERC721Template: not NFTOwner"
    );

    await tokenERC721.cleanPermissions();

    assert(
      (await tokenERC721.getPermissions(owner.address)).deployERC20 == false
    );
    assert(
      (await tokenERC721.getPermissions(user2.address)).deployERC20 == false
    );
    assert(
      (await tokenERC721.getPermissions(user3.address)).deployERC20 == false
    );

    await tokenERC721.addManager(owner.address); // WE CLEANED OURSELF TO FROM ALL LISTS, so we need to re-ADD us.

    await tokenERC721.addToCreateERC20List(user3.address);
    assert((await tokenERC721.auth(0)) == owner.address);
    assert((await tokenERC721.auth(1)) == user3.address);
  });

  it("#addManager - should succed to add a new manager, if NFT owner", async () => {
    assert(
      (await tokenERC721.getPermissions(user3.address)).manager == false
    );
    await tokenERC721.addManager(user3.address);

    assert(
      (await tokenERC721.getPermissions(user3.address)).manager == true
    );
   
  });
  it("#addManager - should fail to add a new manager, when NOT NFT owner", async () => {
    assert(
      (await tokenERC721.getPermissions(user3.address)).manager == false
    );
    
    await expectRevert(
      tokenERC721.connect(user2).addManager(user3.address),
      "ERC721Template: not NFTOwner"
    );
    
    assert(
      (await tokenERC721.getPermissions(user3.address)).manager == false
    );
    
  });

  it("#removeManager - should succed to remove a manager, if NFT owner", async () => {
    await tokenERC721.addManager(user2.address);
    assert(
      (await tokenERC721.getPermissions(user2.address)).manager == true
    );
    await tokenERC721.removeManager(user2.address);

    assert(
      (await tokenERC721.getPermissions(user2.address)).manager == false
    );
    
  });

  it("#removeManager - should fail to remove a manager, when NOT NFT owner", async () => {
    await tokenERC721.addManager(user3.address);
    assert(
      (await tokenERC721.getPermissions(user3.address)).manager == true
    );
    
    await expectRevert(
      tokenERC721.connect(user2).removeManager(user3.address),
      "ERC721Template: not NFTOwner"
    );
    
    assert(
      (await tokenERC721.getPermissions(user3.address)).manager == true
    );
    
  });

  it("#removeManager - should succed to remove and re-add the NFT owner from manager list, if NFT owner", async () => {
    
    assert(
      (await tokenERC721.getPermissions(owner.address)).manager == true
    );
    await tokenERC721.removeManager(owner.address);

    assert(
      (await tokenERC721.getPermissions(owner.address)).manager == false
    );
    await tokenERC721.addManager(owner.address);
    
    assert(
      (await tokenERC721.getPermissions(owner.address)).manager == true
    );
  });
  it("#executeCall - should fail to call executeCall, if NOT manager", async () => {
    const operation = 0
    const to = user2.address
    const value = 10
    const data = web3.utils.asciiToHex('SomeData');

    assert(
      (await tokenERC721.getPermissions(user3.address)).manager == false
    );
    
    await expectRevert(
      tokenERC721.connect(user3).executeCall(operation,to,value,data),
      "ERC721RolesAddress: NOT MANAGER"
    );

    
  });

  it("#executeCall - should succed to call executeCall, if Manager", async () => {
    const operation = 0
    const to = user2.address
    const value = 10
    const data = web3.utils.asciiToHex('SomeData');

    assert(
      (await tokenERC721.getPermissions(owner.address)).manager == true
    );
    
   
     await tokenERC721.executeCall(operation,to,value,data)
    
  });

  it("#setNewData - should fail to set new Data(725Y)(ARBITRARY KEY), if NOT store updater", async () => {
    const key = web3.utils.keccak256('ARBITRARY_KEY');
    const value = web3.utils.asciiToHex('SomeData')

    assert(
      (await tokenERC721.getPermissions(user2.address)).store == false
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
      (await tokenERC721.getPermissions(user2.address)).store == true
    );
    
    await tokenERC721.connect(user2).setNewData(key,value)

    assert(await tokenERC721.getData(key) == value)
    
  });

  it("#setDataERC20 - should fail to call setDataERC20(725Y), even if user has store updater permssion", async () => {
    const key = web3.utils.keccak256('ARBITRARY_KEY');
    const value = web3.utils.asciiToHex('SomeData')
    await tokenERC721.addTo725StoreList(user2.address)

    assert(
      (await tokenERC721.getPermissions(user2.address)).store == true
    );
    // ONLY CALLS from ERC20 contract are allowed
    await expectRevert(tokenERC721.connect(user2).setDataERC20(key,value),"ERC721Template: NOT ERC20 Contract" )
    result = await tokenERC721.getData(key)

    assert(await tokenERC721.getData(key) == '0x')
    
  });

  it("#transferNFT - should fail to transfer NFT, if not NFT Owner or approved relayer", async () => {
    await expectRevert(tokenERC721.connect(user2).transferFrom(owner.address, user2.address, 1),'ERC721: transfer caller is not owner nor approved')
  })

  it("#transferNFT - should fail to transfer NFT, if not NFT Owner or approved relayer", async () => {
    await expectRevert(tokenERC721.connect(user2).safeTransferFrom(owner.address, user2.address, 1),'ERC721: transfer caller is not owner nor approved')
  })

  it("#transferNFT - should transfer properly the NFT, now the new user is the owner for ERC721Template and ERC20Template", async () => {
    await tokenERC721.addToCreateERC20List(owner.address);
    const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1","ERC20DT1Symbol"],
      [owner.address,user2.address, owner.address,'0x0000000000000000000000000000000000000000'],
      [web3.utils.toWei("10"),0],
      []
    );
    const trxReceiptERC20 = await trxERC20.wait();
    const event = getEventFromTx(trxReceiptERC20,'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    erc20Address = event.args[0];
    

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
    // when transferred to user2, user2 is already Manager and all other main roles at 721 level.
    assert((await tokenERC721.getPermissions(user2.address)).deployERC20 == true);
    await tokenERC721.connect(user2).createERC20(1,
      ["ERC20DT1","ERC20DT1Symbol"],
      [owner.address,user2.address, owner.address,'0x0000000000000000000000000000000000000000'],
      [web3.utils.toWei("10"),0],
      []
    )

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
      tokenERC721.connect(user6).setMetaData(metaDataState, metaDataDecryptorUrl, metaDataDecryptorAddress, flags, data, dataHash),
      "ERC721Template: NOT METADATA_ROLE"
    );
    

    await tokenERC721.connect(user2).setMetaData(metaDataState, metaDataDecryptorUrl, metaDataDecryptorAddress, flags, data, dataHash);

    let metadataInfo = await tokenERC721.getMetaData()
    assert(metadataInfo[3] === true)
    assert(metadataInfo[0] == metaDataDecryptorUrl);
  });

  it("#getTokensList - should return erc20 tokens list(deployed from the NFT contract)", async () => {
    result = await tokenERC721.getTokensList();
    expect(result[0]).to.equal(erc20Token.address)
   
  });

  it("#isDeployed - should return true if token has been deployed from this contract", async () => {
    assert(await tokenERC721.isDeployed(erc20Token.address) == true);
  });


  it("#isDeployed - should return false if token has NOT been deployed from this contract", async () => {
    assert(await tokenERC721.isDeployed(user3.address) == false);
  });

  it("#setBaseURI - should fail to update tokenURI if NOT NFT Owner", async () => {
    await expectRevert(tokenERC721.connect(user3).setBaseURI('https://newurl.com/nft/'),'ERC721Template: not NFTOwner')
    assert((await tokenERC721.tokenURI(1)) == "https://oceanprotocol.com/nft/1");
  });


  it("#setBaseURI - should update tokenURI if NFT Owner", async () => {
    await tokenERC721.setBaseURI('https://newurl.com/nft/')
    assert((await tokenERC721.tokenURI(1)) == "https://newurl.com/nft/1");
  });
});
