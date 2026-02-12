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
    const tx=await EscrowContract.connect(payee1).claimLocksAndWithdraw([lock.jobId],[lock.token],[lock.payer],[lock.amount],[0]);
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
    const tx=await EscrowContract.connect(payee1).claimLocksAndWithdraw([lock.jobId],[lock.token],[lock.payer],[claimedAmount],[0]);
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
    const tx=await EscrowContract.connect(payee1).claimLocksAndWithdraw([lock.jobId],[lock.token],[lock.payer],[claimedAmount],[0]);
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
});