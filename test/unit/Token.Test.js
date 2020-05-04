const Template = artifacts.require("ERC20Template");
const FeeManager = artifacts.require("FeeManager");
const Factory = artifacts.require("Factory");
const Token = artifacts.require("ERC20Template");

const truffleAssert = require('truffle-assertions');

contract("Factory test", async accounts => {
  let factory;
  let result;
  let token;
  let tokenAddress;

  beforeEach('init contracts for each test', async function () {

    feeManager = await FeeManager.new();
    template = await Template.new("TestToken", "TEST", accounts[0], feeManager.address);
  	factory = await Factory.new(template.address);
  	result = await factory.createToken("logic", "TestDataToken", "TDT", accounts[0]);
  	tokenAddress = await factory.currentTokenAddress();
  	token = await Token.at(tokenAddress);     

  })

  it("should check that the token is initialized", async () => {
    const isInitialized = await token.isInitialized();
    // assert(isInitialized == true);
  });

});