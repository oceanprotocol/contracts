const Template = artifacts.require("ERC20Template");
const FeeManager = artifacts.require("FeeManager");
const Factory = artifacts.require("Factory");
const Token = artifacts.require("ERC20Template");

const truffleAssert = require('truffle-assertions');
const BigNumber = require('bn.js');

contract("Factory test", async accounts => {
  let factory;
  let result;
  let token;
  let ethValue;
  let tokenAddress;

  beforeEach('init contracts for each test', async function () {

    feeManager = await FeeManager.new();
    template = await Template.new("TestToken", "TEST", accounts[0], feeManager.address);
  	factory = await Factory.new(template.address);
  	result = await factory.createToken("logic", "TestDataToken", "TDT", accounts[0]);
  	tokenAddress = await factory.currentTokenAddress();
  	token = await Token.at(tokenAddress);     

  })

  it("should check that the token contract is initialized", async () => {
    const isInitialized = await token.isInitialized();
    assert(isInitialized == true);
  });

  it("should fail to re-initialize the contracts", async () => {
    truffleAssert.fails(token.initialize("NewName", "NN", accounts[1]), 
                        truffleAssert.ErrorType.REVERT, 
                        "DataToken: token instance already initialized.");
  });

  it("should check that the token is not paused", async () => {
    const isPaused = await token.isPaused();
    assert(isPaused == false);
  });

  it("should pause the contract", async () => {
    await token.pause();
    const isPaused = await token.isPaused();
    assert(isPaused == true);
  });

  it("should unpause the contract", async () => {
    await token.pause();
    await token.unpause();
    const isPaused = await token.isPaused();
    assert(isPaused == false);
  });

  it("should set a new minter", async () => {
    await token.setMinter(accounts[1]);
    const isMinter = await token.isMinter(accounts[1]);
    assert(isMinter == true);
  });

  it("should not mint the tokens due to zero message value", async () => {
    
    truffleAssert.fails(token.mint(accounts[1], 10),
                        truffleAssert.ErrorType.REVERT, 
                        "DataToken: no value assigned to the message.");
  });

  it("should not mint the tokens due to the cap limit", async () => {
    ethValue = new BigNumber("100000000000000000");
    let cap = new BigNumber("1500000000000000000000000000000000000");

    truffleAssert.fails(token.mint(accounts[1], cap, {value:ethValue}),
                        truffleAssert.ErrorType.REVERT, 
                        "DataToken: cap exceeded.");
  });

  it("should mint the tokens", async () => {
    ethValue = new BigNumber("100000000000000000");
    truffleAssert.passes(await token.mint(accounts[1], 10, {value:ethValue}));
  });

  it("should get the token name", async () => {
    const name = await token.name();
    assert(name == "TestDataToken");
  });

  it("should get the token symbol", async () => {
    const symbol = await token.symbol();
    assert(symbol == "TDT");
  });

  it("should get the token decimals", async () => {
    const decimals = await token.decimals();
    assert(decimals == 18);
  });

  it("should get the token cap", async () => {
    const cap = await token.cap();
    assert(cap > 0);
  });
});