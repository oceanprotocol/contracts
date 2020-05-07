const FeeManager = artifacts.require("FeeManager");

const truffleAssert = require('truffle-assertions');
const BigNumber = require('bn.js');

contract("FeeManager test", async accounts => {

  beforeEach('init contracts for each test', async function () {
  	feeManager = await FeeManager.new();
  })

it("calculate fee", async () => {
  	
  	let gas = new BigNumber("100000000000000");
  	let tokens = 1;

  	let fee = await feeManager.getFee(gas, tokens);

  	assert(fee.toNumber() > 0);
  });


});