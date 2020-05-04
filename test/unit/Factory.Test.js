const Factory = artifacts.require("Factory");
const Template = artifacts.require("ERC20Template");
const FeeManager = artifacts.require("FeeManager");

const truffleAssert = require('truffle-assertions');

contract("Factory test", async accounts => {
  let feeManager;
  let templete;
  let factory;
  let result;
  let tokenAddress;

  beforeEach('init contracts for each test', async function () {
  	feeManager = await FeeManager.new();
  	template = await Template.new("Template Contract", "TEMPLATE", accounts[0], feeManager.address); 
  	factory = await Factory.new(template.address);

  })

  it("should create a token and check that it's not a zero address", async () => {
    
    truffleAssert.passes(
    	result = await factory.createToken("logic", "TestDataToken", "TDT", accounts[0])
    );

	truffleAssert.eventEmitted(result, 'TokenCreated', (ev) => {
		tokenAddress = ev.param1;
		return tokenAddress != "0x0000000000000000000000000000000000000000";
	});

  });

});