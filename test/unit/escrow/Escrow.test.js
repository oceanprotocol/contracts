const { assert,expect } = require('chai');
const { ethers } = require("hardhat");
const { json } = require('hardhat/internal/core/params/argumentTypes');
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { getEventFromTx } = require("../../helpers/utils")

const addressZero = '0x0000000000000000000000000000000000000000';

const blocktimestamp = async () => {
  return (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
}

const fastForward = async (seconds) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
}
// Start test block
describe('Escrow tests', function () {
  let Mock20Contract;
  let Mock20DecimalsContract;
  let EscrowContract;
  let signers;
  let payee1,payee2,payee3,payer1,payer2,payer3;
  before(async function () {
    // Get the contractOwner and collector address
    signers = await ethers.getSigners();
    payee1=signers[1]
    payee2=signers[2]
    payee3=signers[3]
    payer1=signers[4]
    payer2=signers[5]
    payer3=signers[6]
    const MockErc20 = await ethers.getContractFactory('MockERC20');
    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
    const Escrow = await ethers.getContractFactory('Escrow');
    Mock20Contract = await MockErc20.deploy(signers[0].address,"MockERC20", 'MockERC20');
    Mock20DecimalsContract = await MockErc20Decimals.deploy("Mock6Digits", 'Mock6Digits', 6);
    EscrowContract = await Escrow.deploy();
    await Mock20Contract.deployed();
    await Mock20DecimalsContract.deployed();
    await EscrowContract.deployed();
    // top up accounts
    await Mock20Contract.transfer(payer1.address,web3.utils.toWei("10000"))
    await Mock20Contract.transfer(payer2.address,web3.utils.toWei("10000"))
    await Mock20Contract.transfer(payer3.address,web3.utils.toWei("10000"))
    await Mock20DecimalsContract.transfer(payer1.address,ethers.utils.parseUnits("10000", 6))
    await Mock20DecimalsContract.transfer(payer2.address,ethers.utils.parseUnits("10000", 6))
    await Mock20DecimalsContract.transfer(payer3.address,ethers.utils.parseUnits("10000", 6))

  });


 // Test cases
 it('Check contract deployment', async function () {
  expect(await EscrowContract.address).to.exist;
  
});

it('Escrow - deposit', async function () {
  expect(await Mock20Contract.balanceOf(EscrowContract.address)).to.equal(0);
  expect(await Mock20DecimalsContract.balanceOf(EscrowContract.address)).to.equal(0);
  await Mock20Contract.connect(payer1).approve(EscrowContract.address, web3.utils.toWei("10000"));
  await EscrowContract.connect(payer1).deposit(Mock20Contract.address,web3.utils.toWei("100"));
  
  expect(await Mock20Contract.balanceOf(EscrowContract.address)).to.equal(web3.utils.toWei("100"));
  expect(await Mock20DecimalsContract.balanceOf(EscrowContract.address)).to.equal(0);
  const funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
  expect(funds.available).to.equal(web3.utils.toWei("100"))
  expect(funds.locked).to.equal(0)
  const locks=await EscrowContract.connect(payer1).getLocks(addressZero,addressZero,addressZero)
  expect(locks.length).to.equal(0)
  const auths=await EscrowContract.connect(payer1).getAuthorizations(Mock20Contract.address,payer1.address,addressZero)
  expect(auths.length).to.equal(0)
  
});

it('Escrow - withdraw', async function () {
    const balanceMock20=await Mock20Contract.balanceOf(EscrowContract.address);
    const balanceMock20Decimal=await Mock20DecimalsContract.balanceOf(EscrowContract.address);
    await expect(EscrowContract.connect(payer1).withdraw(Mock20Contract.address,web3.utils.toWei("10000"))).to.be.revertedWith("Not enough available funds")
    await EscrowContract.connect(payer1).withdraw(Mock20Contract.address,web3.utils.toWei("10"));
    expect(await Mock20Contract.balanceOf(EscrowContract.address)).to.equal(web3.utils.toWei("90"));
});

it('Escrow - auth', async function () {
    await EscrowContract.connect(payer1).authorize(Mock20Contract.address,payee1.address,web3.utils.toWei("50"),100,2);
    const auths=await EscrowContract.connect(payer1).getAuthorizations(Mock20Contract.address,payer1.address,payee1.address)
    expect(auths.length).to.equal(1)
    expect(auths[0].payee).to.equal(payee1.address)
    expect(auths[0].maxLockedAmount).to.equal(web3.utils.toWei("50"))
    expect(auths[0].maxLockSeconds).to.equal(100)
    expect(auths[0].maxLockSeconds).to.equal(100)
    expect(auths[0].maxLockCounts).to.equal(2)
    expect(auths[0].currentLocks).to.equal(0)

});

it('Escrow - lock', async function () {
    
    let jobId=1 // full claim
    const now=Math.floor(Date.now() / 1000)
    const expire = Math.round(await blocktimestamp()) + 60
    await expect(EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer2.address,web3.utils.toWei("50"),expire)).to.be.revertedWith("Payer does not have enough funds")
    //payer2 has funds, but no auth
    await Mock20Contract.connect(payer2).approve(EscrowContract.address, web3.utils.toWei("10000"));
    await EscrowContract.connect(payer2).deposit(Mock20Contract.address,web3.utils.toWei("100"));
    
    await expect(EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer2.address,web3.utils.toWei("50"),expire)).to.be.revertedWith("No auth found")
    
    //payee1 tries to lock too much
    await expect(EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("60"),expire)).to.be.revertedWith("Amount too high")
    await expect(EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,0,expire)).to.be.revertedWith("Invalid amount")
    await expect(EscrowContract.connect(payee1).createLock(0,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)).to.be.revertedWith("Invalid jobId")
    await EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)
    let locks=await EscrowContract.connect(payer1).getLocks(addressZero,addressZero,addressZero)
    expect(locks.length).to.equal(1)
    await expect(EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)).to.be.revertedWith("JobId already exists")
    jobId=2 // partial claim
    await EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)
    locks=await EscrowContract.connect(payer1).getLocks(addressZero,addressZero,addressZero)
    expect(locks.length).to.equal(2)
    // previous auth had only 2 concurent locks
    await expect(EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)).to.be.revertedWith("Exceeds maxLockCounts")
    await EscrowContract.connect(payer1).authorize(Mock20Contract.address,payee1.address,web3.utils.toWei("50"),100,10);
    jobId=3 // expired
    await EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)
    locks=await EscrowContract.connect(payer1).getLocks(addressZero,addressZero,addressZero)
    expect(locks.length).to.equal(3)
    jobId=4 // unclaimed
    await EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)
    locks=await EscrowContract.connect(payer1).getLocks(addressZero,addressZero,addressZero)
    expect(locks.length).to.equal(4)
    });

  it('Escrow - claim entire amount', async function () {
    const payer1Funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
    const payer1Available=payer1Funds.available
    const payer1Locked=payer1Funds.locked
    const payee1Balance=await Mock20Contract.balanceOf(payee1.address)
    // claim jobId
    let jobId=1 // full claim
    let lock
    const allLocks=await EscrowContract.connect(payee1).getLocks(Mock20Contract.address,payer1.address,payee1.address)
    for( oneLock in allLocks){
      if(allLocks[oneLock].jobId==jobId){
        lock=allLocks[oneLock]
      }
    }
    expect(lock.jobId).to.equal(jobId)
    const tx=await EscrowContract.connect(payee1).claimLock(lock.jobId,lock.token,lock.payer,lock.amount,0);
    const txReceipt = await tx.wait();
    const event = getEventFromTx(txReceipt, 'Claimed')
    assert(event, "Cannot find Claimed event")
    const afterpayer1Funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
    const afterpayer1Available=afterpayer1Funds.available
    const afterpayer1Locked=afterpayer1Funds.locked
    const afterpayee1Balance=await Mock20Contract.balanceOf(payee1.address)
    expect(afterpayer1Available).to.equal(payer1Available)
    expect(afterpayer1Locked).to.equal(payer1Locked.sub(lock.amount))
    expect(afterpayee1Balance).to.equal(payee1Balance.add(lock.amount))
    // make sure lock is gone
    for( oneLock of await EscrowContract.connect(payee1).getLocks(Mock20Contract.address,payer1.address,payee1.address)){
      expect(oneLock.jobId).to.not.equal(jobId)
    }


  });
  it('Escrow - claim half amount', async function () {
    const payer1Funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
    const payer1Available=payer1Funds.available
    const payer1Locked=payer1Funds.locked
    const payee1Balance=await Mock20Contract.balanceOf(payee1.address)
    // claim jobId
    let jobId=2 // partial claim
    let lock
    const allLocks=await EscrowContract.connect(payee1).getLocks(Mock20Contract.address,payer1.address,payee1.address)
    for( oneLock in allLocks){
      if(allLocks[oneLock].jobId==jobId){
        lock=allLocks[oneLock]
      }
    }
    expect(lock.jobId).to.equal(jobId)
    const claimedAmount=web3.utils.toWei("1")
    const returnAmount=lock.amount.sub(claimedAmount)
    const tx=await EscrowContract.connect(payee1).claimLock(lock.jobId,lock.token,lock.payer,claimedAmount,0);
    const txReceipt = await tx.wait();
    const event = getEventFromTx(txReceipt, 'Claimed')
    assert(event, "Cannot find Claimed event")
        
    const afterpayer1Funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
    const afterpayer1Available=afterpayer1Funds.available
    const afterpayer1Locked=afterpayer1Funds.locked
    const afterpayee1Balance=await Mock20Contract.balanceOf(payee1.address)
    expect(afterpayer1Available).to.equal(payer1Available.add(returnAmount))
    expect(afterpayer1Locked).to.equal(payer1Locked.sub(lock.amount))
    expect(afterpayee1Balance).to.equal(payee1Balance.add(claimedAmount))
    // make sure lock is gone
    for( oneLock of await EscrowContract.connect(payee1).getLocks(Mock20Contract.address,payer1.address,payee1.address)){
      expect(oneLock.jobId).to.not.equal(jobId)
    }
  });

  it('Escrow - claim expired lock', async function () {
    await fastForward(60)
    const payer1Funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
    const payer1Available=payer1Funds.available
    const payer1Locked=payer1Funds.locked
    const payee1Balance=await Mock20Contract.balanceOf(payee1.address)
    // claim jobId
    let jobId=3 // expired lock
    let lock
    const allLocks=await EscrowContract.connect(payee1).getLocks(Mock20Contract.address,payer1.address,payee1.address)
    for( oneLock in allLocks){
      if(allLocks[oneLock].jobId==jobId){
        lock=allLocks[oneLock]
      }
    }
    expect(lock.jobId).to.equal(jobId)
    const claimedAmount=web3.utils.toWei("1")
    const returnAmount=lock.amount.sub(claimedAmount)
    const tx=await EscrowContract.connect(payee1).claimLock(lock.jobId,lock.token,lock.payer,claimedAmount,0);
    const txReceipt = await tx.wait();
    const event = getEventFromTx(txReceipt, 'Canceled')
    assert(event, "Cannot find Canceled event")
        
    const afterpayer1Funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
    const afterpayer1Available=afterpayer1Funds.available
    const afterpayer1Locked=afterpayer1Funds.locked
    const afterpayee1Balance=await Mock20Contract.balanceOf(payee1.address)
    expect(afterpayer1Available).to.equal(payer1Available.add(lock.amount))
    expect(afterpayer1Locked).to.equal(payer1Locked.sub(lock.amount))
    expect(afterpayee1Balance).to.equal(payee1Balance)
    // make sure lock is gone
    for( oneLock of await EscrowContract.connect(payee1).getLocks(Mock20Contract.address,payer1.address,payee1.address)){
      expect(oneLock.jobId).to.not.equal(jobId)
    }
  });
  it('Escrow - payee cancels expired lock', async function () {
    await fastForward(60)
    const payer1Funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
    const payer1Available=payer1Funds.available
    const payer1Locked=payer1Funds.locked
    const payee1Balance=await Mock20Contract.balanceOf(payee1.address)
    // claim jobId
    let jobId=4 // unclaimed expired
    let lock
    const allLocks=await EscrowContract.connect(payee1).getLocks(Mock20Contract.address,payer1.address,payee1.address)
    for( oneLock in allLocks){
      if(allLocks[oneLock].jobId==jobId){
        lock=allLocks[oneLock]
      }
    }
    expect(lock.jobId).to.equal(jobId)
    const claimedAmount=web3.utils.toWei("1")
    const returnAmount=lock.amount.sub(claimedAmount)
    const tx=await EscrowContract.connect(payer1).cancelExpiredLocks(lock.jobId,lock.token,lock.payer,lock.payee);
    const txReceipt = await tx.wait();
    const event = getEventFromTx(txReceipt, 'Canceled')
    assert(event, "Cannot find Canceled event")
        
    const afterpayer1Funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
    const afterpayer1Available=afterpayer1Funds.available
    const afterpayer1Locked=afterpayer1Funds.locked
    const afterpayee1Balance=await Mock20Contract.balanceOf(payee1.address)
    expect(afterpayer1Available).to.equal(payer1Available.add(lock.amount))
    expect(afterpayer1Locked).to.equal(payer1Locked.sub(lock.amount))
    expect(afterpayee1Balance).to.equal(payee1Balance)
    // make sure lock is gone
    for( oneLock of await EscrowContract.connect(payee1).getLocks(Mock20Contract.address,payer1.address,payee1.address)){
      expect(oneLock.jobId).to.not.equal(jobId)
    }
  });
});