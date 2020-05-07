const Factory = artifacts.require("Factory");
const Template = artifacts.require("ERC20Template");
const FeeManager = artifacts.require("FeeManager");
/* eslint-env mocha */
/* global artifacts, contract, it, beforeEach */

const Factory = artifacts.require('Factory')

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

  it("should fail on zero address factory initialization", async () => {
    truffleAssert.fails(Factory.new("0x0000000000000000000000000000000000000000"),
                        truffleAssert.ErrorType.REVERT, 
                        "Invalid TokenFactory initialization");
  });

  it("should fail on zero minter address initialization", async () => {
    truffleAssert.fails(Template.new("Zero address minter contract", "ZERO", "0x0000000000000000000000000000000000000000", feeManager.address),
                        truffleAssert.ErrorType.REVERT, 
                        "Invalid minter:  address(0)");
  });

});

