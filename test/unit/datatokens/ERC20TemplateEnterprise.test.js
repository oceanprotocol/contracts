/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent, BN } = require("@openzeppelin/test-helpers");
const { getEventFromTx } = require("../../helpers/utils")
const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const ethers = hre.ethers;
const { ecsign } = require("ethereumjs-util");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");


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




const provider = new ethers.providers.JsonRpcProvider();
describe("ERC20TemplateEnterprise", () => {
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
    publishMarketFeeToken,
    EnterpriseToken

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
            jsonRpcUrl: process.env.ALCHEMY_URL,
            blockNumber: 12515000,
          },
        },
      ],
    });

    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20TemplateEnterprise");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");

    const Router = await ethers.getContractFactory("FactoryRouter");
    const SSContract = await ethers.getContractFactory("SideStaking");
    const BPool = await ethers.getContractFactory("BPool");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );
    const Dispenser = await ethers.getContractFactory(
      "Dispenser"
    );

    const MockErc20 = await ethers.getContractFactory('MockERC20');
    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');

    [owner, reciever, user2, user3, user4, user5, user6, opcCollector, marketFeeCollector, publishMarketAccount,user7] = await ethers.getSigners();
    publishMarketFeeAddress = publishMarketAccount.address
    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);

    // DEPLOY ROUTER, SETTING OWNER

    poolTemplate = await BPool.deploy();

    mockErc20 = await MockErc20.deploy(owner.address, "MockERC20", 'MockERC20');
    mockErc20Decimals = await MockErc20Decimals.deploy("Mock6Digits", 'Mock6Digits', 6);
    publishMarketFeeToken = mockErc20Decimals.address

    router = await Router.deploy(
      owner.address,
      oceanAddress,
      poolTemplate.address,
      opcCollector.address,
      []
    );

    sideStaking = await SSContract.deploy(router.address);

    fixedRateExchange = await FixedRateExchange.deploy(
      router.address,
      opcCollector.address
    );

    dispenser = await Dispenser.deploy(router.address);

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


    await router.addFactory(factoryERC721.address);

    await router.addFixedRateContract(fixedRateExchange.address); // DEPLOY ROUTER, SETTING OWNER
    await router.addDispenserContract(dispenser.address);
    await router.addSSContract(sideStaking.address)


    // by default connect() in ethers goes with the first address (owner in this case)
    const tx = await factoryERC721.deployERC721Contract(
      "NFT",
      "NFTSYMBOL",
      1,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "https://oceanprotocol.com/nft/",
      true
    );
    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt, 'NFTCreated')
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
      ["ERC20DT1", "ERC20DT1Symbol"],
      [user3.address, user6.address, user3.address, addressZero],
      [cap, 0],
      []
    );
    const trxReceiptERC20 = await trxERC20.wait();
    event = getEventFromTx(trxReceiptERC20, 'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    erc20Address = event.args[0];

    erc20Token = await ethers.getContractAt("ERC20TemplateEnterprise", erc20Address);
    assert((await erc20Token.permissions(user3.address)).minter == true);


    // create an ERC20 with publish Fee ( 5 USDC, going to publishMarketAddress)
    const trxERC20WithPublishFee = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1P", "ERC20DT1SymbolP"],
      [user3.address, user6.address, publishMarketFeeAddress, publishMarketFeeToken],
      [cap, web3.utils.toWei(publishMarketFeeAmount)],
      []

    );
    const trxReceiptERC20WithPublishFee = await trxERC20WithPublishFee.wait();
    event = getEventFromTx(trxReceiptERC20WithPublishFee, 'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    erc20AddressWithPublishFee = event.args[0];

    erc20TokenWithPublishFee = await ethers.getContractAt("ERC20TemplateEnterprise", erc20AddressWithPublishFee);
    assert((await erc20TokenWithPublishFee.permissions(user3.address)).minter == true);

  });


  it("#isInitialized - should check that the erc20Token contract is initialized", async () => {
    expect(await erc20Token.isInitialized()).to.equal(true);
  });

  it("#initialize - should fail to re-initialize the contracts", async () => {
    await expectRevert(
      erc20Token.initialize(
        ["ERC20DT1", "ERC20DT1Symbol"],
        [owner.address, marketFeeCollector.address, owner.address, addressZero],
        [tokenERC721.address, communityFeeCollector, router.address],
        [web3.utils.toWei("10"), 0],
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

  it("#setPaymentCollector - should fail to set new FeeCollector if not NFTOwner", async () => {
    await expectRevert(
      erc20Token.connect(user2).setPaymentCollector(user2.address),
      "ERC20Template: NOT PAYMENT MANAGER or OWNER"
    );
  });

  it("#setPaymentCollector - should succeed to set new paymentCollector if paymentManager", async () => {
    await erc20Token.connect(user3).setPaymentCollector(owner.address);

    assert((await erc20Token.getPaymentCollector()) == owner.address, 'PaymentCollector is not owner');
    await erc20Token.connect(user3).setPaymentCollector(user2.address);
    assert((await erc20Token.getPaymentCollector()) == user2.address, 'PaymentCollector is not user2');
  });

  it("#getERC721Address - should succeed to get the parent ERC721 address", async () => {
    const address = await erc20Token.connect(user3).getERC721Address();
    assert(address, "Not able to get the parent ERC721 address")
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

  it("#addPaymentManager - should fail to addPaymentManager if not erc20Deployer (permission to deploy the erc20Contract at 721 level)", async () => {
    assert((await erc20Token.permissions(user2.address)).paymentManager == false);

    await expectRevert(
      erc20Token.connect(user2).addPaymentManager(user2.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(user2.address)).paymentManager == false);
  });

  it("#addPaymentManager - should fail to addPaymentManager if it's already feeManager", async () => {
    assert((await erc20Token.permissions(user2.address)).paymentManager == false);

    await erc20Token.connect(user3).addPaymentManager(user2.address);

    assert((await erc20Token.permissions(user2.address)).paymentManager == true);

    await expectRevert(
      erc20Token.connect(user3).addPaymentManager(user2.address),
      "ERC20Roles:  ALREADY A FEE MANAGER"
    );
  });

  it("#addPaymentManager - should succeed to addPaymentManager if erc20Deployer (permission to deploy the erc20Contract at 721 level)", async () => {
    assert((await erc20Token.permissions(user2.address)).paymentManager == false);

    // owner is already erc20Deployer
    await erc20Token.connect(user3).addPaymentManager(user2.address);

    assert((await erc20Token.permissions(user2.address)).paymentManager == true);
  });

  it("#removeFeeManager - should fail to removeFeeManager if NOT erc20Deployer", async () => {
    await erc20Token.connect(user3).addPaymentManager(owner.address);

    assert((await erc20Token.permissions(owner.address)).paymentManager == true);

    await expectRevert(
      erc20Token.connect(user2).removePaymentManager(owner.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(owner.address)).paymentManager == true);
  });

  it("#removeFeeManager - should fail to removeFeeManager even if it's feeManager", async () => {
    // ERC20 deployer role add himself as manager and user2
    await erc20Token.connect(user3).addPaymentManager(owner.address);
    await erc20Token.connect(user3).addPaymentManager(user2.address);

    assert((await erc20Token.permissions(user2.address)).paymentManager == true);

    await expectRevert(
      erc20Token.connect(user2).removePaymentManager(owner.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(owner.address)).paymentManager == true);
  });

  it("#removeFeeManager - should succeed to removeFeeManager if erc20Deployer", async () => {
    await erc20Token.connect(user3).addPaymentManager(user2.address);

    assert((await erc20Token.permissions(user2.address)).paymentManager == true);

    await erc20Token.connect(user3).removePaymentManager(user2.address);

    assert((await erc20Token.permissions(user2.address)).paymentManager == false);
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
    await erc20Token.connect(user3).addPaymentManager(owner.address);
    // we set a new FeeCollector
    await erc20Token.connect(owner).setPaymentCollector(user2.address);
    assert((await erc20Token.getPaymentCollector()) == user2.address);
    // WE add 2 more minters
    await erc20Token.connect(user3).addMinter(user2.address);
    await erc20Token.connect(user3).addMinter(user4.address);
    assert((await erc20Token.permissions(user2.address)).minter == true);
    assert((await erc20Token.permissions(user4.address)).minter == true);

    // NFT Owner cleans
    await erc20Token.cleanPermissions();

    // check permission were removed
    assert((await erc20Token.permissions(owner.address)).minter == false);
    assert((await erc20Token.permissions(owner.address)).paymentManager == false);
    assert((await erc20Token.permissions(user2.address)).minter == false);
    assert((await erc20Token.permissions(user3.address)).minter == false);
    assert((await erc20Token.permissions(user4.address)).minter == false);
    // we reassigned feeCollector to address(0) when cleaning permissions, so now getPaymentCollector points to NFT Owner
    assert((await erc20Token.getPaymentCollector()) == owner.address);
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
    const deadline = (await provider.getBlockNumber()) + 50 // approx 10 minutes

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

  it("#startOrder - user should succeed to call startOrder on a ERC20 without publishFee", async () => {

    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceIndex = 1; // dummy index
    const providerFeeAddress = user5.address; // marketplace fee Collector
    const providerFeeAmount = 0; // fee to be collected on top, requires approval
    const providerFeeToken = mockErc20.address; // token address for the feeAmount, in this case DAI
    //sign provider data
    const providerData=JSON.stringify({ "timeout":0 })
    const providerValidUntil = 0;
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
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
    const tx = await erc20Token
      .connect(user2)
      .startOrder(
        consumer,
        serviceIndex,
        {
          providerFeeAddress: providerFeeAddress,
          providerFeeToken:providerFeeToken,
          providerFeeAmount:providerFeeAmount,
          v:signedMessage.v,
          r:signedMessage.r,
          s:signedMessage.s,
          providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
          validUntil:providerValidUntil
        },
        {
          consumeMarketFeeAddress: consumeMarketFeeAddress,
          consumeMarketFeeToken: consumeMarketFeeToken,
          consumeMarketFeeAmount: consumeMarketFeeAmount,
        }
      );
    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt, 'OrderStarted')
    assert(event, "Cannot find OrderStarted event")
    //make sure that we don't have 'PublishMarketFee') event
    event = getEventFromTx(txReceipt, 'PublishMarketFee')
    assert.typeOf(event, 'undefined',"PublishMarketFee event found")
    //make sure that we have ProviderFee event
    event = getEventFromTx(txReceipt, 'ProviderFee')
    assert(event, "Cannot find ProviderFee event")

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9"), 'Invalid user balance, DT was not substracted'
    );

    assert(
      (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getPaymentCollector())) ==
      web3.utils.toWei("0"), 'Invalid publisher reward, we should have burned the DT'
    );
  });

  it("#startOrder - user should succeed to call reuseOrder on a ERC20 using a previous txId", async () => {

    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceIndex = 1; // dummy index
    const providerFeeAddress = user5.address; // marketplace fee Collector
    const providerFeeAmount = 0; // fee to be collected on top, requires approval
    const providerFeeToken = mockErc20.address; // token address for the feeAmount, in this case DAI
    const providerValidUntil = 0;
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,

    //sign provider data
    const providerData=JSON.stringify({ "timeout":0 })
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
    const tx = await erc20Token
      .connect(user2)
      .startOrder(
        consumer,
        serviceIndex,
        {
          providerFeeAddress: providerFeeAddress,
          providerFeeToken:providerFeeToken,
          providerFeeAmount:providerFeeAmount,
          v:signedMessage.v,
          r:signedMessage.r,
          s:signedMessage.s,
          providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
          validUntil:providerValidUntil
        },
        {
          consumeMarketFeeAddress: consumeMarketFeeAddress,
          consumeMarketFeeToken: consumeMarketFeeToken,
          consumeMarketFeeAmount: consumeMarketFeeAmount,
        }
      );
    let txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt, 'OrderStarted')
    assert(event, "Cannot find OrderStarted event")
    //make sure that we don't have 'PublishMarketFee') event
    event = getEventFromTx(txReceipt, 'PublishMarketFee')
    assert.typeOf(event, 'undefined',"PublishMarketFee event found")
    //make sure that we have ProviderFee event
    event = getEventFromTx(txReceipt, 'ProviderFee')
    assert(event, "Cannot find ProviderFee event")

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9"), 'Invalid user balance, DT was not substracted'
    );

    assert(
      (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getPaymentCollector())) ==
      web3.utils.toWei("0"), 'Invalid publisher reward, we should have burned the DT'
    );
    const reuseTx = await erc20Token
      .connect(user2)
      .reuseOrder(
        txReceipt.transactionHash,
        {
          providerFeeAddress: providerFeeAddress,
          providerFeeToken:providerFeeToken,
          providerFeeAmount:providerFeeAmount,
          v:signedMessage.v,
          r:signedMessage.r,
          s:signedMessage.s,
          providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
          validUntil:providerValidUntil
        }
      );
    txReceipt = await reuseTx.wait();
    event = getEventFromTx(txReceipt, 'OrderReused')
    assert(event, "Cannot find OrderReused event")
    //make sure that we have ProviderFee event
    event = getEventFromTx(txReceipt, 'ProviderFee')
    assert(event, "Cannot find ProviderFee event")

  });
  
  it("#startOrder - user should succeed to call startOrder on a ERC20 without publishFee and provider Fee", async () => {

    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceIndex = 1; // dummy index
    const providerFeeAddress = user5.address; // marketplace fee Collector
    const providerFeeAmount = '1'; // fee to be collected on top, requires approval
    const providerFeeToken = mockErc20.address; // token address for the feeAmount, in this case DAI
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,

    // GET SOME consumeFeeToken
    const Mock20Contract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      mockErc20.address
    );
    await Mock20Contract
      .connect(owner)
      .transfer(user2.address, ethers.utils.parseEther(providerFeeAmount));

    // we approve the erc20Token contract to pull feeAmount (3 DAI)

    await Mock20Contract
      .connect(user2)
      .approve(erc20Token.address, web3.utils.toWei(providerFeeAmount));

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
    const tx = await erc20Token
      .connect(user2)
      .startOrder(
        consumer,
        serviceIndex,
        {
          providerFeeAddress: providerFeeAddress,
          providerFeeToken:providerFeeToken,
          providerFeeAmount:providerFeeAmount,
          v:signedMessage.v,
          r:signedMessage.r,
          s:signedMessage.s,
          providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
          validUntil:providerValidUntil
        },
        {
          consumeMarketFeeAddress: consumeMarketFeeAddress,
          consumeMarketFeeToken: consumeMarketFeeToken,
          consumeMarketFeeAmount: consumeMarketFeeAmount,
        }
      );
    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt, 'OrderStarted')
    assert(event, "Cannot find OrderStarted event")
    //make sure that we don't have 'PublishMarketFee') event
    event = getEventFromTx(txReceipt, 'PublishMarketFee')
    assert.typeOf(event, 'undefined',"PublishMarketFee event found")
    //make sure that we have ProviderFee event
    event = getEventFromTx(txReceipt, 'ProviderFee')
    assert(event, "Cannot find ProviderFee event")
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9"), 'Invalid user balance, DT was not substracted'
    );

    assert(
      (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getPaymentCollector())) ==
      web3.utils.toWei("0"), 'Invalid publisher reward, we should have burned the DT'
    );
  });

  it("#startOrder - user should not succeed to call startOrder on a ERC20 without publishFee and wrong provider Fee", async () => {

    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceIndex = 1; // dummy index
    const providerFeeAddress = user3.address; // marketplace fee Collector
    const providerFeeAmount = '1'; // fee to be collected on top, requires approval
    const providerFeeToken = mockErc20.address; // token address for the feeAmount, in this case DAI
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,

    // GET SOME consumeFeeToken
    const Mock20Contract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      mockErc20.address
    );
    await Mock20Contract
      .connect(owner)
      .transfer(user2.address, ethers.utils.parseEther(providerFeeAmount));

    // we approve the erc20Token contract to pull feeAmount (3 DAI)

    await Mock20Contract
      .connect(user2)
      .approve(erc20Token.address, web3.utils.toWei(providerFeeAmount));

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

    // providerFeeAddress is user3, but we are signing using user5 private key, so it should fail
    const signedMessage = await signMessage(message, user5.address);

    await expectRevert(
      erc20Token
      .connect(user2)
      .startOrder(
        consumer,
        serviceIndex,
        {
          providerFeeAddress: providerFeeAddress,
          providerFeeToken:providerFeeToken,
          providerFeeAmount:providerFeeAmount,
          v:signedMessage.v,
          r:signedMessage.r,
          s:signedMessage.s,
          providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
          validUntil:providerValidUntil
        },
        {
          consumeMarketFeeAddress: consumeMarketFeeAddress,
          consumeMarketFeeToken: consumeMarketFeeToken,
          consumeMarketFeeAmount: consumeMarketFeeAmount,
        }
      ),
      "Invalid provider fee"
    );
    
  });
  

  it("#startOrder - user should be able to get getPublishingMarketFee", async () => {
    const publishFee = await erc20TokenWithPublishFee
      .connect(user2)
      .getPublishingMarketFee();
    assert(publishFee[0] = publishMarketFeeAddress)
    assert(publishFee[1] = publishMarketFeeToken)
    assert(publishFee[2] = web3.utils.toWei(publishMarketFeeAmount))

  });


  //////////
  it("#startOrder - user should succeed to call startOrder on a ERC20 with 5 USDC publishFee, providerFee is ZEO", async () => {

    //MINT SOME DT20 to USER2 so he can start order
    await erc20TokenWithPublishFee.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceIndex = 1; // dummy index
    const providerFeeAddress = user5.address; // marketplace fee Collector
    const providerFeeAmount = 0; // fee to be collected on top, requires approval
    const providerFeeToken = mockErc20.address; // token address for the feeAmount, in this case DAI
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,

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
      .approve(erc20TokenWithPublishFee.address, publishFee[2]);
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
    const tx = await erc20TokenWithPublishFee
      .connect(user2)
      .startOrder(
        consumer,
        serviceIndex,
        {
          providerFeeAddress: providerFeeAddress,
          providerFeeToken:providerFeeToken,
          providerFeeAmount:providerFeeAmount,
          v:signedMessage.v,
          r:signedMessage.r,
          s:signedMessage.s,
          providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
          validUntil:providerValidUntil
        },
        {
          consumeMarketFeeAddress: consumeMarketFeeAddress,
          consumeMarketFeeToken: consumeMarketFeeToken,
          consumeMarketFeeAmount: consumeMarketFeeAmount,
        }
      );
    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt, 'OrderStarted')
    assert(event, "Cannot find OrderStarted event")
    event = getEventFromTx(txReceipt, 'PublishMarketFee')
    assert(event, "Cannot find PublishMarketFee event")
    //make sure that we have ProviderFee event
    event = getEventFromTx(txReceipt, 'ProviderFee')
    assert(event, "Cannot find ProviderFee event")
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("9"), 'Invalid user balance, DT was not substracted'
    );

    assert(
      (await erc20TokenWithPublishFee.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getPaymentCollector())) ==
      web3.utils.toWei("0"), 'Invalid publisher reward, we should have burned the DT'
    );
  });

  it("#startOrder - user should succeed to call startOrder on a ERC20 with 5 USDC publishFee, providerFee is not ZEO", async () => {

    //MINT SOME DT20 to USER2 so he can start order
    await erc20TokenWithPublishFee.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceIndex = 1; // dummy index
    const providerFeeAddress = user5.address; // marketplace fee Collector
    const providerFeeAmount = '1'; // fee to be collected on top, requires approval
    const providerFeeToken = mockErc20.address; // token address for the feeAmount, in this case DAI
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
    // GET SOME providerFeeToken
    const Mock20Contract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      providerFeeToken
    );
    await Mock20Contract
      .connect(owner)
      .transfer(user2.address, ethers.utils.parseEther(providerFeeAmount));
    await Mock20Contract
      .connect(user2)
      .approve(erc20TokenWithPublishFee.address, web3.utils.toWei(providerFeeAmount));

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
      .approve(erc20TokenWithPublishFee.address, publishFee[2]);
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
    const tx = await erc20TokenWithPublishFee
      .connect(user2)
      .startOrder(
        consumer,
        serviceIndex,
        {
          providerFeeAddress: providerFeeAddress,
          providerFeeToken:providerFeeToken,
          providerFeeAmount:providerFeeAmount,
          v:signedMessage.v,
          r:signedMessage.r,
          s:signedMessage.s,
          providerData:ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
          validUntil:providerValidUntil
        },
        {
          consumeMarketFeeAddress: consumeMarketFeeAddress,
          consumeMarketFeeToken: consumeMarketFeeToken,
          consumeMarketFeeAmount: consumeMarketFeeAmount,
        }
      );
    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt, 'OrderStarted')
    assert(event, "Cannot find OrderStarted event")
    event = getEventFromTx(txReceipt, 'PublishMarketFee')
    assert(event, "Cannot find PublishMarketFee event")
    //make sure that we have ProviderFee event
    event = getEventFromTx(txReceipt, 'ProviderFee')
    assert(event, "Cannot find ProviderFee event")
    assert(
      (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("9"), 'Invalid user balance, DT was not substracted'
    );

    assert(
      (await erc20TokenWithPublishFee.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getPaymentCollector())) ==
      web3.utils.toWei("0"), 'Invalid publisher reward, we should have burned the DT'
    );
  });

  it("#setPublishingMarketFee - user should not be able to set new publish fee", async () => {
    await expectRevert(
      erc20TokenWithPublishFee.connect(user2).setPublishingMarketFee(user2.address, erc20Token.address, web3.utils.toWei('10')),
      "ERC20Template: not publishMarketFeeAddress"
    );
    const publishFee = await erc20TokenWithPublishFee
      .connect(user2)
      .getPublishingMarketFee();
    assert(publishFee[0] = publishMarketFeeAddress)
    assert(publishFee[1] = publishMarketFeeToken)
    assert(publishFee[2] = web3.utils.toWei(publishMarketFeeAmount))
  });
  it("#setPublishingMarketFee - publishMarketAccount should not be able to set new publish fee", async () => {

    await erc20TokenWithPublishFee.connect(publishMarketAccount).setPublishingMarketFee(user2.address, erc20Token.address, web3.utils.toWei('10'))
    const publishFee = await erc20TokenWithPublishFee
      .connect(user2)
      .getPublishingMarketFee();
    assert(publishFee[0] = user2.address)
    assert(publishFee[1] = erc20Token.address)
    assert(publishFee[2] = web3.utils.toWei('10'))
  });
  it("#getId - should return templateId", async () => {
    const templateId = 2;
    assert((await erc20Token.getId()) == templateId);
  });
  it("#burn - user should succeed to burn tokens", async () => {

    //MINT SOME DT20 to USER2 so he can try to burn
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    const burnAmount = web3.utils.toWei("2")
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
      , 'Invalid user balance, DT was not minted'
    );
    const totalSupply = await erc20Token.totalSupply()

    await erc20Token
      .connect(user2)
      .burn(burnAmount);


    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("8"), 'Invalid user balance, DT was not substracted'
    );
    const newTotalSupply = await erc20Token.totalSupply()
    const expectedSupply = totalSupply.sub(burnAmount)
    assert(
      (totalSupply.sub(burnAmount).eq(newTotalSupply))
      , 'Invalid total supply'
    );
  });
  it("#burnFrom - user3 should succeed to burn some user2's tokens using burnFrom", async () => {

    //MINT SOME DT20 to USER2 so he can try to burn
    await erc20Token.connect(user3).mint(user2.address, web3.utils.toWei("10"));
    const burnAmount = web3.utils.toWei("2")
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
      , 'Invalid user balance, DT was not minted'
    );
    const totalSupply = await erc20Token.totalSupply()
    //allow user3 to burn
    await erc20Token.connect(user2).approve(user3.address, web3.utils.toWei(burnAmount));
    await erc20Token
      .connect(user3)
      .burnFrom(user2.address, burnAmount);


    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("8"), 'Invalid user balance, DT were not burned'
    );
    const newTotalSupply = await erc20Token.totalSupply()
    const expectedSupply = totalSupply.sub(burnAmount)
    assert(
      (totalSupply.sub(burnAmount).eq(newTotalSupply))
      , 'Invalid total supply'
    );

  });


  it('#Enterprise - buyFromDispenserAndOrder', async () => {
    // create an ERC20 with publish Fee ( 5 USDC, going to publishMarketAddress)
    const trxEnterpriseERC20 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1P", "ERC20DT1SymbolP"],
      [user3.address, user6.address, publishMarketFeeAddress, publishMarketFeeToken],
      [cap, web3.utils.toWei(publishMarketFeeAmount)],
      []

    );
    const trxReceiptEnterpriseERC20 = await trxEnterpriseERC20.wait();
    const event = getEventFromTx(trxReceiptEnterpriseERC20, 'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    const erc20Address = event.args[0];
    EnterpriseToken = await ethers.getContractAt("ERC20TemplateEnterprise", erc20Address);
    assert(await EnterpriseToken.totalSupply() == 0, "Invalid Total Supply")
    let tx = await EnterpriseToken.connect(user3).createDispenser(
      dispenser.address, web3.utils.toWei('1'), web3.utils.toWei('1'), true,addressZero)
    assert(tx,
      'Cannot activate dispenser')
    let txReceipt = await tx.wait();
    const status = await dispenser.status(EnterpriseToken.address)
    assert(status.active === true, 'Dispenser not active')
    assert(status.owner === user3.address, 'Dispenser owner is not alice')
    assert(status.isMinter === true, 'Dispenser is not a minter')

    await expectRevert(
      dispenser
        .connect(user4)
        .dispense(EnterpriseToken.address, web3.utils.toWei('1'), user4.address),
      "This address is not allowed to request DT"
    );

    //let's get publishMarketFee and transfer tokens
   
    const publishFee = await EnterpriseToken
      .connect(user2)
      .getPublishingMarketFee();
    // GET SOME consumeFeeToken // TODO:HERE 
    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      publishFee[1]
    );
    await Mock20DecimalContract
      .connect(owner)
      .transfer(user3.address, publishFee[2]);

    // we approve the erc20Token contract to pull feeAmount
    await Mock20DecimalContract
      .connect(user3)
      .approve(EnterpriseToken.address, publishFee[2]);
    
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
    const providerFeeAmount = "0"
    const providerFeeAddress = user5.address
    //sign provider data
    const providerData=JSON.stringify({ "timeout":0 })
    const providerValidUntil = 0;
    const providerFeeToken = addressZero;
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

    //let's order in one click
    tx = await EnterpriseToken.connect(user3).buyFromDispenserAndOrder(
      {
        "consumer": user2.address,
        "serviceIndex": 1,
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
      dispenser.address)
    assert(tx,
      'buyFromDispenserAndOrder failed')
    txReceipt = await tx.wait();

    assert(await EnterpriseToken.totalSupply() == web3.utils.toWei('0'), "Invalid Total Supply")
    
  
  

    const balancePublish = await Mock20DecimalContract.balanceOf(publishFee[0])
    const balanceOpfPublish = await Mock20DecimalContract.balanceOf(opcCollector.address)
    const expectedPublish = new BN(publishFee[2].toString())
    const expectedOpfPublish = new BN(publishFee[2].toString()).div(new BN(100))

    
    assert(balancePublish.toString() === expectedPublish.toString(), 'Invalid publish Fee')


    assert(
      (await EnterpriseToken.balanceOf(user3.address)) == web3.utils.toWei("0")
    );

    assert(
      (await EnterpriseToken.balanceOf(await EnterpriseToken.getPaymentCollector())) ==
      web3.utils.toWei("0"), 'Invalid publisher reward, we should have burned the DT'
    );
  })


  it('#Enterprise - buyFromFreAndOrder with dynamic market fee at 0%', async () => {

    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      publishMarketFeeToken
    );

    // create an ERC20 with publish Fee ( 5 USDC, going to publishMarketAddress)
    const trxEnterpriseERC20 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1P", "ERC20DT1SymbolP"],
      [user3.address, user6.address, publishMarketFeeAddress, publishMarketFeeToken],
      [cap, web3.utils.toWei(publishMarketFeeAmount)],
      []

    );
    const trxReceiptEnterpriseERC20 = await trxEnterpriseERC20.wait();
    let event = getEventFromTx(trxReceiptEnterpriseERC20, 'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    const erc20Address = event.args[0];
    EnterpriseToken = await ethers.getContractAt("ERC20TemplateEnterprise", erc20Address);
    assert(await EnterpriseToken.totalSupply() == 0, "Invalid Total Supply")

    let tx = await EnterpriseToken.connect(user3).createFixedRate(
      fixedRateExchange.address,
      [publishMarketFeeToken, user3.address, user3.address, ZERO_ADDRESS],
      ['18', '18', web3.utils.toWei("1"), web3.utils.toWei("0.01"), 1, 0]
    )



    assert(tx,
      'Cannot create fixed rate exchange')

    let txReceipt = await tx.wait();
    event = getEventFromTx(txReceipt, 'NewFixedRate')
    const exchangeId = event.args[0]
    const status = await fixedRateExchange.getExchange(exchangeId)
    assert(status.active === true, 'FRE not active')
    assert(status.withMint === true, 'FRE is not a minter')
    // let's make sure that nobody else can buy DT
    await expectRevert(
      fixedRateExchange
        .connect(user4)
        .buyDT(exchangeId, web3.utils.toWei('1'), web3.utils.toWei('1'),addressZero, 0),
      "FixedRateExchange: This address is not allowed to swap"
    );

    //let's get publishMarketFee and transfer tokens
   
    const publishFee = await EnterpriseToken
      .connect(user2)
      .getPublishingMarketFee();
    // GET SOME consumeFeeToken
    await Mock20DecimalContract
      .connect(owner)
      .transfer(user3.address, publishFee[2]);
    //transfer tokens to pay for FRE.  We are transfering 1.5, because we need to pay 1 + fee
    await Mock20DecimalContract
      .connect(owner)
      .transfer(user3.address, web3.utils.toWei('1.5'));
    const totalToApprove = publishFee[2].add(web3.utils.toWei('1.5'))
    // we approve the erc20Token contract to pull feeAmount
    await Mock20DecimalContract
      .connect(user3)

      .approve(EnterpriseToken.address, totalToApprove);
    
    // we store balance of user5 which is the one who's going to get the dynamic market fee
      const user5BalBeforBuy =  await Mock20DecimalContract.balanceOf(user5.address)
      const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,

    const providerFeeAmount = "0"
    const providerFeeAddress = user5.address
    const providerFeeToken = addressZero;
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
    //let's order in one click
    tx = await EnterpriseToken.connect(user3).buyFromFreAndOrder(
      {
        "consumer": user2.address,
        "amount": web3.utils.toWei("1"),
        "serviceIndex": 1,
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
        "exchangeContract": fixedRateExchange.address,
        "exchangeId": exchangeId,
        "maxBaseTokenAmount": web3.utils.toWei("2"),
        "swapMarketFee":0,
        "marketFeeAddress":user5.address
      }
    )
    assert(tx,
      'buyFromFreAndOrder failed')
    txReceipt = await tx.wait();
    assert(await EnterpriseToken.totalSupply() == web3.utils.toWei('0'), "Invalid Total Supply")

    
   
    

    const balancePublish = await Mock20DecimalContract.balanceOf(publishFee[0])
    const balanceOpfPublish = await Mock20DecimalContract.balanceOf(opcCollector.address)
    const expectedPublish = new BN(publishFee[2].toString())
    const expectedOpfPublish = new BN(publishFee[2].toString()).div(new BN(100))

  
    assert(balancePublish.toString() === expectedPublish.toString(), 'Invalid publish Fee')


    assert(
      (await EnterpriseToken.balanceOf(user3.address)) == web3.utils.toWei("0")
    );

    assert(
      (await EnterpriseToken.balanceOf(await EnterpriseToken.getPaymentCollector())) ==
      web3.utils.toWei("0"), 'Invalid publisher reward, we should have burned the DT'
    );

  })

  it('#Enterprise - buyFromFreAndOrder with dynamic market fee at 0.1%', async () => {

    const Mock20DecimalContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      publishMarketFeeToken
    );

    // create an ERC20 with publish Fee ( 5 USDC, going to publishMarketAddress)
    const trxEnterpriseERC20 = await tokenERC721.connect(user3).createERC20(1,
      ["ERC20DT1P", "ERC20DT1SymbolP"],
      [user3.address, user6.address, publishMarketFeeAddress, publishMarketFeeToken],
      [cap, web3.utils.toWei(publishMarketFeeAmount)],
      []

    );
    const trxReceiptEnterpriseERC20 = await trxEnterpriseERC20.wait();
    let event = getEventFromTx(trxReceiptEnterpriseERC20, 'TokenCreated')
    assert(event, "Cannot find TokenCreated event")
    const erc20Address = event.args[0];
    EnterpriseToken = await ethers.getContractAt("ERC20TemplateEnterprise", erc20Address);
    assert(await EnterpriseToken.totalSupply() == 0, "Invalid Total Supply")

    let tx = await EnterpriseToken.connect(user3).createFixedRate(
      fixedRateExchange.address,
      [publishMarketFeeToken, user3.address, user3.address, ZERO_ADDRESS],
      ['18', '18', web3.utils.toWei("1"), web3.utils.toWei("0.01"), 1, 0]
    )



    assert(tx,
      'Cannot create fixed rate exchange')

    let txReceipt = await tx.wait();
    event = getEventFromTx(txReceipt, 'NewFixedRate')
    const exchangeId = event.args[0]
    const status = await fixedRateExchange.getExchange(exchangeId)
    assert(status.active === true, 'FRE not active')
    assert(status.withMint === true, 'FRE is not a minter')
    // let's make sure that nobody else can buy DT
    await expectRevert(
      fixedRateExchange
        .connect(user4)
        .buyDT(exchangeId, web3.utils.toWei('1'), web3.utils.toWei('1'),addressZero, 0),
      "FixedRateExchange: This address is not allowed to swap"
    );

    //let's get publishMarketFee and transfer tokens
  
    const publishFee = await EnterpriseToken
      .connect(user2)
      .getPublishingMarketFee();
    // GET SOME consumeFeeToken
    await Mock20DecimalContract
      .connect(owner)
      .transfer(user3.address, publishFee[2]);
    //transfer tokens to pay for FRE.  We are transfering 1.5, because we need to pay 1 + fee
    await Mock20DecimalContract
      .connect(owner)
      .transfer(user3.address, web3.utils.toWei('1.5'));
    const totalToApprove = publishFee[2].add(web3.utils.toWei('1.5'))
    // we approve the erc20Token contract to pull feeAmount
    await Mock20DecimalContract
      .connect(user3)

      .approve(EnterpriseToken.address, totalToApprove);
  
    //let's order in one click
    const user5BalBeforBuy =  await Mock20DecimalContract.balanceOf(user5.address)
    const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
    const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
    const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,

    const providerFeeAmount = "0"
    const providerFeeAddress = user5.address
    const providerFeeToken = addressZero;
    const providerData=JSON.stringify({ "timeout":0 })
    const providerValidUntil = 0;
    //sign provider data
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
    tx = await EnterpriseToken.connect(user3).buyFromFreAndOrder(
      {
        "consumer": user2.address,
        "amount": web3.utils.toWei("1"),
        "serviceIndex": 1,
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
        "exchangeContract": fixedRateExchange.address,
        "exchangeId": exchangeId,
        "maxBaseTokenAmount": web3.utils.toWei("2"),
        "swapMarketFee":web3.utils.toWei("0.001"),//1e15 => 0.1%
        "marketFeeAddress":user5.address
      }
    )
    assert(tx,
      'buyFromFreAndOrder failed')
    txReceipt = await tx.wait();
    assert(await EnterpriseToken.totalSupply() == web3.utils.toWei('0'), "Invalid Total Supply")

    


    const balancePublish = await Mock20DecimalContract.balanceOf(publishFee[0])
    const balanceOpfPublish = await Mock20DecimalContract.balanceOf(opcCollector.address)
    const expectedPublish = new BN(publishFee[2].toString())
    const expectedOpfPublish = new BN(publishFee[2].toString()).div(new BN(100))

  
    assert(balancePublish.toString() === expectedPublish.toString(), 'Invalid publish Fee')


    assert(
      (await EnterpriseToken.balanceOf(user3.address)) == web3.utils.toWei("0")
    );

    assert(
      (await EnterpriseToken.balanceOf(await EnterpriseToken.getPaymentCollector())) ==
      web3.utils.toWei("0"), 'Invalid publisher reward, we should have burned the DT'
    );

  })

  it("#orderExecuted - provider should succeed to call orderExecuted on a ERC20", async () => {
    const orderTxId = '0x826e9781f191ef2b4cee95eac10cfeced2bd1bd340e3f079304e3bfdd6a56106'
    const providerData="some provider data"
    const providerAddress = user5.address
    const providerMessage = ethers.utils.solidityKeccak256(["bytes32", "bytes"], [orderTxId, ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData))]);
    const providerSignature = await web3.eth.sign(providerMessage, providerAddress);
    const consumerData="12345";
    const consumerAddress = user2.address
    const consumerMessage = ethers.utils.solidityKeccak256(['bytes'],[ethers.utils.hexlify(ethers.utils.toUtf8Bytes(consumerData))]);
    const consumerSignature = await web3.eth.sign(consumerMessage, consumerAddress);
    const tx = await erc20Token
      .connect(user5)
      .orderExecuted(orderTxId,
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)), providerSignature, 
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(consumerData)), consumerSignature, consumerAddress);
    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt, 'OrderExecuted')
    assert(event, "Cannot find OrderExecuted event")
  });

  it("#orderExecuted - provider should fail to call orderExecuted on a ERC20 if consumerAddress == providerAddress", async () => {
    const orderTxId = '0x826e9781f191ef2b4cee95eac10cfeced2bd1bd340e3f079304e3bfdd6a56106'
    const providerData="some provider data"
    const providerAddress = user5.address
    const providerMessage = ethers.utils.solidityKeccak256(["bytes32", "bytes"], [orderTxId, ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData))]);
    const providerSignature = await web3.eth.sign(providerMessage, providerAddress);
    const consumerData="12345";
    const consumerAddress = user5.address
    const consumerMessage = ethers.utils.solidityKeccak256(['bytes'],[ethers.utils.hexlify(ethers.utils.toUtf8Bytes(consumerData))]);
    const consumerSignature = await web3.eth.sign(consumerMessage, consumerAddress);
    await expectRevert(
      erc20Token.connect(user5).orderExecuted(orderTxId,
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)), providerSignature, 
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(consumerData)), consumerSignature, consumerAddress),
      'Provider cannot be the consumer')
  });
  it("#orderExecuted - provider should fail to call orderExecuted on a ERC20 if consumerAddress is not the signer of consumerData", async () => {
    const orderTxId = '0x826e9781f191ef2b4cee95eac10cfeced2bd1bd340e3f079304e3bfdd6a56106'
    const providerData="some provider data"
    const providerAddress = user5.address
    const providerMessage = ethers.utils.solidityKeccak256(["bytes32", "bytes"], [orderTxId, ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData))]);
    const providerSignature = await web3.eth.sign(providerMessage, providerAddress);
    const consumerData="12345";
    const consumerAddress = user2.address
    const consumerMessage = ethers.utils.solidityKeccak256(['bytes'],[ethers.utils.hexlify(ethers.utils.toUtf8Bytes(consumerData))]);
    const consumerSignature = await web3.eth.sign(consumerMessage, user3.address);
    await expectRevert(erc20Token
      .connect(user5)
      .orderExecuted(orderTxId,
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)), providerSignature, 
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(consumerData)), consumerSignature, consumerAddress),
      'Consumer signature check failed')
  });
  it("#orderExecuted - provider should fail to call orderExecuted on a ERC20 if msg.sender is not the signer of providerData", async () => {
    const orderTxId = '0x826e9781f191ef2b4cee95eac10cfeced2bd1bd340e3f079304e3bfdd6a56106'
    const providerData="some provider data"
    const providerAddress = user5.address
    const providerMessage = ethers.utils.solidityKeccak256(["bytes32", "bytes"], [orderTxId, ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData))]);
    const providerSignature = await web3.eth.sign(providerMessage, providerAddress);
    const consumerData="12345";
    const consumerAddress = user2.address
    const consumerMessage = ethers.utils.solidityKeccak256(['bytes'],[ethers.utils.hexlify(ethers.utils.toUtf8Bytes(consumerData))]);
    const consumerSignature = await web3.eth.sign(consumerMessage, consumerAddress);
    await expectRevert(erc20Token
      .connect(user3)
      .orderExecuted(orderTxId,
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)), providerSignature, 
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(consumerData)), consumerSignature, consumerAddress),
      'Provider signature check failed')
  });

});