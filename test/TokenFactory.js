const TokenFactory = artifacts.require("TokenFactory");

const truffleAssert = require('truffle-assertions');

contract("TokenFactory test", async accounts => {
  let factory;

  beforeEach('innit contracts for each test', async function () {

  	factory = await TokenFactory.deployed();

  })

  it("should create a token", async () => {
    
    truffleAssert.passes(factory.createToken("logic", "TestDataToken", "TDT", accounts[0]));

  });

});
