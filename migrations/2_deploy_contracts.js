const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:9545'));

var Factory = artifacts.require("Factory");
var FeeManager = artifacts.require("FeeManager");
var ERC20Template = artifacts.require("ERC20Template");

module.exports = function(deployer) {

    deployer.then(async () => {
    	let accounts = await web3.eth.getAccounts();

        await deployer.deploy(FeeManager);
    	await deployer.deploy(ERC20Template, "DataToken", "DT", accounts[0], FeeManager.address);
        await deployer.deploy(Factory, ERC20Template.address);

    });

};