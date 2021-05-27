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

describe("ERC20Factory", () => {
  let name,
    symbol,
    owner,
    reciever,
    metadata,
    tokenERC725,
    tokenAddress,
    data,
    flags,
    factoryERC721,
    factoryERC20,
    templateERC725,
    templateERC20,
    newERC721Template,
    oceanContract;

  const oceanAddress = "0x967da4048cd07ab37855c090aaf366e4ce1b9f48";
  const vaultAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8"
  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
  beforeEach("init contracts for each test", async () => {
    const ERC725Template = await ethers.getContractFactory("ERC725Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");
    const ERC20Factory = await ethers.getContractFactory("ERC20Factory");

    const Metadata = await ethers.getContractFactory("Metadata");

    [owner, reciever, user2, user3] = await ethers.getSigners();

    // cap = new BigNumber('1400000000')
    data = web3.utils.asciiToHex(constants.blob[0]);
    flags = web3.utils.asciiToHex(constants.blob[0]);
    metadata = await Metadata.deploy();
    //console.log(metadata.address)

    templateERC20 = await ERC20Template.deploy();
    factoryERC20 = await ERC20Factory.deploy(
      templateERC20.address,
      communityFeeCollector
    );
    templateERC725 = await ERC725Template.deploy();
    factoryERC721 = await ERC721Factory.deploy(
      templateERC725.address,
      communityFeeCollector,
      factoryERC20.address
    );

    newERC721Template = await ERC725Template.deploy();

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
    tokenERC725 = await ethers.getContractAt("ERC725Template", tokenAddress);
    symbol = await tokenERC725.symbol();
    name = await tokenERC725.name();
    assert(name === "DT1");
    assert(symbol === "DTSYMBOL");
    assert((await tokenERC725.balanceOf(owner.address)) == 1);
    //await tokenERC725.addManager(owner.address);

    // GET SOME OCEAN TOKEN FROM OUR MAINNET FORK
    const userWithOcean = "0x53aB4a93B31F480d17D3440a6329bDa86869458A";
    await impersonate(userWithOcean);

    oceanContract = await ethers.getContractAt("IERC20", oceanAddress);
    const signer = await ethers.provider.getSigner(userWithOcean);
    await oceanContract
      .connect(signer)
      .transfer(owner.address, ethers.utils.parseEther("10000"));

    assert(
      (await oceanContract.balanceOf(owner.address)).toString() ==
        ethers.utils.parseEther("10000")
    );

    // const oceanContract= IERC20(oceanAddress)
  });

  xit("#isInitialized - should check that the tokenERC725 contract is initialized", async () => {
    expect(await tokenERC725.isInitialized()).to.equal(true);
  });

  xit("#createToken - should not allow to create a new ERC20Token if NOT in CreateERC20List", async () => {
    await expectRevert(
      tokenERC725.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1
      ),
      "ERC725Template: NOT MINTER_ROLE"
    );
  });

  xit("#createToken - should create a new ERC20Token, after adding address to CreateERC20List", async () => {
    await tokenERC725.addToCreateERC20List(owner.address);
    await tokenERC725.createERC20(
      "ERC20DT1",
      "ERC20DT1Symbol",
      web3.utils.toWei("10"),
      1
    );
  });

  xit("#createToken - should fail to create an ERC20 calling the factory directly", async () => {
    await expectRevert(
      factoryERC20.createToken(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1
      ),
      "ERC20Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  xit("#createToken - should not allow to create a new ERC20Token directly if ERC721 contract is not on the list", async () => {
    await owner.sendTransaction({
      to: templateERC725.address,
      value: ethers.utils.parseEther("1"),
    });

    await impersonate(templateERC725.address);

    const signer = await ethers.provider.getSigner(templateERC725.address);

    await expectRevert(
      factoryERC20
        .connect(signer)
        .createToken("ERC20DT1", "ERC20DT1Symbol", web3.utils.toWei("10"), 1),
      "ERC20Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  xit("#createToken - should not allow to create a new ERC20Token directly from the ERC20Factory even if is a contract", async () => {
    const tx = await owner.sendTransaction({
      to: factoryERC721.address,
      value: ethers.utils.parseEther("1"),
    });
    await impersonate(factoryERC721.address);
    const signer = await ethers.provider.getSigner(factoryERC721.address);

    await expectRevert(
      factoryERC20
        .connect(signer)
        .createToken("ERC20DT1", "ERC20DT1Symbol", web3.utils.toWei("10"), 1),
      "ERC20Factory: ONLY ERC721 INSTANCE FROM ERC721FACTORY"
    );
  });

  xit("#createToken - should fail to create a specific ERC20 Template if the index is ZERO", async () => {
    await tokenERC725.addToCreateERC20List(owner.address);
    await expectRevert(
      tokenERC725.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        0
      ),
      "ERC20Factory: Template index doesnt exist"
    );
  });

  xit("#createToken - should fail to create a specific ERC20 Template if the index doesn't exist", async () => {
    await tokenERC725.addToCreateERC20List(owner.address);
    await expectRevert(
      tokenERC725.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        3
      ),
      "Template index doesnt exist"
    );
  });

  xit("#templateCount - should get templateCount from ERC20Factory", async () => {
    assert((await factoryERC20.templateCount()) == 1);
  });

  xit("#addTokenTemplate - should add a new ERC20 Template from owner(owner)", async () => {
    await factoryERC20.addTokenTemplate(newERC721Template.address);
    assert((await factoryERC20.templateCount()) == 2);
  });

  xit("#disableTokenTemplate - should disable a specific ERC20 Template from owner", async () => {
    let templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == true);
    await factoryERC20.disableTokenTemplate(1);
    templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == false);
  });

  xit("#disableTokenTemplate - should fail to disable a specific ERC20 Template from NOT owner", async () => {
    let templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == true);
    await expectRevert(
      factoryERC20.connect(user2).disableTokenTemplate(1),
      "Ownable: caller is not the owner"
    );
    templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == true);
  });

  xit("#disableTokenTemplate - should fail to create a specific ERC20 Template if the template is disabled", async () => {
    await factoryERC20.disableTokenTemplate(1);
    await tokenERC725.addToCreateERC20List(owner.address);
    await expectRevert(
      tokenERC725.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("10"),
        1
      ),
      "ERC721Token Template disabled"
    );
    templateStruct = await factoryERC20.templateList(1);
    assert(templateStruct.isActive == false);
  });

  xit("#getCurrentTokenCount - should get the current token count (deployed ERC20)", async () => {
    assert((await factoryERC20.getCurrentTokenCount()) == 1);
  });

  xit("#getTokenTemplate - should get the ERC20token template struct", async () => {
    const template = await factoryERC20.getTokenTemplate(1);
    assert(template.isActive == true);
    assert(template.templateAddress == templateERC20.address);
  });

  xit("#getTokenTemplate - should fail to get the ERC20token template struct if index == 0", async () => {
    await expectRevert(
      factoryERC20.getTokenTemplate(0),
      "ERC20Factory: Template index doesnt exist"
    );
  });

  xit("#getTokenTemplate - should fail to get the ERC20token template struct if index > templateCount", async () => {
    await expectRevert(
      factoryERC20.getTokenTemplate(3),
      "ERC20Factory: Template index doesnt exist"
    );
  });

  xit("#addToERC721Registry - should fail to add a new allowed ERC721 contract if not from erc721 factory", async () => {
    await expectRevert(
      factoryERC20.addToERC721Registry(newERC721Template.address),
      "ERC20Factory: ONLY ERC721FACTORY CONTRACT"
    );
  });

  xit("#addToERC721Registry - should succeed to add a new allowed ERC721 contract from erc721 factory contract", async () => {
    const tx = await owner.sendTransaction({
      to: factoryERC721.address,
      value: ethers.utils.parseEther("1"),
    });
    await impersonate(factoryERC721.address);
    const signer = await ethers.provider.getSigner(factoryERC721.address);

    assert(
      (await factoryERC20.erc721List(newERC721Template.address)) == ZERO_ADDRESS
    );

    await factoryERC20
      .connect(signer)
      .addToERC721Registry(newERC721Template.address);

    assert(
      (await factoryERC20.erc721List(newERC721Template.address)) ==
        newERC721Template.address
    );
  });

  it("#createPool - should succeed to create a new Pool on Balancer V2", async () => {
    // CREATE A NEW ERC20DATATOKEN
    await tokenERC725.addToCreateERC20List(owner.address);
    let receipt = await (
      await tokenERC725.createERC20(
        "ERC20DT1",
        "ERC20DT1Symbol",
        web3.utils.toWei("1000"),
        1
      )
    ).wait();
    const newERC20DT = receipt.events[3].args.erc20Address;
    
    const erc20DTContract = await ethers.getContractAt('ERC20Template',newERC20DT)
      
    await erc20DTContract.addMinter(owner.address)
    await erc20DTContract.mint(owner.address, web3.utils.toWei("100"));

    const tokens = [newERC20DT, oceanAddress];
    const weights = [
      ethers.utils.parseEther("0.5"),
      ethers.utils.parseEther("0.5"),
    ];

    const NAME = "Two-token Pool";
    const SYMBOL = "OCEAN-DT-50-50";
    const swapFeePercentage = 0.3e16; // 0.3%

    receipt = await (
      await factoryERC20.createPool(
        NAME,
        SYMBOL,
        tokens,
        weights,
        swapFeePercentage,
        owner.address
      )
    ).wait();
    // console.log(receipt.events)
    const events = receipt.events.filter((e) => e.event === "PoolCreated");
    const poolAddress = events[0].args.newPoolAddress;
    console.log(poolAddress);
    const pool = await ethers.getContractAt(WeightedPoolABI, poolAddress);
    const poolID = await pool.getPoolId();
    console.log(poolID);
    const initialBalances = [ethers.utils.parseEther("10"), ethers.utils.parseEther("1000")];
    const JOIN_KIND_INIT = 0;

    const vault = await ethers.getContractAt('IVault', vaultAddress)
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

   
    
    await oceanContract.approve(vaultAddress, ethers.utils.parseEther('1000000000'));
   
    await erc20DTContract.approve(vaultAddress,ethers.utils.parseEther('1000000000') )
    
    const tx = await vault.joinPool(poolID, owner.address, owner.address, joinPoolRequest);
    // You can wait for it like this, or just print the tx hash and monitor
    receipt = await tx.wait();
    console.log(receipt)
  });
});

const WeightedPoolABI = [
  {
    inputs: [
      {
        internalType: "contract IVault",
        name: "vault",
        type: "address",
      },
      {
        internalType: "string",
        name: "name",
        type: "string",
      },
      {
        internalType: "string",
        name: "symbol",
        type: "string",
      },
      {
        internalType: "contract IERC20[]",
        name: "tokens",
        type: "address[]",
      },
      {
        internalType: "uint256[]",
        name: "normalizedWeights",
        type: "uint256[]",
      },
      {
        internalType: "uint256",
        name: "swapFeePercentage",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "pauseWindowDuration",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "bufferPeriodDuration",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "bool",
        name: "paused",
        type: "bool",
      },
    ],
    name: "PausedStateChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "swapFeePercentage",
        type: "uint256",
      },
    ],
    name: "SwapFeePercentageChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "contract IERC20",
        name: "token",
        type: "address",
      },
      {
        components: [
          {
            internalType: "uint64",
            name: "targetPercentage",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "criticalPercentage",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "feePercentage",
            type: "uint64",
          },
        ],
        indexed: false,
        internalType: "struct IAssetManager.PoolConfig",
        name: "target",
        type: "tuple",
      },
    ],
    name: "TargetManagerPoolConfigChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    inputs: [],
    name: "DOMAIN_SEPARATOR",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
    ],
    name: "allowance",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "decreaseApproval",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "selector",
        type: "bytes4",
      },
    ],
    name: "getActionId",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getAuthorizer",
    outputs: [
      {
        internalType: "contract IAuthorizer",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getInvariant",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getLastInvariant",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getNormalizedWeights",
    outputs: [
      {
        internalType: "uint256[]",
        name: "",
        type: "uint256[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getOwner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPausedState",
    outputs: [
      {
        internalType: "bool",
        name: "paused",
        type: "bool",
      },
      {
        internalType: "uint256",
        name: "pauseWindowEndTime",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "bufferPeriodEndTime",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPoolId",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getRate",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getSwapFeePercentage",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getVault",
    outputs: [
      {
        internalType: "contract IVault",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "increaseApproval",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "nonces",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "poolId",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        internalType: "uint256[]",
        name: "balances",
        type: "uint256[]",
      },
      {
        internalType: "uint256",
        name: "lastChangeBlock",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "protocolSwapFeePercentage",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "userData",
        type: "bytes",
      },
    ],
    name: "onExitPool",
    outputs: [
      {
        internalType: "uint256[]",
        name: "",
        type: "uint256[]",
      },
      {
        internalType: "uint256[]",
        name: "",
        type: "uint256[]",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "poolId",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        internalType: "uint256[]",
        name: "balances",
        type: "uint256[]",
      },
      {
        internalType: "uint256",
        name: "lastChangeBlock",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "protocolSwapFeePercentage",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "userData",
        type: "bytes",
      },
    ],
    name: "onJoinPool",
    outputs: [
      {
        internalType: "uint256[]",
        name: "",
        type: "uint256[]",
      },
      {
        internalType: "uint256[]",
        name: "",
        type: "uint256[]",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "enum IVault.SwapKind",
            name: "kind",
            type: "uint8",
          },
          {
            internalType: "contract IERC20",
            name: "tokenIn",
            type: "address",
          },
          {
            internalType: "contract IERC20",
            name: "tokenOut",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "amount",
            type: "uint256",
          },
          {
            internalType: "bytes32",
            name: "poolId",
            type: "bytes32",
          },
          {
            internalType: "uint256",
            name: "lastChangeBlock",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "from",
            type: "address",
          },
          {
            internalType: "address",
            name: "to",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "userData",
            type: "bytes",
          },
        ],
        internalType: "struct IPoolSwapStructs.SwapRequest",
        name: "request",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "balanceTokenIn",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "balanceTokenOut",
        type: "uint256",
      },
    ],
    name: "onSwap",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
      {
        internalType: "uint8",
        name: "v",
        type: "uint8",
      },
      {
        internalType: "bytes32",
        name: "r",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "s",
        type: "bytes32",
      },
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "poolId",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        internalType: "uint256[]",
        name: "balances",
        type: "uint256[]",
      },
      {
        internalType: "uint256",
        name: "lastChangeBlock",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "protocolSwapFeePercentage",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "userData",
        type: "bytes",
      },
    ],
    name: "queryExit",
    outputs: [
      {
        internalType: "uint256",
        name: "bptIn",
        type: "uint256",
      },
      {
        internalType: "uint256[]",
        name: "amountsOut",
        type: "uint256[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "poolId",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        internalType: "uint256[]",
        name: "balances",
        type: "uint256[]",
      },
      {
        internalType: "uint256",
        name: "lastChangeBlock",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "protocolSwapFeePercentage",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "userData",
        type: "bytes",
      },
    ],
    name: "queryJoin",
    outputs: [
      {
        internalType: "uint256",
        name: "bptOut",
        type: "uint256",
      },
      {
        internalType: "uint256[]",
        name: "amountsIn",
        type: "uint256[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "contract IERC20",
        name: "token",
        type: "address",
      },
      {
        components: [
          {
            internalType: "uint64",
            name: "targetPercentage",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "criticalPercentage",
            type: "uint64",
          },
          {
            internalType: "uint64",
            name: "feePercentage",
            type: "uint64",
          },
        ],
        internalType: "struct IAssetManager.PoolConfig",
        name: "poolConfig",
        type: "tuple",
      },
    ],
    name: "setAssetManagerPoolConfig",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bool",
        name: "paused",
        type: "bool",
      },
    ],
    name: "setPaused",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "swapFeePercentage",
        type: "uint256",
      },
    ],
    name: "setSwapFeePercentage",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "transfer",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "transferFrom",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
];
