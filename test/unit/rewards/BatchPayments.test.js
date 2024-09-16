const { expect } = require('chai');
const { ethers } = require("hardhat");
const { json } = require('hardhat/internal/core/params/argumentTypes');
const { web3 } = require("@openzeppelin/test-helpers/src/setup");

// Start test block
describe('Batch Payments tests', function () {
  let Mock20Contract;
  let Mock20DecimalsContract;
  let BatchPaymentsContract;
  let signers;
  before(async function () {
    // Get the contractOwner and collector address
    signers = await ethers.getSigners();
    const MockErc20 = await ethers.getContractFactory('MockERC20');
    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
    const BatchPayments = await ethers.getContractFactory('BatchPayments');
    Mock20Contract = await MockErc20.deploy(signers[0].address,"MockERC20", 'MockERC20');
    Mock20DecimalsContract = await MockErc20Decimals.deploy("Mock6Digits", 'Mock6Digits', 6);
    BatchPaymentsContract = await BatchPayments.deploy();
    

  });


 // Test cases
 it('Check contract deployment', async function () {
  expect(await BatchPaymentsContract.address).to.exist;
  
});

it('Should transfer tokens in batch', async function () {
  const addresses = [signers[1].address, signers[2].address, signers[3].address];
  const amounts = [web3.utils.toWei("100"), web3.utils.toWei("200"), web3.utils.toWei("300")];

  // Approve the BatchPayments contract to transfer tokens
  await Mock20Contract.approve(BatchPaymentsContract.address, web3.utils.toWei("10000"));

  // Perform the batch transfer
  await BatchPaymentsContract.sendToken(Mock20Contract.address, addresses, amounts);

  // Check balances
  expect(await Mock20Contract.balanceOf(signers[1].address)).to.equal(web3.utils.toWei("100"));
  expect(await Mock20Contract.balanceOf(signers[2].address)).to.equal(web3.utils.toWei("200"));
  expect(await Mock20Contract.balanceOf(signers[3].address)).to.equal(web3.utils.toWei("300"));
});

it('Should revert if arrays length mismatch', async function () {
  const addresses = [signers[1].address, signers[2].address];
  const amounts = [web3.utils.toWei("100"), web3.utils.toWei("200"), web3.utils.toWei("300")];

  // Approve the BatchPayments contract to transfer tokens
  await Mock20Contract.approve(BatchPaymentsContract.address, web3.utils.toWei("10000"));

  // Perform the batch transfer
  await expect(BatchPaymentsContract.sendToken(Mock20Contract.address, addresses, amounts)).to.be.revertedWith("Arrays must have same length");
  
});

it('Should revert if transfer fails', async function () {
  const addresses = [signers[1].address, signers[2].address, signers[3].address];
  const amounts = [web3.utils.toWei("100"), web3.utils.toWei("200"), web3.utils.toWei("1300")];

  // Approve the BatchPayments contract to transfer tokens - insufficient amount
  await Mock20Contract.approve(BatchPaymentsContract.address, web3.utils.toWei("1000"));

  // Perform the batch transfer
  await expect(BatchPaymentsContract.sendToken(Mock20Contract.address, addresses, amounts)).to.be.revertedWith("ERC20: insufficient allowance");
  
});

it('Should handle tokens with decimals correctly', async function () {
  const addresses = [signers[1].address, signers[2].address, signers[3].address];
  const amounts = [
    ethers.utils.parseUnits("100", 6), 
    ethers.utils.parseUnits("200", 6), 
    ethers.utils.parseUnits("300", 6)
  ];

  // Approve the BatchPayments contract to transfer tokens
  await Mock20DecimalsContract.approve(BatchPaymentsContract.address, ethers.utils.parseUnits("10000", 6));

  // Perform the batch transfer
  await BatchPaymentsContract.sendToken(Mock20DecimalsContract.address, addresses, amounts);

  // Check balances
  expect(await Mock20DecimalsContract.balanceOf(signers[1].address)).to.equal(ethers.utils.parseUnits("100", 6));
  expect(await Mock20DecimalsContract.balanceOf(signers[2].address)).to.equal(ethers.utils.parseUnits("200", 6));
  expect(await Mock20DecimalsContract.balanceOf(signers[3].address)).to.equal(ethers.utils.parseUnits("300", 6));
});

it('Should transfer native ETH in batch', async function () {
  const addresses = [signers[1].address, signers[2].address, signers[3].address];
  const amounts = [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.3")];

  const initialBalances = await Promise.all(addresses.map(addr => ethers.provider.getBalance(addr)));

  // Perform the batch transfer
  await BatchPaymentsContract.sendEther(addresses, amounts, { value: ethers.utils.parseEther("0.6") });

  // Check balances
  const finalBalances = await Promise.all(addresses.map(addr => ethers.provider.getBalance(addr)));
  expect(finalBalances[0]).to.equal(initialBalances[0].add(amounts[0]));
  expect(finalBalances[1]).to.equal(initialBalances[1].add(amounts[1]));
  expect(finalBalances[2]).to.equal(initialBalances[2].add(amounts[2]));
});
  


});