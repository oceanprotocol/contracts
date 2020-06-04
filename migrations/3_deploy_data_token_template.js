var DataTokenTemplate = artifacts.require("./DataTokenTemplate.sol");
var FeeManager = artifacts.require("./FeeManager.sol");

module.exports = function(deployer, network, accounts) {
    deployer.deploy(
        DataTokenTemplate, 
        "DataTokenTemplate", 
        "DTT", 
        accounts[0], 
        10000000, 
        "http://oceanprotocol.com",
        FeeManager.address 
    )
}