var DataTokenTemplate = artifacts.require("./DataTokenTemplate.sol");
var FeeManager = artifacts.require("./FeeManager.sol");
var Factory = artifacts.require("./Factory.sol");

module.exports = function(deployer) {
    deployer.deploy(
        Factory,
        DataTokenTemplate.address,
        FeeManager.address
    )
}