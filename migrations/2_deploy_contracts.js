const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:9545'));

var TokenFactory = artifacts.require("TokenFactory");
var ServiceFeeManager = artifacts.require("ServiceFeeManager");
var DataTokenTemplate = artifacts.require("DataTokenTemplate");

module.exports = function(deployer) {

    deployer.then(async () => {
    	let accounts = await web3.eth.getAccounts();

        await deployer.deploy(ServiceFeeManager);
    	await deployer.deploy(DataTokenTemplate, "DataToken", "DT", accounts[0], ServiceFeeManager.address);
        await deployer.deploy(TokenFactory, DataTokenTemplate.address);

    });

};