/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { getContractFactory } = require("@nomiclabs/hardhat-ethers/types");
const ethers = hre.ethers;

describe("OceanPoolFactory", () => {
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
    daiConract,
    balContract,
    erc20DTContract,
    vault,
    signer;

  const oceanAddress = "0x967da4048cd07ab37855c090aaf366e4ce1b9f48";
  const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
  const balAddress = "0xba100000625a3754423978a60c9317c58a424e3D";
  const vaultAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
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
    const Router = await ethers.getContractFactory("OceanPoolFactoryRouter");
    const OceanPoolFactory = await ethers.getContractFactory(
      "OceanPoolFactory"
    );
    vault = await ethers.getContractAt(
      "@balancer-labs/v2-vault/contracts/interfaces/IVault.sol:IVault",
      vaultAddress
    );

    [owner, reciever, user2, user3] = await ethers.getSigners();
    // DEPLOY ROUTER, SETTING OWNER
    router = await Router.deploy(owner.address, oceanAddress);
    // DEPLOY OUR POOL FACTORY
    poolFactory = await OceanPoolFactory.deploy(
      vaultAddress,
      router.address,
      owner.address
    );
    // ADD THE FACTORY ADDRESS TO THE ROUTER
    await router.addOceanPoolFactory(poolFactory.address);

    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);
    metadata = await Metadata.deploy();

    templateERC20 = await ERC20Template.deploy();
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );
    templateERC721 = await ERC721Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC721.address,
      communityFeeCollector,
      factoryERC20.address
    );

    newERC721Template = await ERC721Template.deploy();

    await metadata.setERC20Factory(factoryERC20.address);
    await factoryERC20.setERC721Factory(factoryERC721.address);

    const tx = await factoryERC721.deployERC721Contract(
      "DT1",
      "DTSYMBOL",
      metadata.address,
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

    // TODO: create function to pack these steps (getting tokens for creating pools)

    // GET SOME OCEAN TOKEN FROM OUR MAINNET FORK
    const userWithOcean = "0x53aB4a93B31F480d17D3440a6329bDa86869458A";
    await impersonate(userWithOcean);

    oceanContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      oceanAddress
    );
    signer = ethers.provider.getSigner(userWithOcean);
    await oceanContract
      .connect(signer)
      .transfer(owner.address, ethers.utils.parseEther("10000"));

    assert(
      (await oceanContract.balanceOf(owner.address)).toString() ==
        ethers.utils.parseEther("10000")
    );

    // GET SOME DAI (A NEW TOKEN different from OCEAN)
    const userWithDAI = "0xB09cD60ad551cE7fF6bc97458B483A8D50489Ee7";

    await impersonate(userWithDAI);

    daiContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      daiAddress
    );
    signer = ethers.provider.getSigner(userWithDAI);
    await daiContract
      .connect(signer)
      .transfer(owner.address, ethers.utils.parseEther("10000"));

    assert(
      (await daiContract.balanceOf(owner.address)).toString() ==
        ethers.utils.parseEther("10000")
    );

    const userWithBAL = "0x31aAc66fA0bbF9618aCeBa5d4c4d599edD0FBCFC";
    await impersonate(userWithBAL);

    balContract = await ethers.getContractAt(
      "contracts/interfaces/IERC20.sol:IERC20",
      balAddress
    );
    signer = ethers.provider.getSigner(userWithBAL);
    await balContract
      .connect(signer)
      .transfer(owner.address, ethers.utils.parseEther("300"));

    assert(
      (await balContract.balanceOf(owner.address)).toString() ==
        ethers.utils.parseEther("300")
    );

    // INITIAL SET UP, THE MANAGER ADDS A NEW ROLE FOR ITSELF (erc20Deployer role)
    await tokenERC721.addToCreateERC20List(owner.address);

    // WE THEN CREATE A NEW ERC20 CONTRACT
    let receipt = await (
      await tokenERC721.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("1000"),
        1,
        owner.address
      )
    ).wait();
    const newERC20DT = receipt.events[3].args.erc20Address;

    erc20DTContract = await ethers.getContractAt("ERC20Template", newERC20DT);

    // // WE ADD OURSELF AS MINTER AND THEN MINT SOME ERC20 DATATOKEN.
    // await erc20DTContract.addMinter(owner.address);
    await erc20DTContract.mint(owner.address, web3.utils.toWei("100"));
    assert(
      (await erc20DTContract.balanceOf(owner.address)) ==
        web3.utils.toWei("100")
    );
  });

  it("#vault_ - should confirm vaultAddress", async () => {
    assert((await poolFactory.vault_()) == vaultAddress);
  });

  it("#oceanRouter - should confirm Ocean router address", async () => {
    assert((await poolFactory.oceanRouter()) == router.address);
  });

  it("#createPool - should fail to create new Pool if NOT OCEAN ROUTER", async () => {
    const tokens = [erc20DTContract.address, oceanAddress];
    const weights = [
      ethers.utils.parseEther("0.5"),
      ethers.utils.parseEther("0.5"),
    ];

    const NAME = "Two-token Pool";
    const SYMBOL = "OCEAN-DT-50-50";
    const swapFeePercentage = 3e15; // 0.3%
    const marketFee = 1e15;
    const oceanFee = 5e15;

    // CREATE BALANCER POOL THROUGH THE ROUTER
    await expectRevert(
      poolFactory.createPool(
        NAME,
        SYMBOL,
        tokens,
        weights,
        swapFeePercentage,
        oceanFee,
        marketFee,
        owner.address
      ),
      "OceanPoolFactory: NOT OCEAN ROUTER"
    );
  });

  it("#createPool - should fail to create new Pool if BalV2 == false", async () => {
    // IMPERSONATE ROUTER ADDRESS
    await impersonate(router.address);
    signer = ethers.provider.getSigner(router.address);

    // WE FIRST SET BALV2 to false (is true as default)
    await poolFactory.updateBalV2Status(false);

    const tokens = [erc20DTContract.address, oceanAddress];
    const weights = [
      ethers.utils.parseEther("0.5"),
      ethers.utils.parseEther("0.5"),
    ];

    const NAME = "Two-token Pool";
    const SYMBOL = "OCEAN-DT-50-50";
    const swapFeePercentage = 3e15; // 0.3%
    const marketFee = 1e15;
    const oceanFee = 5e15;

    // CREATE BALANCER POOL THROUGH THE ROUTER
    await expectRevert(
      poolFactory
        .connect(signer)
        .createPool(
          NAME,
          SYMBOL,
          tokens,
          weights,
          swapFeePercentage,
          oceanFee,
          marketFee,
          owner.address
        ),
      "OceanPoolFactory: Bal V2 not available on this network"
    );
  });

  it("#createPool - should succeed to create(From ROUTER) and provide initial liquidity(generic user) into a new Pool WITH OceanToken from our Custom Factory on Balancer V2", async () => {
    // IMPERSONATE ROUTER ADDRESS
    await impersonate(router.address);
    signer = ethers.provider.getSigner(router.address);

    const tokens = [erc20DTContract.address, oceanAddress];
    const weights = [
      ethers.utils.parseEther("0.5"),
      ethers.utils.parseEther("0.5"),
    ];

    const NAME = "Two-token Pool";
    const SYMBOL = "OCEAN-DT-50-50";
    const swapFeePercentage = 3e15; // 0.3%
    const oceanFee = 5e15;
    const marketFee = 1e15;

    // CREATE BALANCER POOL THROUGH THE ROUTER
    receipt = await (
      await poolFactory
        .connect(signer)
        .createPool(
          NAME,
          SYMBOL,
          tokens,
          weights,
          swapFeePercentage,
          oceanFee,
          marketFee,
          owner.address
        )
    ).wait();

    const events = receipt.events.filter((e) => e.event === "PoolCreated");

    const poolAddress = events[0].args.pool;

    const pool = await ethers.getContractAt("WeightedPool", poolAddress);
    const poolID = await pool.getPoolId();

    const initialBalances = [
      ethers.utils.parseEther("10"),
      ethers.utils.parseEther("1000"),
    ];
    const JOIN_KIND_INIT = 0;

    // Construct magic userData
    const initUserData = ethers.utils.defaultAbiCoder.encode(
      ["uint256", "uint256[]"],
      [JOIN_KIND_INIT, initialBalances]
    );
    const joinPoolRequest = {
      assets: tokens,
      maxAmountsIn: initialBalances,
      userData: initUserData,
      fromInternalBalance: false,
    };

    // APPROVE VAULT FOR OCEAN AND ERC20DT
    await oceanContract.approve(
      vaultAddress,
      ethers.utils.parseEther("1000000000")
    );

    await erc20DTContract.approve(
      vaultAddress,
      ethers.utils.parseEther("1000000000")
    );

    // JOIN POOL (ADD LIQUIDITY)
    const tx = await vault.joinPool(
      poolID,
      owner.address,
      owner.address,
      joinPoolRequest
    );

    receipt = await tx.wait();

    // WE CHECK IF THE POOL HAS BEEN REGISTERED INTO BALANCER VAULT
    result = await vault.getPool(poolID);
    assert(result[0] == poolAddress);
  });

  it("#createPoolFork - should fail to create new Pool if NOT OCEAN ROUTER", async () => {
    await expectRevert(
      poolFactory.createPoolFork(),
      "OceanPoolFactory: NOT OCEAN ROUTER"
    );
  });

  it("#createPoolFork - should fail to create new Pool if BalV2 == false", async () => {
    // IMPERSONATE ROUTER ADDRESS
    await impersonate(router.address);
    signer = ethers.provider.getSigner(router.address);

    // CREATE BALANCER POOL THROUGH THE ROUTER
    await expectRevert(
      poolFactory.connect(signer).createPoolFork(),
      "OceanPoolFactory: BalV2 available on this network"
    );
  });

  it("#createPoolFork - should succeed to create new Pool from Router if BalV2 == false", async () => {
    // SET BALV2 to False (meaning there's no BALV2 on the current network)
    await poolFactory.updateBalV2Status(false)
    // IMPERSONATE ROUTER ADDRESS
    await impersonate(router.address);
    signer = ethers.provider.getSigner(router.address);

    // CREATE BALANCER POOL THROUGH THE ROUTER
    await poolFactory.connect(signer).createPoolFork()

  });
});
