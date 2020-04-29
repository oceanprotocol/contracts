const TokenFactory = artifacts.require("TokenFactory");

contract("TokenFactory test", async accounts => {
  it("should pass", async () => {
    
    let instance = await TokenFactory.deployed();

  });

});
