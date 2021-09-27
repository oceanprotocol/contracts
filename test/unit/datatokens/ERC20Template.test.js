/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent, BN } = require("@openzeppelin/test-helpers");
const {getEventFromTx} = require("../../helpers/utils")
const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const ethers = hre.ethers;
const { ecsign } = require("ethereumjs-util");


const getDomainSeparator = (name, tokenAddress, chainId) => {
  return keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        keccak256(
          ethers.utils.toUtf8Bytes(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
          )
        ),
        keccak256(ethers.utils.toUtf8Bytes(name)),
        keccak256(ethers.utils.toUtf8Bytes("1")),
        chainId,
        tokenAddress,
      ]
    )
  );
};
const PERMIT_TYPEHASH = keccak256(
  ethers.utils.toUtf8Bytes(
    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
  )
);

const getApprovalDigest = async (
  token,
  owner,
  spender,
  value,
  nonce,
  deadline,
  chainId
) => {
  const name = await token.name();
  const DOMAIN_SEPARATOR = getDomainSeparator(name, token.address, chainId);
  return keccak256(
    ethers.utils.solidityPack(
      ["bytes1", "bytes1", "bytes32", "bytes32"],
      [
        "0x19",
        "0x01",
        DOMAIN_SEPARATOR,
        keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
            [PERMIT_TYPEHASH, owner, spender, value, nonce, deadline]
          )
        ),
      ]
    )
  );
};

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
    erc20Token,
    erc20AddressWithPublishFee,
    erc20TokenWithPublishFee,
    publishMarketFeeAddress,
    mockErc20,
    mockErc20Decimals,
    publishMarketFeeToken

    cap = web3.utils.toWei("100000");
    const fakeUSDAmount = cap

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  const oceanAddress = "0x967da4048cD07aB37855c090aAF366e4ce1b9F48";
  const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
  const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const publishMarketFeeAmount = "5"
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

    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("ssFixedRate");
    const BPool = await ethers.getContractFactory("BPool");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );

    const MockErc20 = await ethers.getContractFactory('MockERC20');
    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');

    [owner, reciever, user2, user3,user4, user5, user6, provider, opfCollector, marketFeeCollector, publishMarketAccount] = await ethers.getSigners();
    publishMarketFeeAddress = publishMarketAccount.address
    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);

 // DEPLOY ROUTER, SETTING OWNER

    poolTemplate = await BPool.deploy();

    mockErc20 = await MockErc20.deploy(owner.address,"MockERC20",'MockERC20');
    mockErc20Decimals = await MockErc20Decimals.deploy("Mock6Digits",'Mock6Digits',6);
    publishMarketFeeToken = mockErc20Decimals.address
    
    router = await Router.deploy(
     owner.address,
     oceanAddress,
     poolTemplate.address,
     opfCollector.address,
     []
   );
      
   ssFixedRate = await SSContract.deploy(router.address);

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
 
   await router.addFixedRateContract(fixedRateExchange.address); // DEPLOY ROUTER, SETTING OWNER

   await router.addSSContract(ssFixedRate.address)
 

    // by default connect() in ethers goes with the first address (owner in this case)
    const tx = await factoryERC721.deployERC721Contract(
      "NFT",
      "NFTSYMBOL",
      1,
      "0x0000000000000000000000000000000000000000"
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
      [user3.address,user6.address, user3.address,addressZero],
      [cap,0],
      []
    );
    const trxReceiptERC20 = await trxERC20.wait();
    event = getEventFromTx(trxReceiptERC20,'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    erc20Address = event.args[0];
    
    erc20Token = await ethers.getContractAt("ERC20Template", erc20Address);
    assert((await erc20Token.permissions(user3.address)).minter == true);
    
    
    // create an ERC20 with publish Fees ( 5 USDC, going to publishMarketAddress)
    const trxERC20WithPublishFee = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1P","ERC20DT1SymbolP"],
      [user3.address,user6.address, publishMarketFeeAddress,publishMarketFeeToken],
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


  it("#isInitialized - should check that the erc20Token contract is initialized", async () => {
    expect(await erc20Token.isInitialized()).to.equal(true);
  });

  it("#initialize - should fail to re-initialize the contracts", async () => {
    await expectRevert(
      erc20Token.initialize(
        ["ERC20DT1","ERC20DT1Symbol"],
        [owner.address, marketFeeCollector.address, owner.address, addressZero ],
        [tokenERC721.address, communityFeeCollector, router.address],
        [web3.utils.toWei("10"),0],
        []
      ),
      "ERC20Template: token instance already initialized"
    );
  });

  it("#mint - user3 (minter role) should succeed to mint 1 ERC20Token to user2", async () => {
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("1"));
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
      "ERC20Template: NOT FEE MANAGER"
    );
  });

  it("#setFeeCollector - should succeed to set new FeeCollector if feeManager", async () => {
    await erc20Token.connect(user3).addFeeManager(owner.address);

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

    await erc20Token.connect(user3).addMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == true);

    await expectRevert(
      erc20Token.connect(user3).addMinter(user2.address),
      "ERC20Roles:  ALREADY A MINTER"
    );
  });

  it("#addMinter - should succeed to addMinter if erc20Deployer (permission to deploy the erc20Contract at 721 level)", async () => {
    assert((await erc20Token.permissions(user2.address)).minter == false);

    // owner is already erc20Deployer
    await erc20Token.connect(user3).addMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == true);
  });

  it("#removeMinter - should fail to removeMinter if NOT erc20Deployer", async () => {
    await erc20Token.connect(user3).addMinter(user2.address);
    assert((await erc20Token.permissions(user2.address)).minter == true);

    await expectRevert(
      erc20Token.connect(user2).removeMinter(user2.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(user2.address)).minter == true);
  });

  it("#removeMinter - should fail to removeMinter even if it's minter", async () => {
    await erc20Token.connect(user3).addMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == true);

    await expectRevert(
      erc20Token.connect(user4).removeMinter(user2.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(user2.address)).minter == true);
  });

  it("#removeMinter - should succeed to removeMinter if erc20Deployer", async () => {
    await erc20Token.connect(user3).addMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == true);
  
    assert((await tokenERC721.getPermissions(user3.address)).deployERC20 == true)
    
    await erc20Token.connect(user3).removeMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == false);
  });

  it("#addFeeManager - should fail to addFeeManager if not erc20Deployer (permission to deploy the erc20Contract at 721 level)", async () => {
    assert((await erc20Token.permissions(user2.address)).feeManager == false);
    
    await expectRevert(
      erc20Token.connect(user2).addFeeManager(user2.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(user2.address)).feeManager == false);
  });

  it("#addFeeManager - should fail to addFeeManager if it's already feeManager", async () => {
    assert((await erc20Token.permissions(user2.address)).feeManager == false);

    await erc20Token.connect(user3).addFeeManager(user2.address);

    assert((await erc20Token.permissions(user2.address)).feeManager == true);

    await expectRevert(
      erc20Token.connect(user3).addFeeManager(user2.address),
      "ERC20Roles:  ALREADY A FEE MANAGER"
    );
  });

  it("#addFeeManager - should succeed to addFeeManager if erc20Deployer (permission to deploy the erc20Contract at 721 level)", async () => {
    assert((await erc20Token.permissions(user2.address)).feeManager == false);

    // owner is already erc20Deployer
    await erc20Token.connect(user3).addFeeManager(user2.address);

    assert((await erc20Token.permissions(user2.address)).feeManager == true);
  });

  it("#removeFeeManager - should fail to removeFeeManager if NOT erc20Deployer", async () => {
    await erc20Token.connect(user3).addFeeManager(owner.address);

    assert((await erc20Token.permissions(owner.address)).feeManager == true);

    await expectRevert(
      erc20Token.connect(user2).removeFeeManager(owner.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(owner.address)).feeManager == true);
  });

  it("#removeFeeManager - should fail to removeFeeManager even if it's feeManager", async () => {
    // ERC20 deployer role add himself as manager and user2
    await erc20Token.connect(user3).addFeeManager(owner.address);
    await erc20Token.connect(user3).addFeeManager(user2.address);

    assert((await erc20Token.permissions(user2.address)).feeManager == true);

    await expectRevert(
      erc20Token.connect(user2).removeFeeManager(owner.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(owner.address)).feeManager == true);
  });

  it("#removeFeeManager - should succeed to removeFeeManager if erc20Deployer", async () => {
    await erc20Token.connect(user3).addFeeManager(user2.address);

    assert((await erc20Token.permissions(user2.address)).feeManager == true);

    await erc20Token.connect(user3).removeFeeManager(user2.address);

    assert((await erc20Token.permissions(user2.address)).feeManager == false);
  });

  it("#setData - should fail to setData if NOT erc20Deployer", async () => {
    const key = web3.utils.keccak256(erc20Token.address);
    const value = web3.utils.asciiToHex("SomeData");

    await expectRevert(
      erc20Token.connect(user2).setData(value),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await tokenERC721.getData(key)) == "0x");
  });

  it("#setData - should succeed to setData if erc20Deployer", async () => {
    const key = web3.utils.keccak256(erc20Token.address);
    const value = web3.utils.asciiToHex("SomeData");

    await erc20Token.connect(user3).setData(value);

    assert((await tokenERC721.getData(key)) == value);
  });

  it("#cleanPermissions - should fail to call cleanPermissions if NOT NFTOwner", async () => {
    assert((await erc20Token.permissions(user3.address)).minter == true);
    await expectRevert(
      erc20Token.connect(user2).cleanPermissions(),
      "ERC20Template: not NFTOwner"
    );

    assert((await erc20Token.permissions(user3.address)).minter == true);
  });

  it("#cleanPermissions - should succeed to call cleanPermissions if NFTOwner", async () => {
    // user3 is already minter
    
    assert((await erc20Token.permissions(user3.address)).minter == true);
    await erc20Token.connect(user3).addFeeManager(owner.address);
    // we set a new FeeCollector
    await erc20Token.connect(owner).setFeeCollector(user2.address);
    assert((await erc20Token.getFeeCollector()) == user2.address);
    // WE add 2 more minters
    await erc20Token.connect(user3).addMinter(user2.address);
    await erc20Token.connect(user3).addMinter(user4.address);
    assert((await erc20Token.permissions(user2.address)).minter == true);
    assert((await erc20Token.permissions(user4.address)).minter == true);

    // NFT Owner cleans
    await erc20Token.cleanPermissions();

    // check permission were removed
    assert((await erc20Token.permissions(owner.address)).minter == false);
    assert((await erc20Token.permissions(owner.address)).feeManager == false);
    assert((await erc20Token.permissions(user2.address)).minter == false);
    assert((await erc20Token.permissions(user3.address)).minter == false);
    assert((await erc20Token.permissions(user4.address)).minter == false);
    // we reassigned feeCollector to address(0) when cleaning permissions, so now getFeeCollector points to NFT Owner
    assert((await erc20Token.getFeeCollector()) == owner.address);
  });

  it("#permit - should succeed to deposit with permit function", async () => {
    // mint some DT to owner
    await erc20Token.connect(user3).mint(owner.address, web3.utils.toWei("100"));

    // mock exchange
    const Exchange = await ethers.getContractFactory("MockExchange");
    exchange = await Exchange.deploy();

    const TEST_AMOUNT = ethers.utils.parseEther("10");
    const nonce = await erc20Token.nonces(owner.address);
    const chainId = await owner.getChainId();
    const deadline = Math.round(new Date().getTime() / 1000 + 600000); // 10 minutes

    const digest = await getApprovalDigest(
      erc20Token,
      owner.address,
      exchange.address,
      TEST_AMOUNT,
      nonce,
      deadline,
      chainId
    );
    // private Key from owner, taken from the RPC
    const { v, r, s } = ecsign(
      Buffer.from(digest.slice(2), "hex"),
      Buffer.from(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80".slice(
          2
        ),
        "hex"
      )
    );

    // we can now deposit using permit
    await exchange.depositWithPermit(
      erc20Token.address,
      TEST_AMOUNT,
      deadline,
      v,
      r,
      s
    );

    assert(
      (await erc20Token.balanceOf(exchange.address)).eq(TEST_AMOUNT) == true
    );
  });

  it("#startOrder - user should succeed to call startOrder on a ERC20 without publishFees, consumeFeeAmount on top is ZERO", async () => {
    
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
      .startOrder(
        consumer,
        dtAmount,
        serviceId,
        consumeFeeAddress,
        consumeFeeToken,
        consumeFeeAmount
      );

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

  it("#startOrder - user should succeed to call startOrder on a ERC20 without publishFees, consumeFeeToken on top is ZERO", async () => {
    
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
      .startOrder(
        consumer,
        dtAmount,
        serviceId,
        consumeFeeAddress,
        consumeFeeToken,
        consumeFeeAmount
      );

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

  it("#startOrder - user should succeed to call startOrder on a ERC20 without publishFees, consumeFee on top is 3 MockERC20", async () => {
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
      .approve(erc20Token.address, web3.utils.toWei(consumeFeeAmount));

    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    

    await erc20Token
      .connect(user2)
      .startOrder(
        consumer,
        dtAmount,
        serviceId,
        consumeFeeAddress,
        consumeFeeToken,
        web3.utils.toWei(consumeFeeAmount)
      );
    const balance = await Mock20Contract.balanceOf(consumeFeeAddress)
    const balanceOpf = await Mock20Contract.balanceOf(opfCollector.address)
    const expected = web3.utils.toWei(new BN(consumeFeeAmount)).sub(web3.utils.toWei(new BN(consumeFeeAmount)).div(new BN(100)))
    const expectedOpf = web3.utils.toWei(new BN(consumeFeeAmount)).div(new BN(100))
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

  it("#startOrder - user should be able to get getPublishingMarketFee", async () => {
    const publishFees = await erc20TokenWithPublishFee
      .connect(user2)
      .getPublishingMarketFee();
    assert(publishFees[0] = publishMarketFeeAddress)
    assert(publishFees[1] = publishMarketFeeToken)
    assert(publishFees[2] = web3.utils.toWei(publishMarketFeeAmount))
    
  });
  

  //////////
  it("#startOrder - user should succeed to call startOrder on a ERC20 with 5 USDC publishFees, consumeFee on top is ZERO", async () => {
    
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
      .approve(erc20TokenWithPublishFee.address, publishFees[2]);

    await erc20TokenWithPublishFee
      .connect(user2)
      .startOrder(
        consumer,
        dtAmount,
        serviceId,
        consumeFeeAddress,
        consumeFeeToken,
        consumeFeeAmount
      );

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

  it("#startOrder - user should succeed to call startOrder on a ERC20 with 5 mockErc20Decimal publishFees, consumeFee on top is 3 mockErc20", async () => {
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
      .approve(erc20TokenWithPublishFee.address, publishFees[2]);
    
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
      .approve(erc20TokenWithPublishFee.address, web3.utils.toWei(consumeFeeAmount));

    //MINT SOME DT20 to USER2 so he can start order
    await erc20TokenWithPublishFee.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    

    await erc20TokenWithPublishFee
      .connect(user2)
      .startOrder(
        consumer,
        dtAmount,
        serviceId,
        consumeFeeAddress,
        consumeFeeToken,
        web3.utils.toWei(consumeFeeAmount)
      );
    const balanceConsume = await Mock20Contract.balanceOf(consumeFeeAddress)
    const balanceOpfConsume = await Mock20Contract.balanceOf(opfCollector.address)
    const expectedConsume = web3.utils.toWei(new BN(consumeFeeAmount)).sub(web3.utils.toWei(new BN(consumeFeeAmount)).div(new BN(100)))
    const expectedOpfConsume = web3.utils.toWei(new BN(consumeFeeAmount)).div(new BN(100))

    const balancePublish = await Mock20DecimalContract.balanceOf(publishFees[0])
    const balanceOpfPublish = await Mock20DecimalContract.balanceOf(opfCollector.address)
    const expectedPublish = new BN(publishFees[2].toString()).sub(new BN(publishFees[2].toString()).div(new BN(100)))
    const expectedOpfPublish = new BN(publishFees[2].toString()).div(new BN(100))

    assert(balanceConsume.toString() === expectedConsume.toString(),'Invalid consume Fee')
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
  it("#setPublishingMarketFee - user should not be able to set new publish fees", async () => {
    await expectRevert(
      erc20TokenWithPublishFee.connect(user2).setPublishingMarketFee(user2.address,erc20Token.address,web3.utils.toWei('10')),
      "ERC20Template: not publishMarketFeeAddress"
    );
    const publishFees = await erc20TokenWithPublishFee
    .connect(user2)
    .getPublishingMarketFee();
    assert(publishFees[0] = publishMarketFeeAddress)
    assert(publishFees[1] = publishMarketFeeToken)
    assert(publishFees[2] = web3.utils.toWei(publishMarketFeeAmount))
  });
  it("#setPublishingMarketFee - publishMarketAccount should not be able to set new publish fees", async () => {
    
    await erc20TokenWithPublishFee.connect(publishMarketAccount).setPublishingMarketFee(user2.address,erc20Token.address,web3.utils.toWei('10'))
    const publishFees = await erc20TokenWithPublishFee
    .connect(user2)
    .getPublishingMarketFee();
    assert(publishFees[0] = user2.address)
    assert(publishFees[1] = erc20Token.address)
    assert(publishFees[2] = web3.utils.toWei('10'))
  });
  it("#getId - should return templateId", async () => {
    const templateId = 1;
    assert((await erc20Token.getId()) == templateId);
  });

});
