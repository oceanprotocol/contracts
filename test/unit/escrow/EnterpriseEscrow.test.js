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
    const EnterpriseFeeCollector = await ethers.getContractFactory("EnterpriseFeeCollector");
    const MockErc20 = await ethers.getContractFactory('MockERC20');
    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
    const MockErc20Permit = await ethers.getContractFactory('MockERC20Permit');
    const Escrow = await ethers.getContractFactory('EnterpriseEscrow');
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
    EnterpriseFeeCollectorContract = await EnterpriseFeeCollector.deploy(opcCollector.address,payer1.address)
    await EnterpriseFeeCollectorContract.deployed();
    EscrowContract = await Escrow.deploy(EnterpriseFeeCollectorContract.address);
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
    await EnterpriseFeeCollectorContract.connect(payer1).updateToken(Mock20Contract.address, 1, 10, ethers.utils.parseEther('0.01'), true);
    await EnterpriseFeeCollectorContract.connect(payer1).updateToken(Mock20DecimalsContract.address, 5, 50, ethers.utils.parseEther('0.1'), true);
    await EnterpriseFeeCollectorContract.connect(payer1).updateToken(Mock20PermitContract.address, 1, 10, ethers.utils.parseEther('0.01'), true);
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
    const opcBalance=await Mock20Contract.balanceOf(EnterpriseFeeCollectorContract.address)
    
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
    const opcBalanceAfter=await Mock20Contract.balanceOf(EnterpriseFeeCollectorContract.address)
    const opcCollectorFee=await EnterpriseFeeCollectorContract.calculateFee(lock.token,lock.amount)
    const expectedPayee=lock.amount.sub(opcCollectorFee);
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
    const opcBalance=await Mock20Contract.balanceOf(EnterpriseFeeCollectorContract.address)
    
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
    const opcBalanceAfter=await Mock20Contract.balanceOf(EnterpriseFeeCollectorContract.address)
    
    const opcCollectorFee=await EnterpriseFeeCollectorContract.calculateFee(lock.token,claimedAmount)
    const expectedPayee=bnClaimedAmount.sub(opcCollectorFee);
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

  it('Escrow - reLock re-checks the enterprise fee gate', async function () {
    // Mock20Contract minFee = 1 wei, so calculateFee(amount=1) returns 1 >= amount -> reverts
    const jobId = 2001;
    await EscrowContract.connect(payee3).createLock(jobId, Mock20Contract.address, payer3.address, web3.utils.toWei("10"), 500);
    await expect(
      EscrowContract.connect(payee3).reLock(jobId, Mock20Contract.address, payer3.address, 1, 100)
    ).to.be.revertedWith("Amount must be higher than enterprise fee");
    // a normal reLock still settles
    await EscrowContract.connect(payee3).reLock(jobId, Mock20Contract.address, payer3.address, web3.utils.toWei("12"), 100);
    const lk = (await EscrowContract.connect(payee3).getLocks(Mock20Contract.address, payer3.address, payee3.address)).find(l => l.jobId.eq(jobId));
    expect(lk.amount).to.equal(web3.utils.toWei("12"));
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
    const claims = [{ jobId: 5001, token: Mock20Contract.address, payer: payer2.address, amount: web3.utils.toWei("10"), proof: "0x" }];
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

  it('Escrow - bundleJobs create still enforces the enterprise fee gate', async function () {
    // amount=1 wei -> calculateFee returns minFee(1) >= amount -> reverts inside _createLock
    await expect(
      EscrowContract.connect(payee2).bundleJobs(
        [], [], [{ jobId: 5201, token: Mock20Contract.address, payer: payer2.address, amount: 1, expiry: 100 }], []
      )
    ).to.be.revertedWith("Amount must be higher than enterprise fee");
  });

  it('Escrow - bundleJobs with all-empty arrays is a no-op', async function () {
    await EscrowContract.connect(payee2).bundleJobs([], [], [], []);
  });
});