const Factory = artifacts.require("Factory");

const truffleAssert = require('truffle-assertions');

contract("factory test", async accounts => {
  let factory;

  beforeEach('init contracts for each test', async function () {

  	factory = await Factory.new(accounts[0]);

  })

  it("should create a token", async () => {
    
    truffleAssert.passes(factory.createToken("logic", "TestDataToken", "TDT", accounts[0]));

  });

});