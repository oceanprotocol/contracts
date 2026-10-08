const { assert, expect } = require('chai');
const { ethers } = require("hardhat");
const { getEventFromTx } = require("../../helpers/utils");
const { getEscrowFactory } = require("../../helpers/escrow");

const U = (n) => ethers.utils.parseUnits(n, 6); // 6-dec USDC-style
const P = (n) => ethers.utils.parseEther(n);
const ZERO = '0x0000000000000000000000000000000000000000';
const MAXU = ethers.constants.MaxUint256;

describe('OneTimeSubsidyProvider (integration through the real Escrow)', function () {
  let deployer, node, payer, feeColl;
  let usdc, userList, nodeList, sub;
  let jobSeq = 1;

  before(async function () {
    const s = await ethers.getSigners();
    deployer = s[0]; node = s[1]; payer = s[4]; feeColl = s[8];
  });

  // fresh USDC + lists + provider for each escrow flavour so counters/balances start clean
  async function deployCommon() {
    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
    const MockAccessList = await ethers.getContractFactory('MockAccessList');
    const OneTime = await ethers.getContractFactory('OneTimeSubsidyProvider');

    usdc = await MockErc20Decimals.deploy("USDC", "USDC", 6); await usdc.deployed();
    userList = await MockAccessList.deploy(); await userList.deployed();
    nodeList = await MockAccessList.deploy(); await nodeList.deployed();
    sub = await OneTime.connect(deployer).deploy(); await sub.deployed();

    // fund payer with USDC and the provider with a large subsidy budget
    await usdc.transfer(payer.address, U('1000000'));
    await usdc.transfer(sub.address, U('100000'));

    // configure: no per-job cap, 10 USDC one-time credit; gates on; jobType allowlist [7]
    await sub.connect(deployer).setUserAccessList(userList.address);
    await sub.connect(deployer).setNodeAccessList(nodeList.address);
    await sub.connect(deployer).setTokenConfig(usdc.address, 0, U('10'), true);
    await sub.connect(deployer).setAllowedJobTypes([7]);
    await userList.setMember(payer.address, true);
    await nodeList.setMember(node.address, true);
  }

  async function newEscrow() {
    const Router = await ethers.getContractFactory('FactoryRouter');
    const Escrow = await getEscrowFactory('Escrow');
    const router = await Router.deploy(deployer.address, usdc.address, '0x000000000000000000000000000000000000dead', feeColl.address, []);
    await router.deployed();
    await router.connect(deployer).updateOPCFee(P('0.1'), P('0.1'), 0, 0); // 10% fee
    const escrow = await Escrow.deploy(router.address, feeColl.address); await escrow.deployed();
    await sub.connect(deployer).setAuthorizedEscrow(escrow.address, true);
    return { escrow, router };
  }

  async function deposit(escrow, amount) {
    await usdc.connect(payer).approve(escrow.address, MAXU);
    await escrow.connect(payer).deposit(usdc.address, amount);
  }
  async function authorize(escrow, maxLocked) {
    await escrow.connect(payer).authorize(usdc.address, node.address, maxLocked, 1000000, 1000, 0);
  }
  async function createLock(escrow, amount, expiry) {
    const jobId = jobSeq++;
    await escrow.connect(node).createLock(jobId, usdc.address, payer.address, amount, expiry || 100000, 0, []);
    return jobId;
  }
  function subsidizedEvents(rc) { return (rc.events || []).filter(e => e.event === 'Subsidized'); }

  // -------------------------------------------------------------------------------------------
  it('Escrow: claim with [provider] releases the one-time credit to the payer', async function () {
    await deployCommon();
    const { escrow, router } = await newEscrow();

    await deposit(escrow, U('5'));
    await authorize(escrow, U('100'));
    const jobId = await createLock(escrow, U('5'));

    // credit (10) exceeds the job (5) -> full job covered
    expect((await sub.quoteSubsidy(node.address, payer.address, 7, usdc.address, U('5'), U('5'))).subsidy).to.equal(U('5'));

    const before = {
      payer: await escrow.getUserFunds(payer.address, usdc.address),
      node: await escrow.getUserFunds(node.address, usdc.address),
      sub: await usdc.balanceOf(sub.address),
    };
    const rc = await (await escrow.connect(node).claimLock(
      jobId, usdc.address, payer.address, U('5'), '0x', 7, [sub.address])).wait();

    const ev = subsidizedEvents(rc);
    expect(ev.length).to.equal(1);
    expect(ev[0].args.subsidyAmount).to.equal(U('5'));
    expect(ev[0].args.provider).to.equal(sub.address);

    const opcFee = await router.getOPCFee(usdc.address);
    const fee = U('5').mul(opcFee).div(P('1'));
    const payout = U('5').sub(fee);

    const after = {
      payer: await escrow.getUserFunds(payer.address, usdc.address),
      node: await escrow.getUserFunds(node.address, usdc.address),
      sub: await usdc.balanceOf(sub.address),
    };
    expect(after.payer.available.sub(before.payer.available)).to.equal(U('5')); // whole job refunded
    expect(before.payer.locked.sub(after.payer.locked)).to.equal(U('5'));
    expect(after.node.available.sub(before.node.available)).to.equal(payout);   // node paid net of fee
    expect(before.sub.sub(after.sub)).to.equal(U('5'));
    expect(await sub.usedBy(payer.address, usdc.address)).to.equal(U('5'));
    expect(await sub.remainingCredit(payer.address, usdc.address)).to.equal(U('5'));
  });

  it('Escrow: credit is cumulative across jobs, then exhausted', async function () {
    await deployCommon();
    const { escrow } = await newEscrow();

    await deposit(escrow, U('15'));
    await authorize(escrow, U('100'));
    const j1 = await createLock(escrow, U('5'));
    const j2 = await createLock(escrow, U('5'));
    const j3 = await createLock(escrow, U('5'));

    let rc = await (await escrow.connect(node).claimLock(j1, usdc.address, payer.address, U('5'), '0x', 7, [sub.address])).wait();
    expect(subsidizedEvents(rc)[0].args.subsidyAmount).to.equal(U('5')); // used 5

    rc = await (await escrow.connect(node).claimLock(j2, usdc.address, payer.address, U('5'), '0x', 7, [sub.address])).wait();
    expect(subsidizedEvents(rc)[0].args.subsidyAmount).to.equal(U('5')); // used 10
    expect(await sub.remainingCredit(payer.address, usdc.address)).to.equal(0);

    // third job: credit exhausted -> no subsidy event, payer pays full
    rc = await (await escrow.connect(node).claimLock(j3, usdc.address, payer.address, U('5'), '0x', 7, [sub.address])).wait();
    expect(subsidizedEvents(rc).length).to.equal(0);
    expect(await sub.usedBy(payer.address, usdc.address)).to.equal(U('10'));
  });

  it('Escrow: resetUser refreshes the credit for a new run', async function () {
    await deployCommon();
    const { escrow } = await newEscrow();

    await deposit(escrow, U('15'));
    await authorize(escrow, U('100'));
    const j1 = await createLock(escrow, U('5'));
    const j2 = await createLock(escrow, U('5'));
    const j3 = await createLock(escrow, U('5'));

    await (await escrow.connect(node).claimLock(j1, usdc.address, payer.address, U('5'), '0x', 7, [sub.address])).wait();
    await (await escrow.connect(node).claimLock(j2, usdc.address, payer.address, U('5'), '0x', 7, [sub.address])).wait();
    expect(await sub.remainingCredit(payer.address, usdc.address)).to.equal(0);

    // admin resets this user -> fresh credit
    await sub.connect(deployer).resetUser(payer.address);
    expect(await sub.remainingCredit(payer.address, usdc.address)).to.equal(U('10'));

    const rc = await (await escrow.connect(node).claimLock(j3, usdc.address, payer.address, U('5'), '0x', 7, [sub.address])).wait();
    expect(subsidizedEvents(rc)[0].args.subsidyAmount).to.equal(U('5'));
  });

  it('Escrow: provider listed twice yields one grant (dedup, no double-spend)', async function () {
    await deployCommon();
    // 50%-of-job cap with a huge credit, so pct is the only limit and stacking WOULD double it
    await sub.connect(deployer).setTokenConfig(usdc.address, 5000, U('1000000'), true);
    const { escrow } = await newEscrow();

    await deposit(escrow, U('10'));
    await authorize(escrow, U('100'));
    const jobId = await createLock(escrow, U('10'));

    const beforePayer = await escrow.getUserFunds(payer.address, usdc.address);
    const beforeSub = await usdc.balanceOf(sub.address);
    const rc = await (await escrow.connect(node).claimLock(
      jobId, usdc.address, payer.address, U('10'), '0x', 7, [sub.address, sub.address])).wait();

    const ev = subsidizedEvents(rc);
    expect(ev.length).to.equal(1);
    expect(ev[0].args.subsidyAmount).to.equal(U('5')); // 50%, NOT 100%
    const afterPayer = await escrow.getUserFunds(payer.address, usdc.address);
    expect(afterPayer.available.sub(beforePayer.available)).to.equal(U('5'));
    expect(beforeSub.sub(await usdc.balanceOf(sub.address))).to.equal(U('5'));
    expect(await sub.usedBy(payer.address, usdc.address)).to.equal(U('5'));
  });

  it('Escrow: jobType not on the allowlist -> no subsidy', async function () {
    await deployCommon();
    const { escrow } = await newEscrow();

    await deposit(escrow, U('5'));
    await authorize(escrow, U('100'));
    const jobId = await createLock(escrow, U('5'));

    const beforeSub = await usdc.balanceOf(sub.address);
    // jobType 9 is NOT in the allowlist [7]
    const rc = await (await escrow.connect(node).claimLock(
      jobId, usdc.address, payer.address, U('5'), '0x', 9, [sub.address])).wait();
    expect(subsidizedEvents(rc).length).to.equal(0);
    expect(await usdc.balanceOf(sub.address)).to.equal(beforeSub);
    expect(await sub.usedBy(payer.address, usdc.address)).to.equal(0);
  });

  it('EnterpriseEscrow: claim with [provider] releases the credit to the payer', async function () {
    await deployCommon();
    const EnterpriseFeeCollector = await ethers.getContractFactory('EnterpriseFeeCollector');
    const EnterpriseEscrow = await getEscrowFactory('EnterpriseEscrow');
    const efc = await EnterpriseFeeCollector.deploy(feeColl.address, deployer.address); await efc.deployed();
    await efc.connect(deployer).updateToken(usdc.address, 1, U('1000000'), P('0.1'), true);
    const escrow = await EnterpriseEscrow.deploy(efc.address); await escrow.deployed();
    await sub.connect(deployer).setAuthorizedEscrow(escrow.address, true);

    await deposit(escrow, U('5'));
    await authorize(escrow, U('100'));
    const jobId = await createLock(escrow, U('5'));

    const before = {
      payer: await escrow.getUserFunds(payer.address, usdc.address),
      node: await escrow.getUserFunds(node.address, usdc.address),
      sub: await usdc.balanceOf(sub.address),
    };
    const rc = await (await escrow.connect(node).claimLock(
      jobId, usdc.address, payer.address, U('5'), '0x', 7, [sub.address])).wait();
    const ev = subsidizedEvents(rc);
    expect(ev.length).to.equal(1);
    expect(ev[0].args.subsidyAmount).to.equal(U('5'));

    const fee = await efc.calculateFee(usdc.address, U('5'));
    const payout = U('5').sub(fee);
    const after = {
      payer: await escrow.getUserFunds(payer.address, usdc.address),
      node: await escrow.getUserFunds(node.address, usdc.address),
      sub: await usdc.balanceOf(sub.address),
    };
    expect(after.payer.available.sub(before.payer.available)).to.equal(U('5'));
    expect(after.node.available.sub(before.node.available)).to.equal(payout);
    expect(before.sub.sub(after.sub)).to.equal(U('5'));
    expect(await sub.usedBy(payer.address, usdc.address)).to.equal(U('5'));
  });
});
