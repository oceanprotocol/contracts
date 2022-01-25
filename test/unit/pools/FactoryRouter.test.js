/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const {getEventFromTx} = require("../../helpers/utils")
const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { getContractFactory } = require("@nomiclabs/hardhat-ethers/types");
const { address } = require("../../helpers/constants");
const ethers = hre.ethers;

describe("FactoryRouter", () => {
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
    router,
    poolFactory,
    oceanContract,
    erc20DTContract,
    vault,
    fork

  const oceanAddress = "0x967da4048cd07ab37855c090aaf366e4ce1b9f48";
  const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f"
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
 

  beforeEach("init contracts for each test", async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: process.env.ALCHEMY_URL,
          blockNumber: 12515000,
        }
      }]
    })

    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");

    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("SideStaking");
    const DispenserContract = await ethers.getContractFactory("Dispenser");
    const BPool = await ethers.getContractFactory("BPool");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );

  

    [
      owner, // nft owner, 721 deployer
      reciever,
      user2, // 721Contract manager
      user3, // pool creator and liquidity provider
      user4,
      user5,
      user6,
      marketFeeCollector,
      opcCollector,
      newToken      
    ] = await ethers.getSigners();
    
    data = web3.utils.asciiToHex("SomeData");
    flags = web3.utils.asciiToHex(constants.blob[0]);
       
   // DEPLOY ROUTER, SETTING OWNER

  poolTemplate = await BPool.deploy();

 


  router = await Router.deploy(
    owner.address,
    oceanAddress,
    poolTemplate.address, // pooltemplate field, unused in this test
    opcCollector.address,
    []
  );

  sideStaking = await SSContract.deploy(router.address);
  dispenser = await DispenserContract.deploy(router.address);

  fixedRateExchange = await FixedRateExchange.deploy(
    router.address,
    opcCollector.address
  );

  templateERC20 = await ERC20Template.deploy();

  
  // SETUP ERC721 Factory with template
  templateERC721 = await ERC721Template.deploy();
  factoryERC721 = await ERC721Factory.deploy(
    templateERC721.address,
    templateERC20.address,
    opcCollector.address,
    router.address
  );

  // SET REQUIRED ADDRESS

  let tx = await router.addFactory(factoryERC721.address);
  let txReceipt = await tx.wait();
  tx = await router.addFixedRateContract(fixedRateExchange.address);
  txReceipt = await tx.wait();
  tx = await router.addDispenserContract(dispenser.address);
  txReceipt = await tx.wait();
  tx = await router.addSSContract(sideStaking.address)
  txReceipt = await tx.wait();
  tx = await factoryERC721.deployERC721Contract(
      "DT1",
      "DTSYMBOL",
      1,
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/"
    );
    txReceipt = await tx.wait();
    const event = getEventFromTx(txReceipt,'NFTCreated')
    assert(event, "Cannot find NFTCreated event")
    tokenAddress = event.args[0];
    tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);
    symbol = await tokenERC721.symbol();
    name = await tokenERC721.name();
    assert(name === "DT1");
    assert(symbol === "DTSYMBOL");
    assert((await tokenERC721.balanceOf(owner.address)) == 1);
    
  //   // INITIAL SET UP, THE MANAGER ADDS A NEW ROLE FOR ITSELF (erc20Deployer role)
  //   await tokenERC721.addToCreateERC20List(owner.address);
    
  //   // WE THEN CREATE A NEW ERC20 CONTRACT
  //   let receipt = await (
  //   await tokenERC721.createERC20(
  //       "ERC20DT1",
  //       "ERC20DT1Symbol",
  //       web3.utils.toWei("1000"),
  //       1,
  //       owner.address,
  //       user3.address
  //     )
  //   ).wait();
  //   const newERC20DT = receipt.events[3].args.erc20Address;

  //   erc20DTContract = await ethers.getContractAt(
  //     "ERC20Template",
  //     newERC20DT
  //   );

  //   // WE ADD OURSELF AS MINTER AND THEN MINT SOME ERC20 DATATOKEN.
  //   //await erc20DTContract.addMinter(owner.address);
  //   await erc20DTContract.mint(owner.address, web3.utils.toWei("100"));
  //   assert(await erc20DTContract.balanceOf(owner.address) == web3.utils.toWei("100"))

   

  });


  it("#oceanTokens - should confirm Ocean token has been added to the mapping",async () => {
    assert(await router.isOceanToken(oceanAddress) == true, "oceanAddress is not an ocean token");
    const contractOceanTokens = await router.getOceanTokens();
    assert(contractOceanTokens.includes(web3.utils.toChecksumAddress(oceanAddress)), "oceanAddress not found in router.getOceanTokens()")
  })

  it("#addOceanToken - should add and remove new token address to the mapping if Router Owner",async () => {
    assert(await router.isOceanToken(newToken.address) === false, "newToken.address is an ocean token");
    await router.addOceanToken(newToken.address)
    assert(await router.isOceanToken(newToken.address) == true, "newToken.address is not an ocean token");
    let contractOceanTokens = await router.getOceanTokens();
    assert(contractOceanTokens.length>1)
    assert(contractOceanTokens.includes(web3.utils.toChecksumAddress(newToken.address)), "newToken.address not found in router.getOceanTokens()")

    // remove it
    await router.removeOceanToken(newToken.address)
    assert(await router.isOceanToken(newToken.address) === false, "newToken.address is not an ocean token");
    contractOceanTokens = await router.getOceanTokens();
    assert(!contractOceanTokens.includes(web3.utils.toChecksumAddress(newToken.address)), "newToken.address found in router.getOceanTokens()")
  })


  it("#addOceanToken - should fail to add a new token address to the mapping if NOT Router Owner",async () => {
    await expectRevert(router.connect(user2).addOceanToken(newToken.address), "OceanRouter: NOT OWNER")
    assert(await router.isOceanToken(newToken.address) === false, "newToken.address is an ocean token");
   
  })

  it("#removeOceanToken - should remove a token previously added if Router Owner, check OPF fee updates properly",async () => {
    // newToken is not mapped so fee is 1e15
    assert(await router.isOceanToken(newToken.address) == false);
    assert(await router.getOPCFee(newToken.address) == 1e15);
    
    // router owner adds newToken address
    await router.addOceanToken(newToken.address)
    assert(await router.isOceanToken(newToken.address) == true);

    // OPF Fee is ZERO now
    assert(await router.getOPCFee(newToken.address) == 0);

    // router owner removes newToken address
    await router.removeOceanToken(newToken.address)
    assert(await router.isOceanToken(newToken.address) == false);

    // OPF Fee is again the default 1e15 => 0.1%
    assert(await router.getOPCFee(newToken.address) == 1e15);
  })

  it("#removeOceanToken - should fail to remove a new token address to the mapping if NOT Router Owner",async () => {
    await router.addOceanToken(newToken.address)
    assert(await router.isOceanToken(newToken.address) == true);
    await expectRevert(router.connect(user2).removeOceanToken(newToken.address), "OceanRouter: NOT OWNER")
    assert(await router.isOceanToken(newToken.address) === true);
  })

  it("#updateOPFFee - should update opf Fee if router owner",async () => {
    assert(await router.isOceanToken(newToken.address) == false);
    assert(await router.getOPCFee(newToken.address) == 1e15);
    assert(await router.swapOceanFee() == 0)
    assert(await router.swapNonOceanFee() == 1e15)
    await router.updateOPFFee("0", web3.utils.toWei('0.01'));
    assert(await router.isOceanToken(newToken.address) == false);
    assert(await router.getOPCFee(newToken.address) == 1e16);
    assert(await router.swapNonOceanFee() == 1e16)
    assert(await router.swapOceanFee() == 0)
  })

  it("#updateOPFFee - should fail to update OPF Fee if NOT Router Owner",async () => {
    assert(await router.swapNonOceanFee() == 1e15)
    await expectRevert(router.connect(user2).updateOPFFee("0", web3.utils.toWei('0.01')), "OceanRouter: NOT OWNER")
    assert(await router.swapNonOceanFee() == 1e15)
  })

  it("#getOPCFees - should get OPF fees",async () => {
    const fees = await router.getOPCFees();
    assert(fees[0] == 0);
    assert(fees[1] == 1e15);
  })
  
  it("#ssContracts - should confirm ssContract has been added to the mapping",async () => {
    assert(await router.isSSContract(sideStaking.address) == true, "sideStaking.address is not a SS Contract");
    const contractSSContracts = await router.getSSContracts();
    assert(contractSSContracts.includes(web3.utils.toChecksumAddress(sideStaking.address)), "sideStaking.address not found in router.getSSContracts()")
  })

  it("#ssContracts - should add and remove new contract if Router Owner",async () => {
    assert(await router.isSSContract(newToken.address) === false, "newToken.address is already a SS Contract");
    await router.addSSContract(newToken.address)
    assert(await router.isSSContract(newToken.address) == true, "newToken.address is not a SS Contract");
    let contractSSContracts = await router.getSSContracts();
    assert(contractSSContracts.length>1)
    assert(contractSSContracts.includes(web3.utils.toChecksumAddress(newToken.address)), "newToken.address not found in router.getSSContracts()")

    // remove it
    await router.removeSSContract(newToken.address)
    assert(await router.isSSContract(newToken.address) === false, "newToken.address is not a SS Contract");
    contractSSContracts = await router.getSSContracts();
    assert(!contractSSContracts.includes(web3.utils.toChecksumAddress(newToken.address)), "newToken.address found in router.getSSContracts()")
  })


  it("#ssContracts - should fail to add a new contract address to the mapping if NOT Router Owner",async () => {
    await expectRevert(router.connect(user2).addSSContract(newToken.address), "OceanRouter: NOT OWNER")
    assert(await router.isSSContract(newToken.address) === false, "newToken.address is a SS Contract");
   
  })

  it("#ssContracts - should fail to remove a new contract address to the mapping if NOT Router Owner",async () => {
    await router.addSSContract(newToken.address)
    assert(await router.isSSContract(newToken.address) == true);
    await expectRevert(router.connect(user2).removeSSContract(newToken.address), "OceanRouter: NOT OWNER")
    assert(await router.isSSContract(newToken.address) === true);
  })


  it("#addFactory - should fail to add a new factory address to the mapping even if Router Owner",async () => {
    await expectRevert(router.addFactory(user2.address), "FACTORY ALREADY SET")
    assert(await router.factory() == factoryERC721.address);
   
  })

  it("#addFactory - should fail to add a new factory address to the mapping even if NOT Router Owner",async () => {
    await expectRevert(router.connect(user2).addFactory(user2.address), "OceanRouter: NOT OWNER")
    assert(await router.factory() == factoryERC721.address);
   
  })


  it("#FixedRateContracts - should confirm fixedrate has been added to the mapping",async () => {
    assert(await router.isFixedRateContract(fixedRateExchange.address) == true, "fixedRateExchange.address is not a FixedRate Contract");
    const contractSSContracts = await router.getFixedRatesContracts();
    assert(contractSSContracts.includes(web3.utils.toChecksumAddress(fixedRateExchange.address)), "fixedRateExchange.address not found in router.getFixedRateContracts()")
  })

  it("#FixedRateContracts - should add and remove new contract if Router Owner",async () => {
    assert(await router.isFixedRateContract(newToken.address) === false, "newToken.address is already a FixedRate Contract");
    await router.addFixedRateContract(newToken.address)
    assert(await router.isFixedRateContract(newToken.address) == true, "newToken.address is not a FixedRate Contract");
    let contractFixedRateContracts = await router.getFixedRatesContracts();
    assert(contractFixedRateContracts.length>1)
    assert(contractFixedRateContracts.includes(web3.utils.toChecksumAddress(newToken.address)), "newToken.address not found in router.getFixedRateContracts()")

    // remove it
    await router.removeFixedRateContract(newToken.address)
    assert(await router.isFixedRateContract(newToken.address) === false, "newToken.address is not a FixedRate Contract");
    contractFixedRateContracts = await router.getFixedRatesContracts();
    assert(!contractFixedRateContracts.includes(web3.utils.toChecksumAddress(newToken.address)), "newToken.address found in router.getFixedRateContracts()")
  })


  it("#FixedRateContracts - should fail to add a new contract to the mapping if NOT Router Owner",async () => {
    await expectRevert(router.connect(user2).addFixedRateContract(newToken.address), "OceanRouter: NOT OWNER")
    assert(await router.isFixedRateContract(newToken.address) === false, "newToken.address is an FixedRate");
   
  })

  it("#FixedRateContracts - should fail to remove a new contract address to the mapping if NOT Router Owner",async () => {
    await router.addFixedRateContract(newToken.address)
    assert(await router.isFixedRateContract(newToken.address) == true);
    await expectRevert(router.connect(user2).removeFixedRateContract(newToken.address), "OceanRouter: NOT OWNER")
    assert(await router.isFixedRateContract(newToken.address) === true);
  })

  it("#DispenserContracts - should confirm Dispenser has been added to the mapping",async () => {
    assert(await router.isDispenserContract(dispenser.address) == true, "dispenser.address is not a Dispenser Contract");
    const contractSSContracts = await router.getDispensersContracts();
    assert(contractSSContracts.includes(web3.utils.toChecksumAddress(dispenser.address)), "dispenser.address not found in router.getDispenserContracts()")
  })

  it("#DispenserContracts - should add and remove new contract if Router Owner",async () => {
    assert(await router.isDispenserContract(newToken.address) === false, "newToken.address is already a Dispenser Contract");
    await router.addDispenserContract(newToken.address)
    assert(await router.isDispenserContract(newToken.address) == true, "newToken.address is not a Dispenser Contract");
    let contractDispenserContracts = await router.getDispensersContracts();
    assert(contractDispenserContracts.length>1)
    assert(contractDispenserContracts.includes(web3.utils.toChecksumAddress(newToken.address)), "newToken.address not found in router.getDispenserContracts()")

    // remove it
    await router.removeDispenserContract(newToken.address)
    assert(await router.isDispenserContract(newToken.address) === false, "newToken.address is not a Dispenser Contract");
    contractDispenserContracts = await router.getDispensersContracts();
    assert(!contractDispenserContracts.includes(web3.utils.toChecksumAddress(newToken.address)), "newToken.address found in router.getDispenserContracts()")
  })


  it("#DispenserContracts - should fail to add a new contract address to the mapping if NOT Router Owner",async () => {
    await expectRevert(router.connect(user2).addDispenserContract(newToken.address), "OceanRouter: NOT OWNER")
    assert(await router.isDispenserContract(newToken.address) === false, "newToken.address is an Dispenser");
   
  })

  it("#DispenserContracts - should fail to remove a new contract address to the mapping if NOT Router Owner",async () => {
    await router.addDispenserContract(newToken.address)
    assert(await router.isDispenserContract(newToken.address) == true);
    await expectRevert(router.connect(user2).removeDispenserContract(newToken.address), "OceanRouter: NOT OWNER")
    assert(await router.isDispenserContract(newToken.address) === true);
  })




  it("#addPoolTemplate - should fail to add a new pool template contract if NOT Router Owner",async () => {
    assert(await router.isPoolTemplate(user2.address) ==false)
    await expectRevert(router.connect(user2).addPoolTemplate(user2.address), "OceanRouter: NOT OWNER")
    assert(await router.isPoolTemplate(user2.address) ==false)
   
  })

      
  it("#addPoolTemplate - should succeed to add a new pool template contract if Router Owner",async () => {
    assert(await router.isPoolTemplate(user2.address) ==false)
    await router.addPoolTemplate(user2.address)
    assert(await router.isPoolTemplate(user2.address) ==true)
   
  })

  it("#removePoolTemplate - should fail to remove pool template contract if NOT Router Owner",async () => {
    assert(await router.isPoolTemplate(poolTemplate.address) ==true)
    await expectRevert(router.connect(user2).removePoolTemplate(poolTemplate.address), "OceanRouter: NOT OWNER")
    assert(await router.isPoolTemplate(poolTemplate.address) ==true)
   
  })

  it("#removePoolTemplate - should suceed to remove pool template contract if Router Owner",async () => {
    assert(await router.isPoolTemplate(poolTemplate.address) ==true)
    await router.removePoolTemplate(poolTemplate.address)
    assert(await router.isPoolTemplate(poolTemplate.address) ==false)
   
  })

});


