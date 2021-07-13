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
    erc20Token;

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";

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
    const ERC20Factory = await ethers.getContractFactory("ERC20Factory");

    const Metadata = await ethers.getContractFactory("Metadata");

    [owner, reciever, user2, user3, provider] = await ethers.getSigners();

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

    // WE add owner as erc20Deployer so he can deploy an new erc20Contract
    await tokenERC721.addToCreateERC20List(owner.address);

    receipt = await (
      await tokenERC721.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("1000"),
        1,
        owner.address
      )
    ).wait();
    const events = receipt.events.filter((e) => e.event === "ERC20Created");
    //console.log(events[0].args.erc20Address)
    erc20Token = await ethers.getContractAt(
      "ERC20Template",
      events[0].args.erc20Address
    );
    assert((await erc20Token.name()) === "ERC20DT1");
    assert((await erc20Token.symbol()) === "ERC20DT1Symbol");
  });

  it("#isInitialized - should check that the erc20Token contract is initialized", async () => {
    expect(await erc20Token.isInitialized()).to.equal(true);
  });

  it("#initialize - should fail to re-initialize the contracts", async () => {
    await expectRevert(
      erc20Token.initialize(
        "ERC20DT1",
        "ERC20DT1Symbol",
        tokenERC721.address,
        web3.utils.toWei("10"),
        communityFeeCollector,
        owner.address
      ),
      "ERC20Template: token instance already initialized"
    );
  });

  it("#mint - owner should succeed to mint 1 ERC20Token to user2", async () => {
    await erc20Token.mint(user2.address, web3.utils.toWei("1"));
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
    await erc20Token.addFeeManager(owner.address);

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

    await erc20Token.addMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == true);

    await expectRevert(
      erc20Token.addMinter(user2.address),
      "ERC20Roles:  ALREADY A MINTER"
    );
  });

  it("#addMinter - should succeed to addMinter if erc20Deployer (permission to deploy the erc20Contract at 721 level)", async () => {
    assert((await erc20Token.permissions(user2.address)).minter == false);

    // owner is already erc20Deployer
    await erc20Token.addMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == true);
  });

  it("#removeMinter - should fail to removeMinter if NOT erc20Deployer", async () => {
    assert((await erc20Token.permissions(owner.address)).minter == true);

    await expectRevert(
      erc20Token.connect(user2).removeMinter(owner.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(owner.address)).minter == true);
  });

  it("#removeMinter - should fail to removeMinter even if it's minter", async () => {
    await erc20Token.addMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == true);

    await expectRevert(
      erc20Token.connect(user2).removeMinter(owner.address),
      "ERC20Template: NOT DEPLOYER ROLE"
    );

    assert((await erc20Token.permissions(owner.address)).minter == true);
  });

  it("#removeMinter - should succeed to removeMinter if erc20Deployer", async () => {
    await erc20Token.addMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == true);

    await erc20Token.removeMinter(user2.address);

    assert((await erc20Token.permissions(user2.address)).minter == false);
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

    await erc20Token.setData(value);

    assert((await tokenERC721.getData(key)) == value);
  });

  it("#cleanPermissions - should fail to call cleanPermissions if NOT NFTOwner", async () => {
    assert((await erc20Token.permissions(owner.address)).minter == true);

    await expectRevert(
      erc20Token.connect(user2).cleanPermissions(),
      "ERC20Template: not NFTOwner"
    );

    assert((await erc20Token.permissions(owner.address)).minter == true);
  });

  it("#cleanPermissions - should succeed to call cleanPermissions if NFTOwner", async () => {
    // owner is already minter
    assert((await erc20Token.permissions(owner.address)).minter == true);
    await erc20Token.addFeeManager(owner.address);
    // we set a new FeeCollector
    await erc20Token.setFeeCollector(user2.address);
    assert((await erc20Token.getFeeCollector()) == user2.address);
    // WE add 2 more minters
    await erc20Token.addMinter(user2.address);
    await erc20Token.addMinter(user3.address);
    assert((await erc20Token.permissions(user2.address)).minter == true);
    assert((await erc20Token.permissions(user3.address)).minter == true);

    // NFT Owner cleans
    await erc20Token.cleanPermissions();

    // check permission were removed
    assert((await erc20Token.permissions(owner.address)).minter == false);
    assert((await erc20Token.permissions(owner.address)).feeManager == false);
    assert((await erc20Token.permissions(user2.address)).minter == false);
    assert((await erc20Token.permissions(user3.address)).minter == false);

    // we reassigned feeCollector to address(0) when cleaning permissions, so now getFeeCollector points to NFT Owner
    assert((await erc20Token.getFeeCollector()) == owner.address);
  });

  it("#permit - should succeed to deposit with permit function", async () => {
    // mint some DT to owner
    await erc20Token.mint(owner.address, web3.utils.toWei("100"));

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

  it("#startOrder - user should succeed to call startOrder, FEE on top is ZERO", async () => {
    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceId = 1; // dummy index
    const marketFeeCollector = user3.address; // marketplace fee Collector
    const feeAmount = 0; // fee to be collected on top, requires approval
    const feeToken = "0x6b175474e89094c44da98b954eedeac495271d0f"; // token address for the feeAmount, in this case DAI

    await erc20Token
      .connect(user2)
      .startOrder(
        consumer,
        dtAmount,
        serviceId,
        marketFeeCollector,
        feeToken,
        feeAmount
      );

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9")
    );

    assert(
      (await erc20Token.balanceOf(communityFeeCollector)) ==
        web3.utils.toWei("0.001")
    );
    assert(
      (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("0.001")
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getFeeCollector())) ==
        web3.utils.toWei("0.998")
    );
  });

  it("#startOrder - user should succeed to call startOrder, FEE on top is 3 DAI", async () => {
    const feeToken = "0x6b175474e89094c44da98b954eedeac495271d0f"; // token address for the feeAmount, in this case DAI
    // GET SOME DAI (A NEW TOKEN different from OCEAN)
    const userWithDAI = "0xB09cD60ad551cE7fF6bc97458B483A8D50489Ee7";

    await impersonate(userWithDAI);

    daiContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      feeToken
    );
    signer = ethers.provider.getSigner(userWithDAI);
    await daiContract
      .connect(signer)
      .transfer(user2.address, ethers.utils.parseEther("100"));

    // we approve the erc20Token contract to pull feeAmount (10 DAI)

    await daiContract
      .connect(user2)
      .approve(erc20Token.address, web3.utils.toWei("3"));

    //MINT SOME DT20 to USER2 so he can start order
    await erc20Token.mint(user2.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const serviceId = 1; // dummy index
    const marketFeeCollector = user3.address; // marketplace fee Collector
    const feeAmount = web3.utils.toWei("3"); // fee to be collected on top, requires approval

    await erc20Token
      .connect(user2)
      .startOrder(
        consumer,
        dtAmount,
        serviceId,
        marketFeeCollector,
        feeToken,
        feeAmount
      );

    assert(
      (await daiContract.balanceOf(marketFeeCollector)) == web3.utils.toWei("8")
    ); // marketFeeCollector has already 5 DAI so it's 8

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("9")
    );

    assert(
      (await erc20Token.balanceOf(communityFeeCollector)) ==
        web3.utils.toWei("0.001")
    );
    assert(
      (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("0.001")
    );
    assert(
      (await erc20Token.balanceOf(await erc20Token.getFeeCollector())) ==
        web3.utils.toWei("0.998")
    );
  });

  it("#finishOrder - provider calls finish Order and refunds user2", async () => {
    //MINT SOME DT20 to PROVIDER so he can refund a user
    await erc20Token.mint(provider.address, web3.utils.toWei("10"));
    assert(
      (await erc20Token.balanceOf(provider.address)) == web3.utils.toWei("10")
    );
    const consumer = user2.address; // could be different user
    const dtAmount = web3.utils.toWei("1");
    const orderTxId = web3.utils.keccak256("0x01"); // dummy orderTxId
    const serviceId = 1;

    assert(
      (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("0")
    );

    // PROVIDER CALLS FINISH ORDER AND REFUNDS 1 DT to USER2.
    await erc20Token
      .connect(provider)
      .finishOrder(orderTxId, consumer, dtAmount, serviceId);

    assert((await erc20Token.balanceOf(user2.address)) == dtAmount);
    assert(
      (await erc20Token.balanceOf(provider.address)) == web3.utils.toWei("9")
    );
  });
});
