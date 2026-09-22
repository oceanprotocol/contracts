const { assert,expect } = require('chai');
const { ethers } = require("hardhat");
const { json } = require('hardhat/internal/core/params/argumentTypes');
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { getEventFromTx } = require("../../helpers/utils");


const addressZero = '0x0000000000000000000000000000000000000000';

const blocktimestamp = async () => {
  return (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
}

const fastForward = async (seconds) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
}

// Helper function to sign ERC20Permit data
async function signPermit(signer, token, spender, amount, deadline, nonce) {
  const name = await token.name();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  
  const domain = {
    name: name,
    version: "1",
    chainId: chainId,
    verifyingContract: token.address,
  };
  
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  
  const value = {
    owner: signer.address,
    spender: spender,
    value: amount,
    nonce: nonce,
    deadline: deadline,
  };
  
  const signature = await signer._signTypedData(domain, types, value);
  return ethers.utils.splitSignature(signature);
}

// Start test block
describe('Escrow tests', function () {
  let Mock20Contract;
  let Mock20DecimalsContract;
  let Mock20PermitContract;
  let EscrowContract;
  let FactoryRouter
  let signers;
  let payee1,payee2,payee3,payer1,payer2,payer3,opcCollector
  before(async function () {
    // Get the contractOwner and collector address
    signers = await ethers.getSigners();
    payee1=signers[1]
    payee2=signers[2]
    payee3=signers[3]
    payer1=signers[4]
    payer2=signers[5]
    payer3=signers[6]
    opcCollector=signers[7]
    const Router = await ethers.getContractFactory("FactoryRouter");
    const MockErc20 = await ethers.getContractFactory('MockERC20');
    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
    const MockErc20Permit = await ethers.getContractFactory('MockERC20Permit');
    const Escrow = await ethers.getContractFactory('Escrow');
    Mock20Contract = await MockErc20.deploy(signers[0].address,"MockERC20", 'MockERC20');
    Mock20DecimalsContract = await MockErc20Decimals.deploy("Mock6Digits", 'Mock6Digits', 6);
    Mock20PermitContract = await MockErc20Permit.deploy("MockPermit", 'MPERMIT', 18);
    await Mock20Contract.deployed();
    await Mock20DecimalsContract.deployed();
    await Mock20PermitContract.deployed();
    // DEPLOY ROUTER, SETTING OWNER
    FactoryRouter = await Router.deploy(
      signers[0].address,
      Mock20Contract.address,
      '0x000000000000000000000000000000000000dead',
      opcCollector.address,
      []
    );
    await FactoryRouter.deployed();
    EscrowContract = await Escrow.deploy(FactoryRouter.address,addressZero);
    await EscrowContract.deployed();
    // top up accounts
    await Mock20Contract.transfer(payer1.address,web3.utils.toWei("10000"))
    await Mock20Contract.transfer(payer2.address,web3.utils.toWei("10000"))
    await Mock20Contract.transfer(payer3.address,web3.utils.toWei("10000"))
    await Mock20DecimalsContract.transfer(payer1.address,ethers.utils.parseUnits("10000", 6))
    await Mock20DecimalsContract.transfer(payer2.address,ethers.utils.parseUnits("10000", 6))
    await Mock20DecimalsContract.transfer(payer3.address,ethers.utils.parseUnits("10000", 6))
    // Transfer permit tokens to payers
    await Mock20PermitContract.transfer(payer1.address,web3.utils.toWei("10000"))
    await Mock20PermitContract.transfer(payer2.address,web3.utils.toWei("10000"))
    await Mock20PermitContract.transfer(payer3.address,web3.utils.toWei("10000"))

  });


 // Test cases
 it('Check contract deployment', async function () {
  expect(await EscrowContract.address).to.exist;
  
});

it('Escrow - deposit', async function () {
  let fundTokens=await EscrowContract.connect(payer1).getUserTokens(payer1.address)
  expect(fundTokens).to.be.empty;
  expect(await Mock20Contract.balanceOf(EscrowContract.address)).to.equal(0);
  expect(await Mock20DecimalsContract.balanceOf(EscrowContract.address)).to.equal(0);
  await Mock20Contract.connect(payer1).approve(EscrowContract.address, web3.utils.toWei("10000"));
  await EscrowContract.connect(payer1).deposit(Mock20Contract.address,web3.utils.toWei("100"));
  fundTokens=await EscrowContract.connect(payer1).getUserTokens(payer1.address)
  expect(fundTokens).to.include(Mock20Contract.address);
  expect(await Mock20Contract.balanceOf(EscrowContract.address)).to.equal(web3.utils.toWei("100"));
  expect(await Mock20DecimalsContract.balanceOf(EscrowContract.address)).to.equal(0);
  const funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
  expect(funds.available).to.equal(web3.utils.toWei("100"))
  expect(funds.locked).to.equal(0)
  const locks=await EscrowContract.connect(payer1).getLocks(addressZero,addressZero,payee1.address)
  expect(locks.length).to.equal(0)
  const auths=await EscrowContract.connect(payer1).getAuthorizations(Mock20Contract.address,payer1.address,addressZero)
  expect(auths.length).to.equal(0)
  
});

it('Escrow - withdraw', async function () {
    const balanceMock20=await Mock20Contract.balanceOf(EscrowContract.address);
    const balanceMock20Decimal=await Mock20DecimalsContract.balanceOf(EscrowContract.address);
    await EscrowContract.connect(payer1).withdraw([Mock20Contract.address],[web3.utils.toWei("10000")]);
    expect(await Mock20Contract.balanceOf(EscrowContract.address)).to.equal(balanceMock20);
    await EscrowContract.connect(payer1).withdraw([Mock20Contract.address],[web3.utils.toWei("10")]);
    expect(await Mock20Contract.balanceOf(EscrowContract.address)).to.equal(web3.utils.toWei("90"));
    expect(await EscrowContract.connect(payer1).getUserTokens(payer1.address)).to.include(Mock20Contract.address);
});


it('Escrow - auth', async function () {
    await EscrowContract.connect(payer1).authorizeMultiple([Mock20Contract.address],[payee1.address],[web3.utils.toWei("50")],[100],[2]);
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
    const expire = 60
    await expect(EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer2.address,web3.utils.toWei("50"),expire)).to.be.revertedWith("Payer does not have enough funds")
    //payer2 has funds, but no auth
    await Mock20Contract.connect(payer2).approve(EscrowContract.address, web3.utils.toWei("10000"));
    await EscrowContract.connect(payer2).depositMultiple([Mock20Contract.address],[web3.utils.toWei("100")]);
    
    await expect(EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer2.address,web3.utils.toWei("50"),expire)).to.be.revertedWith("No auth found")
    
    //payee1 tries to lock too much
    await expect(EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("60"),expire)).to.be.revertedWith("Exceeds maxLockedAmount")
    await expect(EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,0,expire)).to.be.revertedWith("Invalid amount")
    await expect(EscrowContract.connect(payee1).createLock(0,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)).to.be.revertedWith("Invalid jobId")
    await EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)
    let locks=await EscrowContract.connect(payer1).getLocks(addressZero,addressZero,payee1.address)
    expect(locks.length).to.equal(1)
    await expect(EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)).to.be.revertedWith("JobId already exists")
    jobId=2 // partial claim
    await EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)
    locks=await EscrowContract.connect(payer1).getLocks(addressZero,addressZero,payee1.address)
    expect(locks.length).to.equal(2)
    // previous auth had only 2 concurent locks
    await expect(EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)).to.be.revertedWith("Exceeds maxLockCounts")
    await EscrowContract.connect(payer1).authorize(Mock20Contract.address,payee1.address,web3.utils.toWei("50"),100,10);
    jobId=3 // expired
    await EscrowContract.connect(payee1).createLock(jobId,Mock20Contract.address,payer1.address,web3.utils.toWei("10"),expire)
    locks=await EscrowContract.connect(payer1).getLocks(addressZero,addressZero,payee1.address)
    expect(locks.length).to.equal(3)
    jobId=4 // unclaimed
    await EscrowContract.connect(payee1).createLocks([jobId],[Mock20Contract.address],[payer1.address],[web3.utils.toWei("10")],[expire])
    locks=await EscrowContract.connect(payer1).getLocks(addressZero,addressZero,payee1.address)
    expect(locks.length).to.equal(4)
    });

  it('Escrow - claim entire amount', async function () {
    const payer1Funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
    const payer1Available=payer1Funds.available
    const payer1Locked=payer1Funds.locked
    const payee1Balance=await Mock20Contract.balanceOf(payee1.address)
    const opcBalance=await Mock20Contract.balanceOf(opcCollector.address)
    
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
    const tx=await EscrowContract.connect(payee1).claimLocksAndWithdraw([lock.jobId],[lock.token],[lock.payer],[lock.amount],[0],[0],[[]]);
    const txReceipt = await tx.wait();
    const event = getEventFromTx(txReceipt, 'Claimed')
    assert(event, "Cannot find Claimed event")
    const opcBalanceAfter=await Mock20Contract.balanceOf(opcCollector.address)
    
    const opcCollectorFee=await FactoryRouter.getOPCFee(Mock20Contract.address)
    const expectedPayee=lock.amount.sub(lock.amount.mul(opcCollectorFee).div(web3.utils.toWei("1")));
    expect(event.args.amount).to.equal(lock.amount)
    expect(opcBalanceAfter).to.equal(opcBalance.add(lock.amount.sub(expectedPayee)))
    const afterpayer1Funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
    const afterpayer1Available=afterpayer1Funds.available
    const afterpayer1Locked=afterpayer1Funds.locked
    const afterpayee1Balance=await Mock20Contract.balanceOf(payee1.address)
    expect(afterpayer1Available).to.equal(payer1Available)
    expect(afterpayer1Locked).to.equal(payer1Locked.sub(lock.amount))
    expect(afterpayee1Balance).to.equal(payee1Balance.add(expectedPayee))
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
    const opcBalance=await Mock20Contract.balanceOf(opcCollector.address)
    
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
    const bnClaimedAmount=ethers.BigNumber.from(claimedAmount)
    const returnAmount=lock.amount.sub(claimedAmount)
    const tx=await EscrowContract.connect(payee1).claimLocksAndWithdraw([lock.jobId],[lock.token],[lock.payer],[claimedAmount],[0],[0],[[]]);
    const txReceipt = await tx.wait();
    const event = getEventFromTx(txReceipt, 'Claimed')
    assert(event, "Cannot find Claimed event")
    const opcBalanceAfter=await Mock20Contract.balanceOf(opcCollector.address)
    
    const opcCollectorFee=await FactoryRouter.getOPCFee(Mock20Contract.address)
    const expectedPayee=bnClaimedAmount.sub(bnClaimedAmount.mul(opcCollectorFee).div(web3.utils.toWei("1")));
    expect(opcBalanceAfter).to.equal(opcBalance.add(bnClaimedAmount.sub(expectedPayee)))
    const afterpayer1Funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
    const afterpayer1Available=afterpayer1Funds.available
    const afterpayer1Locked=afterpayer1Funds.locked
    const afterpayee1Balance=await Mock20Contract.balanceOf(payee1.address)
    expect(afterpayer1Available).to.equal(payer1Available.add(returnAmount))
    expect(afterpayer1Locked).to.equal(payer1Locked.sub(lock.amount))
    expect(afterpayee1Balance).to.equal(payee1Balance.add(expectedPayee))
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
    const tx=await EscrowContract.connect(payee1).claimLocksAndWithdraw([lock.jobId],[lock.token],[lock.payer],[claimedAmount],[0],[0],[[]]);
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
    const tx=await EscrowContract.connect(payer1).cancelExpiredLocks([lock.jobId],[lock.token],[lock.payer],[payee1.address]);
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
  it('Escrow - deposit with decimals', async function () {
    expect(await Mock20DecimalsContract.balanceOf(EscrowContract.address)).to.equal(0);
    await Mock20DecimalsContract.connect(payer1).approve(EscrowContract.address, ethers.utils.parseUnits("10000", 6));
    await EscrowContract.connect(payer1).deposit(Mock20DecimalsContract.address,ethers.utils.parseUnits("100", 6));
    
    expect(await Mock20DecimalsContract.balanceOf(EscrowContract.address)).to.equal(ethers.utils.parseUnits("100", 6));
    const funds=await EscrowContract.connect(payer1).getFunds(Mock20DecimalsContract.address)
    expect(funds.available).to.equal(ethers.utils.parseUnits("100", 6))
    expect(funds.locked).to.equal(0)
    const locks=await EscrowContract.connect(payer1).getLocks(addressZero,addressZero,payee1.address)
    expect(locks.length).to.equal(0)
    const auths=await EscrowContract.connect(payer1).getAuthorizations(Mock20DecimalsContract.address,payer1.address,addressZero)
    expect(auths.length).to.equal(0)
    
  });

  it('Escrow - withdraw with decimals', async function () {
      const balanceMock20=await Mock20DecimalsContract.balanceOf(EscrowContract.address);
      await EscrowContract.connect(payer1).withdraw([Mock20DecimalsContract.address],[ethers.utils.parseUnits("10000", 6)]);
      expect(await Mock20DecimalsContract.balanceOf(EscrowContract.address)).to.equal(balanceMock20);
      await EscrowContract.connect(payer1).withdraw([Mock20DecimalsContract.address],[ethers.utils.parseUnits("10", 6)]);
      expect(await Mock20DecimalsContract.balanceOf(EscrowContract.address)).to.equal(ethers.utils.parseUnits("90", 6));
  });
  it('Escrow - withdraw all funds', async function () {
    expect(await EscrowContract.connect(payer1).getUserTokens(payer1.address)).to.include(Mock20Contract.address);
    const payer1Funds=await EscrowContract.connect(payer1).getFunds(Mock20Contract.address)
    await EscrowContract.connect(payer1).withdraw([Mock20Contract.address],[payer1Funds.available]);
    expect(await EscrowContract.connect(payer1).getUserTokens(payer1.address)).does.not.include(Mock20Contract.address);
  });

  it('Escrow - depositWithPermit', async function () {
    const depositAmount = web3.utils.toWei("100");
    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600; // 1 hour from now
    const nonce = await Mock20PermitContract.nonces(payer1.address);

    // Get initial balances
    const contractBalanceBefore = await Mock20PermitContract.balanceOf(EscrowContract.address);
    const payerBalanceBefore = await Mock20PermitContract.balanceOf(payer1.address);
    const fundTokensBefore = await EscrowContract.connect(payer1).getUserTokens(payer1.address);

    // Sign permit
    const { v, r, s } = await signPermit(
      payer1,
      Mock20PermitContract,
      EscrowContract.address,
      depositAmount,
      deadline,
      nonce
    );

    // Deposit with permit (no prior approval needed)
    const tx = await EscrowContract.connect(payer1).depositWithPermit(
      Mock20PermitContract.address,
      depositAmount,
      deadline,
      v,
      r,
      s
    );
    const txReceipt = await tx.wait();

    // Check balances after deposit
    const contractBalanceAfter = await Mock20PermitContract.balanceOf(EscrowContract.address);
    const payerBalanceAfter = await Mock20PermitContract.balanceOf(payer1.address);
    const fundTokensAfter = await EscrowContract.connect(payer1).getUserTokens(payer1.address);

    // Verify balances
    expect(contractBalanceAfter).to.equal(contractBalanceBefore.add(depositAmount));
    expect(payerBalanceAfter).to.equal(payerBalanceBefore.sub(depositAmount));
    expect(fundTokensAfter).to.include(Mock20PermitContract.address);

    // Verify funds
    const funds = await EscrowContract.connect(payer1).getFunds(Mock20PermitContract.address);
    expect(funds.available).to.equal(depositAmount);
    expect(funds.locked).to.equal(0);

    // Check event
    const event = getEventFromTx(txReceipt, "Deposit");
    expect(event).to.exist;
    expect(event.args.payer).to.equal(payer1.address);
    expect(event.args.token).to.equal(Mock20PermitContract.address);
    expect(event.args.amount).to.equal(depositAmount);

    // Verify allowance was consumed
    const allowance = await Mock20PermitContract.allowance(payer1.address, EscrowContract.address);
    expect(allowance).to.equal(0);
  });

  it('Escrow - depositWithPermit should revert with expired deadline', async function () {
    const depositAmount = web3.utils.toWei("100");
    const block = await ethers.provider.getBlock("latest");
    const expiredDeadline = block.timestamp - 3600; // 1 hour ago
    const nonce = await Mock20PermitContract.nonces(payer2.address);

    const { v, r, s } = await signPermit(
      payer2,
      Mock20PermitContract,
      EscrowContract.address,
      depositAmount,
      expiredDeadline,
      nonce
    );

    await expect(
      EscrowContract.connect(payer2).depositWithPermit(
        Mock20PermitContract.address,
        depositAmount,
        expiredDeadline,
        v,
        r,
        s
      )
    ).to.be.revertedWith("ERC20Permit: expired deadline");
  });

  it('Escrow - depositWithPermit should revert with invalid signature', async function () {
    const depositAmount = web3.utils.toWei("100");
    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;
    const nonce = await Mock20PermitContract.nonces(payer2.address);

    // Sign with wrong signer (payer3 instead of payer2)
    const { v, r, s } = await signPermit(
      payer3,
      Mock20PermitContract,
      EscrowContract.address,
      depositAmount,
      deadline,
      nonce
    );

    await expect(
      EscrowContract.connect(payer2).depositWithPermit(
        Mock20PermitContract.address,
        depositAmount,
        deadline,
        v,
        r,
        s
      )
    ).to.be.revertedWith("ERC20Permit: invalid signature");
  });

  it('Escrow - depositWithPermit works without prior approval', async function () {
    const depositAmount = web3.utils.toWei("50");
    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;
    const nonce = await Mock20PermitContract.nonces(payer3.address);

    // Verify no allowance before
    const allowanceBefore = await Mock20PermitContract.allowance(payer3.address, EscrowContract.address);
    expect(allowanceBefore).to.equal(0);

    const { v, r, s } = await signPermit(
      payer3,
      Mock20PermitContract,
      EscrowContract.address,
      depositAmount,
      deadline,
      nonce
    );

    // Deposit with permit (no prior approval needed)
    await EscrowContract.connect(payer3).depositWithPermit(
      Mock20PermitContract.address,
      depositAmount,
      deadline,
      v,
      r,
      s
    );

    // Verify deposit succeeded
    const funds = await EscrowContract.connect(payer3).getFunds(Mock20PermitContract.address);
    expect(funds.available).to.equal(depositAmount);
  });

  // ---------- new feature tests: Auth token, bundle, reLock ----------

  it('Escrow - Auth event includes token', async function () {
    const tx = await EscrowContract.connect(payer3).authorize(
      Mock20Contract.address, payee3.address, web3.utils.toWei("1000"), 1000, 10
    );
    const event = getEventFromTx(await tx.wait(), 'Auth');
    assert(event, "Cannot find Auth event");
    expect(event.args.payer).to.equal(payer3.address);
    expect(event.args.payee).to.equal(payee3.address);
    expect(event.args.token).to.equal(Mock20Contract.address);
    expect(event.args.maxLockedAmount).to.equal(web3.utils.toWei("1000"));
    expect(event.args.maxLockSeconds).to.equal(1000);
    expect(event.args.maxLockCounts).to.equal(10);
  });

  it('Escrow - bundle deposits, permit-deposit and auths in one call', async function () {
    const depAmount = web3.utils.toWei("20");
    const permitAmount = web3.utils.toWei("30");
    await Mock20Contract.connect(payer2).approve(EscrowContract.address, web3.utils.toWei("10000"));
    const beforeMock20 = (await EscrowContract.connect(payer2).getFunds(Mock20Contract.address)).available;
    const beforePermit = (await EscrowContract.connect(payer2).getFunds(Mock20PermitContract.address)).available;
    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;
    const nonce = await Mock20PermitContract.nonces(payer2.address);
    const { v, r, s } = await signPermit(payer2, Mock20PermitContract, EscrowContract.address, permitAmount, deadline, nonce);
    const deposits = [{ token: Mock20Contract.address, amount: depAmount }];
    const permits = [{ token: Mock20PermitContract.address, amount: permitAmount, deadline, v, r, s }];
    const auths = [
      { token: Mock20Contract.address, payee: payee2.address, maxLockedAmount: web3.utils.toWei("40"), maxLockSeconds: 500, maxLockCounts: 3 },
      { token: Mock20PermitContract.address, payee: payee3.address, maxLockedAmount: web3.utils.toWei("10"), maxLockSeconds: 200, maxLockCounts: 1 },
    ];
    await EscrowContract.connect(payer2).bundle(deposits, permits, auths);
    expect((await EscrowContract.connect(payer2).getFunds(Mock20Contract.address)).available).to.equal(beforeMock20.add(depAmount));
    expect((await EscrowContract.connect(payer2).getFunds(Mock20PermitContract.address)).available).to.equal(beforePermit.add(permitAmount));
    expect(await EscrowContract.connect(payer2).getUserTokens(payer2.address)).to.include(Mock20PermitContract.address);
    const a1 = await EscrowContract.connect(payer2).getAuthorizations(Mock20Contract.address, payer2.address, payee2.address);
    expect(a1.length).to.equal(1);
    expect(a1[0].maxLockedAmount).to.equal(web3.utils.toWei("40"));
    const a2 = await EscrowContract.connect(payer2).getAuthorizations(Mock20PermitContract.address, payer2.address, payee3.address);
    expect(a2.length).to.equal(1);
    expect(a2[0].maxLockSeconds).to.equal(200);
  });

  it('Escrow - bundle works with empty sub-arrays (auths only)', async function () {
    await EscrowContract.connect(payer2).bundle([], [], [
      { token: Mock20Contract.address, payee: payee3.address, maxLockedAmount: web3.utils.toWei("5"), maxLockSeconds: 100, maxLockCounts: 1 },
    ]);
    const a = await EscrowContract.connect(payer2).getAuthorizations(Mock20Contract.address, payer2.address, payee3.address);
    expect(a.length).to.equal(1);
    expect(a[0].maxLockedAmount).to.equal(web3.utils.toWei("5"));
  });

  it('Escrow - reLock increases and decreases the amount', async function () {
    // fund payer3 and lock as payee3 (auth set in the Auth-event test: 1000 max, 1000s, 10 counts)
    await Mock20Contract.connect(payer3).approve(EscrowContract.address, web3.utils.toWei("10000"));
    await EscrowContract.connect(payer3).deposit(Mock20Contract.address, web3.utils.toWei("2000"));
    const jobId = 1001;
    await EscrowContract.connect(payee3).createLock(jobId, Mock20Contract.address, payer3.address, web3.utils.toWei("10"), 500);
    const findLock = async () => (await EscrowContract.connect(payee3).getLocks(Mock20Contract.address, payer3.address, payee3.address)).find(l => l.jobId.eq(jobId));
    const created = await findLock();
    const startTime = created.startTime;
    const base = await EscrowContract.connect(payer3).getFunds(Mock20Contract.address); // after createLock(10)

    // reLock UP to 25
    const tx = await EscrowContract.connect(payee3).reLock(jobId, Mock20Contract.address, payer3.address, web3.utils.toWei("25"), 600);
    const ev = getEventFromTx(await tx.wait(), 'ReLock');
    assert(ev, "Cannot find ReLock event");
    expect(ev.args.oldAmount).to.equal(web3.utils.toWei("10"));
    expect(ev.args.newAmount).to.equal(web3.utils.toWei("25"));
    expect(ev.args.token).to.equal(Mock20Contract.address);
    let funds = await EscrowContract.connect(payer3).getFunds(Mock20Contract.address);
    expect(funds.locked).to.equal(base.locked.add(web3.utils.toWei("15")));
    expect(funds.available).to.equal(base.available.sub(web3.utils.toWei("15")));
    let lk = await findLock();
    expect(lk.amount).to.equal(web3.utils.toWei("25"));
    expect(lk.startTime).to.equal(startTime); // preserved across reLock
    let au = (await EscrowContract.connect(payer3).getAuthorizations(Mock20Contract.address, payer3.address, payee3.address))[0];
    expect(au.currentLockedAmount).to.equal(web3.utils.toWei("25"));
    expect(au.currentLocks).to.equal(1);

    // reLock DOWN to 5
    await EscrowContract.connect(payee3).reLock(jobId, Mock20Contract.address, payer3.address, web3.utils.toWei("5"), 200);
    funds = await EscrowContract.connect(payer3).getFunds(Mock20Contract.address);
    expect(funds.locked).to.equal(base.locked.sub(web3.utils.toWei("5")));
    expect(funds.available).to.equal(base.available.add(web3.utils.toWei("5")));
    lk = await findLock();
    expect(lk.amount).to.equal(web3.utils.toWei("5"));
    expect(lk.startTime).to.equal(startTime);
    au = (await EscrowContract.connect(payer3).getAuthorizations(Mock20Contract.address, payer3.address, payee3.address))[0];
    expect(au.currentLockedAmount).to.equal(web3.utils.toWei("5"));
    expect(au.currentLocks).to.equal(1); // unchanged
  });

  it('Escrow - reLock caps total lifetime at maxLockSeconds from original start', async function () {
    const jobId = 1002;
    await EscrowContract.connect(payee3).createLock(jobId, Mock20Contract.address, payer3.address, web3.utils.toWei("10"), 500);
    const lk = (await EscrowContract.connect(payee3).getLocks(Mock20Contract.address, payer3.address, payee3.address)).find(l => l.jobId.eq(jobId));
    await fastForward(200);
    const cap = lk.startTime.toNumber() + 1000; // maxLockSeconds = 1000
    const now = await blocktimestamp();
    const okExpiry = cap - now - 5;
    const badExpiry = cap - now + 50;
    // extending within the cap succeeds
    await EscrowContract.connect(payee3).reLock(jobId, Mock20Contract.address, payer3.address, web3.utils.toWei("10"), okExpiry);
    // extending beyond startTime + maxLockSeconds reverts
    await expect(
      EscrowContract.connect(payee3).reLock(jobId, Mock20Contract.address, payer3.address, web3.utils.toWei("10"), badExpiry)
    ).to.be.revertedWith("Expiry too high");
  });

  it('Escrow - reLock reverts (not found / funds / maxLocked / expired)', async function () {
    const jobId = 1003;
    await EscrowContract.connect(payee3).createLock(jobId, Mock20Contract.address, payer3.address, web3.utils.toWei("10"), 500);
    // wrong jobId
    await expect(
      EscrowContract.connect(payee3).reLock(999999, Mock20Contract.address, payer3.address, web3.utils.toWei("10"), 100)
    ).to.be.revertedWith("Lock not found");
    // amount beyond available + old -> not enough funds
    await expect(
      EscrowContract.connect(payee3).reLock(jobId, Mock20Contract.address, payer3.address, web3.utils.toWei("100000"), 100)
    ).to.be.revertedWith("Payer does not have enough funds");
    // amount within funds but beyond maxLockedAmount (1000)
    await expect(
      EscrowContract.connect(payee3).reLock(jobId, Mock20Contract.address, payer3.address, web3.utils.toWei("1500"), 100)
    ).to.be.revertedWith("Exceeds maxLockedAmount");
    // expired lock cannot be reLocked
    const expiringJob = 1004;
    await EscrowContract.connect(payee3).createLock(expiringJob, Mock20Contract.address, payer3.address, web3.utils.toWei("10"), 50);
    await fastForward(100);
    await expect(
      EscrowContract.connect(payee3).reLock(expiringJob, Mock20Contract.address, payer3.address, web3.utils.toWei("10"), 40)
    ).to.be.revertedWith("Lock expired");
  });

  // ---------- bundleJobs: batch payee-side operations ----------

  it('Escrow - bundleJobs runs claims before creates so freed capacity is reusable', async function () {
    // dedicated tight auth: payer2 -> payee2, maxLockCounts = 2
    await Mock20Contract.connect(payer2).approve(EscrowContract.address, web3.utils.toWei("10000"));
    await EscrowContract.connect(payer2).deposit(Mock20Contract.address, web3.utils.toWei("200"));
    await EscrowContract.connect(payer2).authorize(Mock20Contract.address, payee2.address, web3.utils.toWei("100"), 1000, 2);
    // fill capacity with 2 locks
    await EscrowContract.connect(payee2).createLock(5001, Mock20Contract.address, payer2.address, web3.utils.toWei("10"), 500);
    await EscrowContract.connect(payee2).createLock(5002, Mock20Contract.address, payer2.address, web3.utils.toWei("10"), 500);
    // at capacity: a plain 3rd createLock reverts
    await expect(
      EscrowContract.connect(payee2).createLock(5003, Mock20Contract.address, payer2.address, web3.utils.toWei("10"), 500)
    ).to.be.revertedWith("Exceeds maxLockCounts");
    // but bundleJobs claims 5001 first (frees a slot), then creates 5003 and reLocks 5002 -> all atomic
    const claims = [{ jobId: 5001, token: Mock20Contract.address, payer: payer2.address, amount: web3.utils.toWei("10"), proof: "0x", jobType: 0, subsidyProviders: [] }];
    const cancels = [];
    const newLocks = [{ jobId: 5003, token: Mock20Contract.address, payer: payer2.address, amount: web3.utils.toWei("10"), expiry: 500 }];
    const reLocks = [{ jobId: 5002, token: Mock20Contract.address, payer: payer2.address, amount: web3.utils.toWei("15"), expiry: 400 }];
    const rc = await (await EscrowContract.connect(payee2).bundleJobs(claims, cancels, newLocks, reLocks)).wait();
    assert(getEventFromTx(rc, 'Claimed'), "missing Claimed event");
    assert(getEventFromTx(rc, 'Lock'), "missing Lock event");
    assert(getEventFromTx(rc, 'ReLock'), "missing ReLock event");
    const locks = await EscrowContract.connect(payee2).getLocks(Mock20Contract.address, payer2.address, payee2.address);
    expect(locks.find(l => l.jobId.eq(5001))).to.be.undefined; // claimed
    expect(locks.find(l => l.jobId.eq(5002)).amount).to.equal(web3.utils.toWei("15")); // reLocked
    expect(locks.find(l => l.jobId.eq(5003)).amount).to.equal(web3.utils.toWei("10")); // created
    const au = (await EscrowContract.connect(payer2).getAuthorizations(Mock20Contract.address, payer2.address, payee2.address))[0];
    expect(au.currentLocks).to.equal(2); // 5002 + 5003 (5001 claimed)
    expect(au.currentLockedAmount).to.equal(web3.utils.toWei("25")); // 15 + 10
  });

  it('Escrow - bundleJobs cancels expired locks', async function () {
    // raise the count cap, create a short-lived lock, let it expire
    await EscrowContract.connect(payer2).authorize(Mock20Contract.address, payee2.address, web3.utils.toWei("1000"), 1000, 10);
    await EscrowContract.connect(payee2).createLock(5101, Mock20Contract.address, payer2.address, web3.utils.toWei("10"), 50);
    await fastForward(100);
    const before = await EscrowContract.connect(payer2).getFunds(Mock20Contract.address);
    const rc = await (await EscrowContract.connect(payee2).bundleJobs(
      [], [{ jobId: 5101, token: Mock20Contract.address, payer: payer2.address, payee: payee2.address }], [], []
    )).wait();
    assert(getEventFromTx(rc, 'Canceled'), "missing Canceled event");
    const locks = await EscrowContract.connect(payee2).getLocks(Mock20Contract.address, payer2.address, payee2.address);
    expect(locks.find(l => l.jobId.eq(5101))).to.be.undefined;
    const after = await EscrowContract.connect(payer2).getFunds(Mock20Contract.address);
    expect(after.locked).to.equal(before.locked.sub(web3.utils.toWei("10")));
    expect(after.available).to.equal(before.available.add(web3.utils.toWei("10")));
  });

  it('Escrow - bundleJobs with all-empty arrays is a no-op', async function () {
    await EscrowContract.connect(payee2).bundleJobs([], [], [], []);
  });
});

// ===================== Subsidy Providers (Escrow / OPC router fee) =====================
describe('Escrow - Subsidy Providers', function () {
  const P = (n) => ethers.utils.parseEther(n);
  const D6 = (n) => ethers.utils.parseUnits(n, 6);
  const ZERO = '0x0000000000000000000000000000000000000000';
  const MAXU = ethers.constants.MaxUint256;

  let deployer, node, node2, payer, payer2, feeColl, eoa;
  let Router, Escrow, MockErc20, MockErc20Decimals, ProviderF, JunkF, FbF, RevF, FoTF, NoRetF;
  let router, escrow, T18, T6;
  let opcFee; // per-1e18 rate
  let jobSeq = 1;
  const tracked = new Set();

  const feeOf = (base) => base.mul(opcFee).div(P('1'));
  const addUser = (a) => tracked.add(a);

  async function setFee(rate) {
    opcFee = rate;
    await router.connect(deployer).updateOPCFee(rate, rate, 0, 0);
  }
  async function fund(token, who, amount) { await token.connect(deployer).transfer(who, amount); }
  async function deposit(who, token, amount) {
    await token.connect(who).approve(escrow.address, MAXU);
    await escrow.connect(who).deposit(token.address, amount);
    addUser(who.address);
  }
  async function authorize(payerS, nodeAddr, token, maxLocked) {
    await escrow.connect(payerS).authorize(token.address, nodeAddr, maxLocked, 1000000, 1000);
  }
  async function createLock(nodeS, token, payerS, amount, expiry) {
    const jobId = jobSeq++;
    await escrow.connect(nodeS).createLock(jobId, token.address, payerS.address, amount, expiry || 100000);
    return jobId;
  }
  async function newProvider(token, subsidy, bonus, budget, balance) {
    const p = await ProviderF.deploy(escrow.address, token.address);
    await p.deployed();
    await p.configure(subsidy, bonus, budget === undefined ? P('1000000') : budget);
    if (balance === undefined) balance = P('1000000');
    if (balance.gt && balance.gt(0)) await fund(token, p.address, balance);
    return p;
  }
  function subsidizedEvents(rc) { return rc.events ? rc.events.filter(e => e.event === 'Subsidized') : []; }
  async function assertSolvent(token, { allowDust = false } = {}) {
    let sum = ethers.BigNumber.from(0);
    for (const u of tracked) {
      const f = await escrow.getUserFunds(u, token.address);
      sum = sum.add(f.available).add(f.locked);
    }
    const bal = await token.balanceOf(escrow.address);
    if (allowDust) expect(bal.gte(sum), `escrow ${bal} >= obligations ${sum}`).to.equal(true);
    else expect(bal).to.equal(sum);
    return { bal, sum };
  }

  before(async function () {
    const s = await ethers.getSigners();
    deployer = s[0]; node = s[1]; node2 = s[2]; payer = s[4]; payer2 = s[5]; feeColl = s[8]; eoa = s[9];
    Router = await ethers.getContractFactory('FactoryRouter');
    Escrow = await ethers.getContractFactory('Escrow');
    MockErc20 = await ethers.getContractFactory('MockERC20');
    MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
    ProviderF = await ethers.getContractFactory('MockSubsidyProvider');
    JunkF = await ethers.getContractFactory('MaliciousReturnDataToken');
    FbF = await ethers.getContractFactory('FallbackReturningTwoUints');
    RevF = await ethers.getContractFactory('RevertingFallback');
    FoTF = await ethers.getContractFactory('MockERC20FeeOnTransfer');
    NoRetF = await ethers.getContractFactory('MockERC20NoReturn');

    T18 = await MockErc20.deploy(deployer.address, 'S18', 'S18');
    await T18.deployed();
    T6 = await MockErc20Decimals.deploy('S6', 'S6', 6);
    await T6.deployed();
    // 6-dec token mints to deployer already; 18-dec mints 1e28 to deployer
    router = await Router.deploy(deployer.address, T18.address, '0x000000000000000000000000000000000000dead', feeColl.address, []);
    await router.deployed();
    escrow = await Escrow.deploy(router.address, feeColl.address);
    await escrow.deployed();
    await setFee(P('0.1')); // 10% default

    // fund the payers with the freshly-deployed subsidy-test tokens (the outer before() only funds
    // the outer Mock20 tokens); providers are funded per-test in newProvider().
    await fund(T18, payer.address, P('1000000'));
    await fund(T18, payer2.address, P('1000000'));
    await fund(T6, payer.address, D6('1000000'));
    await fund(T6, payer2.address, D6('1000000'));

    // Solvency accounting must count EVERY address that can hold escrow bookkeeping, including the
    // payee nodes that accumulate payout across tests (they never withdraw). Without this the
    // escrow's real balance exceeds the tracked Σ(available+locked) and assertSolvent under-counts.
    addUser(payer.address); addUser(payer2.address);
    addUser(node.address); addUser(node2.address);
  });

  // 1. single provider, partial subsidy (worked example A)
  it('1 single provider partial subsidy (example A)', async function () {
    await deposit(payer, T18, P('10'));
    await authorize(payer, node.address, T18, P('100'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const prov = await newProvider(T18, P('3'), P('0'));

    const before = {
      payer: await escrow.getUserFunds(payer.address, T18.address),
      node: await escrow.getUserFunds(node.address, T18.address),
      prov: await T18.balanceOf(prov.address),
      fee: await T18.balanceOf(feeColl.address),
    };
    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 7, [prov.address])).wait();
    const ev = subsidizedEvents(rc);
    expect(ev.length).to.equal(1);
    expect(ev[0].args.subsidyAmount).to.equal(P('3'));
    expect(ev[0].args.bonusAmount).to.equal(P('0'));

    const payoutBase = P('10'); // amount + bonus(0)
    const payout = payoutBase.sub(feeOf(payoutBase)); // 9
    const after = {
      payer: await escrow.getUserFunds(payer.address, T18.address),
      node: await escrow.getUserFunds(node.address, T18.address),
      prov: await T18.balanceOf(prov.address),
      fee: await T18.balanceOf(feeColl.address),
    };
    expect(after.payer.available.sub(before.payer.available)).to.equal(P('3')); // subsidy back
    expect(before.payer.locked.sub(after.payer.locked)).to.equal(P('10'));
    expect(after.node.available.sub(before.node.available)).to.equal(payout);
    expect(before.prov.sub(after.prov)).to.equal(P('3'));
    expect(after.fee.sub(before.fee)).to.equal(feeOf(payoutBase)); // 1
    await assertSolvent(T18);
  });

  // 2. bonus only (worked example B)
  it('2 bonus only (example B)', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const prov = await newProvider(T18, P('0'), P('1'));

    const bPayer = await escrow.getUserFunds(payer.address, T18.address);
    const bNode = await escrow.getUserFunds(node.address, T18.address);
    const bProv = await T18.balanceOf(prov.address);
    const bFee = await T18.balanceOf(feeColl.address);

    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [prov.address])).wait();
    const ev = subsidizedEvents(rc);
    expect(ev.length).to.equal(1);
    expect(ev[0].args.subsidyAmount).to.equal(0);
    expect(ev[0].args.bonusAmount).to.equal(P('1'));

    const payoutBase = P('11'); // 10 + bonus 1
    const payout = payoutBase.sub(feeOf(payoutBase)); // 11 - 1.1 = 9.9
    const aPayer = await escrow.getUserFunds(payer.address, T18.address);
    const aNode = await escrow.getUserFunds(node.address, T18.address);
    expect(aPayer.available.sub(bPayer.available)).to.equal(0); // no subsidy back
    expect(aNode.available.sub(bNode.available)).to.equal(payout);
    expect(bProv.sub(await T18.balanceOf(prov.address))).to.equal(P('1'));
    expect((await T18.balanceOf(feeColl.address)).sub(bFee)).to.equal(feeOf(payoutBase));
    await assertSolvent(T18);
  });

  // 3. subsidy + bonus combined
  it('3 subsidy + bonus combined', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const prov = await newProvider(T18, P('3'), P('2'));
    const bPayer = await escrow.getUserFunds(payer.address, T18.address);
    const bNode = await escrow.getUserFunds(node.address, T18.address);
    const bProv = await T18.balanceOf(prov.address);

    await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [prov.address])).wait();
    const payoutBase = P('12');
    const payout = payoutBase.sub(feeOf(payoutBase));
    expect((await escrow.getUserFunds(payer.address, T18.address)).available.sub(bPayer.available)).to.equal(P('3'));
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(payout);
    expect(bProv.sub(await T18.balanceOf(prov.address))).to.equal(P('5'));
    await assertSolvent(T18);
  });

  // 3b. two providers, subsidy accumulation + bonus (worked example C)
  it('3b two providers accumulate subsidy + bonus (example C)', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const p1 = await newProvider(T18, P('1'), P('1'));
    const p2 = await newProvider(T18, P('3'), P('0'));
    const bPayer = await escrow.getUserFunds(payer.address, T18.address);
    const bNode = await escrow.getUserFunds(node.address, T18.address);
    const b1 = await T18.balanceOf(p1.address);
    const b2 = await T18.balanceOf(p2.address);

    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [p1.address, p2.address])).wait();
    const ev = subsidizedEvents(rc);
    expect(ev.length).to.equal(2);
    expect(ev[0].args.subsidyAmount).to.equal(P('1'));
    expect(ev[0].args.bonusAmount).to.equal(P('1'));
    expect(ev[1].args.subsidyAmount).to.equal(P('3'));
    expect(ev[1].args.bonusAmount).to.equal(P('0'));

    const payoutBase = P('11'); // 10 + total bonus 1
    const payout = payoutBase.sub(feeOf(payoutBase));
    expect((await escrow.getUserFunds(payer.address, T18.address)).available.sub(bPayer.available)).to.equal(P('4'));
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(payout);
    expect(b1.sub(await T18.balanceOf(p1.address))).to.equal(P('2'));
    expect(b2.sub(await T18.balanceOf(p2.address))).to.equal(P('3'));
    await assertSolvent(T18);
  });

  // 4. multiple providers accumulate & cap + subsidyNeeded hint, no early break
  it('4 cap subsidy + subsidyNeeded hint + no early break bonus', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    // p1,p2 fully cover (5+5); p3 offers subsidy 4 (dropped, remaining 0) but a bonus 2 (still taken)
    const p1 = await newProvider(T18, P('5'), P('0'));
    const p2 = await newProvider(T18, P('5'), P('0'));
    const p3 = await newProvider(T18, P('4'), P('2'));
    const bNode = await escrow.getUserFunds(node.address, T18.address);
    const bPayer = await escrow.getUserFunds(payer.address, T18.address);

    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [p1.address, p2.address, p3.address])).wait();
    // p3 was called with subsidyNeeded == 0 (fully covered by p1+p2) yet still contributed a bonus
    expect(await p3.lastSubsidyNeeded()).to.equal(0);
    const ev = subsidizedEvents(rc);
    // p1(5,0), p2(5,0), p3(0 subsidy capped, bonus 2)
    expect(ev.length).to.equal(3);
    expect(ev[2].args.subsidyAmount).to.equal(0);
    expect(ev[2].args.bonusAmount).to.equal(P('2'));
    const payoutBase = P('12'); // 10 + bonus 2
    expect((await escrow.getUserFunds(payer.address, T18.address)).available.sub(bPayer.available)).to.equal(P('10')); // capped
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(payoutBase.sub(feeOf(payoutBase)));
    await assertSolvent(T18);
  });

  // 5. provider reverts -> contributes 0, claim succeeds
  it('5 provider reverts, claim still succeeds', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const prov = await newProvider(T18, P('3'), P('1'));
    await prov.setRevert(true);
    const bNode = await escrow.getUserFunds(node.address, T18.address);
    const bProv = await T18.balanceOf(prov.address);
    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [prov.address])).wait();
    expect(subsidizedEvents(rc).length).to.equal(0);
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(P('10').sub(feeOf(P('10'))));
    expect(await T18.balanceOf(prov.address)).to.equal(bProv); // nothing pulled
    await assertSolvent(T18);
  });

  // 6. provider returns amounts but no allowance -> contributes 0
  it('6 provider without approval contributes 0', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const prov = await newProvider(T18, P('3'), P('1'));
    await prov.setSkipApproval(true);
    const bProv = await T18.balanceOf(prov.address);
    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [prov.address])).wait();
    expect(subsidizedEvents(rc).length).to.equal(0);
    expect(await T18.balanceOf(prov.address)).to.equal(bProv);
    await assertSolvent(T18);
  });

  // 7. provider returns (0,0) -> no transfer, no event
  it('7 provider returns (0,0)', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const prov = await newProvider(T18, P('0'), P('0'));
    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [prov.address])).wait();
    expect(subsidizedEvents(rc).length).to.equal(0);
    await assertSolvent(T18);
  });

  // 8. empty providers via claimLock behaves like claimLock
  it('8 empty providers behaves like claimLock', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const bNode = await escrow.getUserFunds(node.address, T18.address);
    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [])).wait();
    expect(subsidizedEvents(rc).length).to.equal(0);
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(P('10').sub(feeOf(P('10'))));
    await assertSolvent(T18);
  });

  // 10. fee base = amount + bonus (not amount, not reduced by subsidy)
  it('10 fee is charged on amount + bonus', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const prov = await newProvider(T18, P('4'), P('2')); // subsidy 4, bonus 2
    const bFee = await T18.balanceOf(feeColl.address);
    await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [prov.address])).wait();
    const feeCharged = (await T18.balanceOf(feeColl.address)).sub(bFee);
    expect(feeCharged).to.equal(feeOf(P('12'))); // on amount+bonus
    expect(feeCharged).to.not.equal(feeOf(P('10'))); // not on amount alone
    await assertSolvent(T18);
  });

  // 11. partial claim + subsidy + bonus
  it('11 partial claim + subsidy + bonus', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const prov = await newProvider(T18, P('2'), P('1'));
    const bPayer = await escrow.getUserFunds(payer.address, T18.address);
    const bNode = await escrow.getUserFunds(node.address, T18.address);
    await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('6'), '0x', 0, [prov.address])).wait();
    // payer back = (10-6) unclaimed + 2 subsidy = 6
    expect((await escrow.getUserFunds(payer.address, T18.address)).available.sub(bPayer.available)).to.equal(P('6'));
    const payoutBase = P('7'); // 6 + bonus 1
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(payoutBase.sub(feeOf(payoutBase)));
    await assertSolvent(T18);
  });

  // 12. reject-partial (fee-on-transfer token) -> contributes 0
  it('12 reject-partial fee-on-transfer token', async function () {
    const fot = await FoTF.deploy();
    await fot.deployed();
    await fund(fot, payer.address, P('100'));
    await fot.connect(payer).approve(escrow.address, MAXU);
    await escrow.connect(payer).deposit(fot.address, P('10'));
    addUser(payer.address);
    await authorize(payer, node.address, fot, P('100'));
    const jobId = await createLock(node, fot, payer, P('10'));
    // provider on this token
    const prov = await ProviderF.deploy(escrow.address, fot.address);
    await prov.deployed();
    await prov.configure(P('3'), P('0'), P('1000'));
    await fund(fot, prov.address, P('1000'));
    await fot.setFee(true, 1000); // 10% fee on transferFrom -> under-delivery
    const bProv = await fot.balanceOf(prov.address);
    const rc = await (await escrow.connect(node).claimLock(
      jobId, fot.address, payer.address, P('10'), '0x', 0, [prov.address])).wait();
    expect(subsidizedEvents(rc).length).to.equal(0); // rejected
    // provider still lost the pulled tokens (stuck dust) - documented forfeit
    expect(bProv.sub(await fot.balanceOf(prov.address))).to.equal(P('3'));
    await fot.setFee(false, 0);
    // escrow solvent for fot: obligations tracked only for payer/node
    let sum = ethers.BigNumber.from(0);
    for (const u of [payer.address, node.address]) {
      const f = await escrow.getUserFunds(u, fot.address); sum = sum.add(f.available).add(f.locked);
    }
    expect((await fot.balanceOf(escrow.address)).gte(sum)).to.equal(true);
  });

  // 13. bundleJobs
  it('13 bundleJobs', async function () {
    await deposit(payer, T18, P('30'));
    await authorize(payer, node.address, T18, P('100'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const prov = await newProvider(T18, P('3'), P('1'));
    const bNode = await escrow.getUserFunds(node.address, T18.address);
    const claims = [{ jobId, token: T18.address, payer: payer.address, amount: P('10'), proof: '0x', jobType: 5, subsidyProviders: [prov.address] }];
    const newLocks = [{ jobId: jobSeq++, token: T18.address, payer: payer.address, amount: P('5'), expiry: 100000 }];
    const rc = await (await escrow.connect(node).bundleJobs(claims, [], newLocks, [])).wait();
    expect(subsidizedEvents(rc).length).to.equal(1);
    const payoutBase = P('11');
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(payoutBase.sub(feeOf(payoutBase)));
    await assertSolvent(T18);
  });

  // 14. plural parity + length-mismatch reverts
  it('14 claimLocks / AndWithdraw parity + length checks', async function () {
    await deposit(payer, T18, P('30'));
    await authorize(payer, node.address, T18, P('100'));
    const j1 = await createLock(node, T18, payer, P('10'));
    const j2 = await createLock(node, T18, payer, P('10'));
    const p1 = await newProvider(T18, P('3'), P('0'));
    const p2 = await newProvider(T18, P('0'), P('2'));
    // length mismatch reverts
    await expect(escrow.connect(node).claimLocks(
      [j1, j2], [T18.address], [payer.address, payer.address], [P('10'), P('10')], ['0x', '0x'], [1, 2], [[p1.address], [p2.address]]
    )).to.be.revertedWith('Invalid input');
    const bNode = await escrow.getUserFunds(node.address, T18.address);
    await (await escrow.connect(node).claimLocks(
      [j1, j2], [T18.address, T18.address], [payer.address, payer.address], [P('10'), P('10')], ['0x', '0x'], [1, 2], [[p1.address], [p2.address]]
    )).wait();
    const expNode = P('10').sub(feeOf(P('10'))).add(P('12').sub(feeOf(P('12'))));
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(expNode);
    await assertSolvent(T18);

    // AndWithdraw variant withdraws to node wallet
    await authorize(payer, node2.address, T18, P('100'));
    const j3 = await createLock(node2, T18, payer, P('10'));
    const j3b = await createLock(node2, T18, payer, P('10'));
    const p3 = await newProvider(T18, P('2'), P('0'));
    const walletBefore = await T18.balanceOf(node2.address);
    await (await escrow.connect(node2).claimLocksAndWithdraw(
      [j3, j3b], [T18.address, T18.address], [payer.address, payer.address], [P('10'), P('10')], ['0x', '0x'], [0, 0], [[p3.address], []]
    )).wait();
    const gained = (await T18.balanceOf(node2.address)).sub(walletBefore);
    expect(gained).to.equal(P('10').sub(feeOf(P('10'))).mul(2));
    addUser(node2.address);
    await assertSolvent(T18);
  });

  // 15. USDT-style no-return token works
  it('15 USDT-style no-return token', async function () {
    const nr = await NoRetF.deploy();
    await nr.deployed();
    await nr.transfer(payer.address, P('100'));
    await nr.connect(payer).approve(escrow.address, MAXU);
    await escrow.connect(payer).deposit(nr.address, P('10'));
    await authorize(payer, node.address, nr, P('100'));
    const jobId = await createLock(node, nr, payer, P('10'));
    const prov = await ProviderF.deploy(escrow.address, nr.address);
    await prov.deployed();
    await prov.configure(P('3'), P('1'), P('1000'));
    await nr.transfer(prov.address, P('1000'));
    const bNode = await escrow.getUserFunds(node.address, nr.address);
    const rc = await (await escrow.connect(node).claimLock(
      jobId, nr.address, payer.address, P('10'), '0x', 0, [prov.address])).wait();
    expect(subsidizedEvents(rc).length).to.equal(1);
    const payoutBase = P('11');
    expect((await escrow.getUserFunds(node.address, nr.address)).available.sub(bNode.available)).to.equal(payoutBase.sub(feeOf(payoutBase)));
  });

  // 16. EOA / payer as provider -> contributes 0
  it('16 EOA and payer-as-provider are skipped', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const bNode = await escrow.getUserFunds(node.address, T18.address);
    const bPayerBal = await T18.balanceOf(payer.address);
    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [eoa.address, payer.address])).wait();
    expect(subsidizedEvents(rc).length).to.equal(0);
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(P('10').sub(feeOf(P('10'))));
    expect(await T18.balanceOf(payer.address)).to.equal(bPayerBal); // payer wallet untouched
    await assertSolvent(T18);
  });

  // 17. payer userTokens re-tracked after subsidy refund
  it('17 payer userTokens re-tracked on subsidy refund', async function () {
    await deposit(payer2, T18, P('20'));
    await authorize(payer2, node.address, T18, P('100'));
    const jobId = await createLock(node, T18, payer2, P('10'));
    // withdraw the remaining available (10) so the token is removed from payer2 userTokens
    await escrow.connect(payer2).withdraw([T18.address], [P('10')]);
    expect(await escrow.getUserTokens(payer2.address)).does.not.include(T18.address);
    const prov = await newProvider(T18, P('5'), P('0'));
    await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer2.address, P('10'), '0x', 0, [prov.address])).wait();
    expect(await escrow.getUserTokens(payer2.address)).to.include(T18.address);
    await assertSolvent(T18);
  });

  // 18. expired lock + providers -> cancels, no subsidy pulled
  it('18 expired lock cancels, no subsidy/bonus', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'), 50);
    const prov = await newProvider(T18, P('3'), P('1'));
    await fastForward(100);
    const bProv = await T18.balanceOf(prov.address);
    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [prov.address])).wait();
    assert(getEventFromTx(rc, 'Canceled'), 'expected Canceled');
    expect(subsidizedEvents(rc).length).to.equal(0);
    expect(await T18.balanceOf(prov.address)).to.equal(bProv);
    await assertSolvent(T18);
  });

  // 19. subsidy cap boundaries 9 / 10 / 11
  it('19 subsidy cap boundaries', async function () {
    for (const [totalSub, expectBack] of [[P('9'), P('9')], [P('10'), P('10')], [P('11'), P('10')]]) {
      await deposit(payer, T18, P('10'));
      const jobId = await createLock(node, T18, payer, P('10'));
      const prov = await newProvider(T18, totalSub, P('0'));
      const bPayer = await escrow.getUserFunds(payer.address, T18.address);
      await (await escrow.connect(node).claimLock(
        jobId, T18.address, payer.address, P('10'), '0x', 0, [prov.address])).wait();
      expect((await escrow.getUserFunds(payer.address, T18.address)).available.sub(bPayer.available)).to.equal(expectBack);
      await assertSolvent(T18);
    }
  });

  // 20. fee rounding / non-even + zero fee + high fee
  it('20 fee rounding, zero fee, high fee', async function () {
    // non-even 33.3333...%
    await setFee(P('0.333333333333333333'));
    await deposit(payer, T18, P('10'));
    let jobId = await createLock(node, T18, payer, P('7'));
    const prov0 = await newProvider(T18, P('0'), P('0'));
    let bNode = await escrow.getUserFunds(node.address, T18.address);
    let bFee = await T18.balanceOf(feeColl.address);
    await (await escrow.connect(node).claimLock(jobId, T18.address, payer.address, P('7'), '0x', 0, [])).wait();
    const fee7 = feeOf(P('7'));
    expect((await T18.balanceOf(feeColl.address)).sub(bFee)).to.equal(fee7);
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(P('7').sub(fee7));
    await assertSolvent(T18);

    // zero fee -> payout == payoutBase
    await setFee(P('0'));
    jobId = await createLock(node, T18, payer, P('3'));
    bNode = await escrow.getUserFunds(node.address, T18.address);
    bFee = await T18.balanceOf(feeColl.address);
    await (await escrow.connect(node).claimLock(jobId, T18.address, payer.address, P('3'), '0x', 0, [])).wait();
    expect((await T18.balanceOf(feeColl.address)).sub(bFee)).to.equal(0);
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(P('3'));

    // high fee 90%
    await setFee(P('0.9'));
    await deposit(payer, T18, P('10'));
    jobId = await createLock(node, T18, payer, P('10'));
    bNode = await escrow.getUserFunds(node.address, T18.address);
    await (await escrow.connect(node).claimLock(jobId, T18.address, payer.address, P('10'), '0x', 0, [])).wait();
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(P('10').sub(feeOf(P('10'))));
    await assertSolvent(T18);
    await setFee(P('0.1')); // restore
  });

  // 21. decimals parity (6-decimal token), examples A and C
  it('21 decimals parity (6-decimal token)', async function () {
    await fund(T6, payer.address, D6('1000'));
    await T6.connect(payer).approve(escrow.address, MAXU);
    await escrow.connect(payer).deposit(T6.address, D6('10'));
    addUser(payer.address);
    await escrow.connect(payer).authorize(T6.address, node.address, D6('1000'), 1000000, 1000);
    // example A: subsidy 3, bonus 0
    let jobId = await createLock(node, T6, payer, D6('10'));
    let provA = await ProviderF.deploy(escrow.address, T6.address); await provA.deployed();
    await provA.configure(D6('3'), D6('0'), D6('1000')); await fund(T6, provA.address, D6('1000'));
    let bPayer = await escrow.getUserFunds(payer.address, T6.address);
    let bNode = await escrow.getUserFunds(node.address, T6.address);
    await (await escrow.connect(node).claimLock(jobId, T6.address, payer.address, D6('10'), '0x', 0, [provA.address])).wait();
    const fee10_6 = D6('10').mul(opcFee).div(P('1'));
    expect((await escrow.getUserFunds(payer.address, T6.address)).available.sub(bPayer.available)).to.equal(D6('3'));
    expect((await escrow.getUserFunds(node.address, T6.address)).available.sub(bNode.available)).to.equal(D6('10').sub(fee10_6));

    // example C: p1(1,1) p2(3,0)
    await escrow.connect(payer).deposit(T6.address, D6('10'));
    jobId = await createLock(node, T6, payer, D6('10'));
    let p1 = await ProviderF.deploy(escrow.address, T6.address); await p1.deployed();
    await p1.configure(D6('1'), D6('1'), D6('1000')); await fund(T6, p1.address, D6('1000'));
    let p2 = await ProviderF.deploy(escrow.address, T6.address); await p2.deployed();
    await p2.configure(D6('3'), D6('0'), D6('1000')); await fund(T6, p2.address, D6('1000'));
    bPayer = await escrow.getUserFunds(payer.address, T6.address);
    bNode = await escrow.getUserFunds(node.address, T6.address);
    await (await escrow.connect(node).claimLock(jobId, T6.address, payer.address, D6('10'), '0x', 0, [p1.address, p2.address])).wait();
    const base11_6 = D6('11');
    expect((await escrow.getUserFunds(payer.address, T6.address)).available.sub(bPayer.available)).to.equal(D6('4'));
    expect((await escrow.getUserFunds(node.address, T6.address)).available.sub(bNode.available)).to.equal(base11_6.sub(base11_6.mul(opcFee).div(P('1'))));
    await assertSolvent(T6);
  });

  // 22. fuzz / param loop: conservation + solvency
  it('22 fuzz/param loop conservation + solvency', async function () {
    const rates = [P('0'), P('0.1'), P('0.25'), P('0.333333333333333333')];
    const cases = [
      { amount: '10', subs: ['3'], bons: ['0'] },
      { amount: '10', subs: ['0'], bons: ['1'] },
      { amount: '10', subs: ['4', '4', '4'], bons: ['1', '0', '0'] },
      { amount: '7', subs: ['2'], bons: ['3'] },
      { amount: '10', subs: [], bons: [] },
      { amount: '10', subs: ['11'], bons: ['2'] }, // over-cap
    ];
    for (const rate of rates) {
      await setFee(rate);
      for (const c of cases) {
        await deposit(payer, T18, P(c.amount));
        const jobId = await createLock(node, T18, payer, P(c.amount));
        const provs = [];
        for (let i = 0; i < c.subs.length; i++) provs.push(await newProvider(T18, P(c.subs[i]), P(c.bons[i])));
        const bPayer = await escrow.getUserFunds(payer.address, T18.address);
        const bNode = await escrow.getUserFunds(node.address, T18.address);
        await (await escrow.connect(node).claimLock(
          jobId, T18.address, payer.address, P(c.amount), '0x', 0, provs.map(p => p.address))).wait();
        // expected accepted subsidy (capped at amount) and total bonus
        let remaining = P(c.amount); let totalSub = ethers.BigNumber.from(0); let totalBonus = ethers.BigNumber.from(0);
        for (let i = 0; i < c.subs.length; i++) {
          const want = P(c.subs[i]).gt(remaining) ? remaining : P(c.subs[i]);
          totalSub = totalSub.add(want); remaining = remaining.sub(want);
          totalBonus = totalBonus.add(P(c.bons[i]));
        }
        const payoutBase = P(c.amount).add(totalBonus);
        const fee = payoutBase.mul(rate).div(P('1'));
        const payout = payoutBase.sub(fee);
        // conservation: payout + fee == amount + bonus
        expect(payout.add(fee)).to.equal(payoutBase);
        expect((await escrow.getUserFunds(payer.address, T18.address)).available.sub(bPayer.available)).to.equal(totalSub);
        expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(payout);
        await assertSolvent(T18);
      }
    }
    await setFee(P('0.1'));
  });

  // 23. reentrancy blocked
  it('23 reentrancy blocked on every new entrypoint + withdraw', async function () {
    const dummyClaimData = [{ jobId: 1, token: T18.address, payer: payer.address, amount: 1, proof: '0x', jobType: 0, subsidyProviders: [] }];
    const reentryCalldatas = [
      escrow.interface.encodeFunctionData('claimLock', [1, T18.address, payer.address, 1, '0x', 0, []]),
      escrow.interface.encodeFunctionData('claimLockAndWithdraw', [1, T18.address, payer.address, 1, '0x', 0, []]),
      escrow.interface.encodeFunctionData('claimLocks', [[1], [T18.address], [payer.address], [1], ['0x'], [0], [[]]]),
      escrow.interface.encodeFunctionData('claimLocksAndWithdraw', [[1], [T18.address], [payer.address], [1], ['0x'], [0], [[]]]),
      escrow.interface.encodeFunctionData('bundleJobs', [dummyClaimData, [], [], []]),
      escrow.interface.encodeFunctionData('withdraw', [[T18.address], [1]]),
    ];
    for (const cd of reentryCalldatas) {
      await deposit(payer, T18, P('10'));
      const jobId = await createLock(node, T18, payer, P('10'));
      const prov = await newProvider(T18, P('3'), P('0'));
      await prov.setReenter(true, cd);
      const bProv = await T18.balanceOf(prov.address);
      const rc = await (await escrow.connect(node).claimLock(
        jobId, T18.address, payer.address, P('10'), '0x', 0, [prov.address])).wait();
      // outer claim succeeds; provider contributed 0 (re-entry blocked)
      expect(subsidizedEvents(rc).length).to.equal(0);
      expect(await T18.balanceOf(prov.address)).to.equal(bProv);
      expect(await prov.reenterReverted()).to.equal(true);
      const revData = await prov.reenterRevertData();
      const reason = ethers.utils.defaultAbiCoder.decode(['string'], '0x' + revData.slice(10))[0];
      expect(reason).to.equal('ReentrancyGuard: reentrant call');
      await assertSolvent(T18);
    }
  });

  // 24. provider == payer rejected (covered in 16 too, explicit here)
  it('24 provider == payer pulls nothing', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const walletBefore = await T18.balanceOf(payer.address);
    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [payer.address])).wait();
    expect(subsidizedEvents(rc).length).to.equal(0);
    expect(await T18.balanceOf(payer.address)).to.equal(walletBefore);
    await assertSolvent(T18);
  });

  // 25. arbitrary standing-allowance victim (documented residual) + skipped controls
  it('25 fallback-returning-two-uints victim IS pulled; EOA/reverting skipped', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    const victim = await FbF.deploy(); await victim.deployed();
    await victim.configure(P('3'), P('1')); // returns subsidy 3, bonus 1 from bare fallback
    await fund(T18, victim.address, P('100'));
    await victim.approveToken(T18.address, escrow.address, MAXU);
    const rev = await RevF.deploy(); await rev.deployed();
    const bVictim = await T18.balanceOf(victim.address);
    // list: reverting contract (skipped), EOA (skipped), victim (pulled)
    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [rev.address, eoa.address, victim.address])).wait();
    const ev = subsidizedEvents(rc);
    expect(ev.length).to.equal(1); // only the victim contributed
    expect(ev[0].args.provider).to.equal(victim.address);
    expect(bVictim.sub(await T18.balanceOf(victim.address))).to.equal(P('4')); // residual exposure pinned
    await assertSolvent(T18);
  });

  // 26. bogus quote cannot brick claim: bonus=maxuint, and junk-returndata token
  it('26 bogus quote (bonus=max) and junk-returndata token skipped', async function () {
    // bonus = type(uint256).max -> overflow-safe combine skips it
    await deposit(payer, T18, P('10'));
    let jobId = await createLock(node, T18, payer, P('10'));
    const prov = await newProvider(T18, P('3'), P('0'));
    await prov.setBonusMax(true);
    let bNode = await escrow.getUserFunds(node.address, T18.address);
    let rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [prov.address])).wait();
    expect(subsidizedEvents(rc).length).to.equal(0);
    expect((await escrow.getUserFunds(node.address, T18.address)).available.sub(bNode.available)).to.equal(P('10').sub(feeOf(P('10'))));
    await assertSolvent(T18);

    // junk-returndata token: normal for deposit, junk on transferFrom during the pull
    const junk = await JunkF.deploy(); await junk.deployed();
    await fund(junk, payer.address, P('100'));
    await junk.connect(payer).approve(escrow.address, MAXU);
    await escrow.connect(payer).deposit(junk.address, P('10'));
    await authorize(payer, node.address, junk, P('100'));
    jobId = await createLock(node, junk, payer, P('10'));
    const jprov = await ProviderF.deploy(escrow.address, junk.address); await jprov.deployed();
    await jprov.configure(P('3'), P('0'), P('1000')); await fund(junk, jprov.address, P('1000'));
    await junk.setJunkBytes(7); // return 7 junk bytes, move nothing
    const bJprov = await junk.balanceOf(jprov.address);
    bNode = await escrow.getUserFunds(node.address, junk.address);
    rc = await (await escrow.connect(node).claimLock(
      jobId, junk.address, payer.address, P('10'), '0x', 0, [jprov.address])).wait();
    expect(subsidizedEvents(rc).length).to.equal(0); // skipped, claim succeeded
    expect(await junk.balanceOf(jprov.address)).to.equal(bJprov);
    expect((await escrow.getUserFunds(node.address, junk.address)).available.sub(bNode.available)).to.equal(P('10').sub(feeOf(P('10'))));
    await junk.setJunkBytes(0);
  });

  // 27. list repetition + persisted budget
  it('27 same provider listed 3x pays only its budget', async function () {
    await deposit(payer, T18, P('10'));
    const jobId = await createLock(node, T18, payer, P('10'));
    // budget for exactly 2 draws of (subsidy 2 + bonus 0)
    const prov = await newProvider(T18, P('2'), P('0'), P('4'), P('100'));
    const bPayer = await escrow.getUserFunds(payer.address, T18.address);
    const bProv = await T18.balanceOf(prov.address);
    const rc = await (await escrow.connect(node).claimLock(
      jobId, T18.address, payer.address, P('10'), '0x', 0, [prov.address, prov.address, prov.address])).wait();
    // called 3x, budget covers 2 -> total subsidy 4
    expect(await prov.callCount()).to.equal(3);
    expect(subsidizedEvents(rc).length).to.equal(2);
    expect((await escrow.getUserFunds(payer.address, T18.address)).available.sub(bPayer.available)).to.equal(P('4'));
    expect(bProv.sub(await T18.balanceOf(prov.address))).to.equal(P('4')); // exactly what was pulled
    await assertSolvent(T18);
  });
});