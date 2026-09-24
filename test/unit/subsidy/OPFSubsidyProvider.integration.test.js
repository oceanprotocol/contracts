const { assert, expect } = require('chai');
const { ethers } = require("hardhat");
const { getEventFromTx } = require("../../helpers/utils");

const U = (n) => ethers.utils.parseUnits(n, 6); // 6-dec USDC-style
const P = (n) => ethers.utils.parseEther(n);
const ZERO = '0x0000000000000000000000000000000000000000';
const MAXU = ethers.constants.MaxUint256;

describe('OPFSubsidyProvider (integration through the real Escrow)', function () {
  let deployer, node, payer, feeColl;
  let usdc, userList, nodeList, opf;
  let jobSeq = 1;

  // Snapshot/revert around the whole suite: these tests advance the EVM clock (evm_increaseTime is
  // cumulative and permanent), and other suites in a combined/coverage run share the same chain, so
  // restore the clock afterwards to avoid polluting them.
  let __snapshotId;
  before(async function () {
    __snapshotId = await ethers.provider.send("evm_snapshot", []);
    const s = await ethers.getSigners();
    deployer = s[0]; node = s[1]; payer = s[4]; feeColl = s[8];
  });
  after(async function () {
    await ethers.provider.send("evm_revert", [__snapshotId]);
  });

  // fresh USDC + lists + opf for each escrow flavour so counters/balances start clean
  async function deployCommon() {
    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
    const MockAccessList = await ethers.getContractFactory('MockAccessList');
    const OPF = await ethers.getContractFactory('OPFSubsidyProvider');

    usdc = await MockErc20Decimals.deploy("USDC", "USDC", 6); await usdc.deployed();
    userList = await MockAccessList.deploy(); await userList.deployed();
    nodeList = await MockAccessList.deploy(); await nodeList.deployed();
    opf = await OPF.connect(deployer).deploy(); await opf.deployed();

    // fund payer with USDC and OPF with a large subsidy budget
    await usdc.transfer(payer.address, U('1000000'));
    await usdc.transfer(opf.address, U('100000'));

    // configure OPF: 100% of job, daily 2, weekly unlimited, monthly 10; gates on; jobType allowlist [7]
    await opf.connect(deployer).setUserAccessList(userList.address);
    await opf.connect(deployer).setNodeAccessList(nodeList.address);
    await opf.connect(deployer).setTokenLimits(usdc.address, 10000, U('2'), 0, U('10'), true);
    await opf.connect(deployer).setAllowedJobTypes([7]);
    await userList.setMember(payer.address, true);
    await nodeList.setMember(node.address, true);
  }

  async function deposit(escrow, amount) {
    await usdc.connect(payer).approve(escrow.address, MAXU);
    await escrow.connect(payer).deposit(usdc.address, amount);
  }
  async function authorize(escrow, maxLocked) {
    await escrow.connect(payer).authorize(usdc.address, node.address, maxLocked, 1000000, 1000);
  }
  async function createLock(escrow, amount, expiry) {
    const jobId = jobSeq++;
    await escrow.connect(node).createLock(jobId, usdc.address, payer.address, amount, expiry || 100000);
    return jobId;
  }
  function subsidizedEvents(rc) { return (rc.events || []).filter(e => e.event === 'Subsidized'); }

  // -------------------------------------------------------------------------------------------
  it('Escrow: claim with [opf] releases the daily-capped subsidy to the payer', async function () {
    await deployCommon();
    const Router = await ethers.getContractFactory('FactoryRouter');
    const Escrow = await ethers.getContractFactory('Escrow');
    const router = await Router.deploy(deployer.address, usdc.address, '0x000000000000000000000000000000000000dead', feeColl.address, []);
    await router.deployed();
    await router.connect(deployer).updateOPCFee(P('0.1'), P('0.1'), 0, 0); // 10% fee
    const escrow = await Escrow.deploy(router.address, feeColl.address); await escrow.deployed();
    await opf.connect(deployer).setAuthorizedEscrow(escrow.address, true);

    await deposit(escrow, U('5'));
    await authorize(escrow, U('100'));
    const jobId = await createLock(escrow, U('5'));

    // quote before the job = the on-chain subsidy (daily 2 binds)
    const quoted = await opf.quoteSubsidy(node.address, payer.address, 7, usdc.address, U('5'), U('5'));
    expect(quoted).to.equal(U('2'));

    const before = {
      payer: await escrow.getUserFunds(payer.address, usdc.address),
      node: await escrow.getUserFunds(node.address, usdc.address),
      opf: await usdc.balanceOf(opf.address),
    };
    const rc = await (await escrow.connect(node).claimLock(
      jobId, usdc.address, payer.address, U('5'), '0x', 7, [opf.address])).wait();

    const ev = subsidizedEvents(rc);
    expect(ev.length).to.equal(1);
    expect(ev[0].args.subsidyAmount).to.equal(U('2'));
    expect(ev[0].args.provider).to.equal(opf.address);

    const opcFee = await router.getOPCFee(usdc.address);
    const fee = U('5').mul(opcFee).div(P('1'));
    const payout = U('5').sub(fee);

    const after = {
      payer: await escrow.getUserFunds(payer.address, usdc.address),
      node: await escrow.getUserFunds(node.address, usdc.address),
      opf: await usdc.balanceOf(opf.address),
    };
    // payer gets the subsidy (2) back into available; lock (5) released
    expect(after.payer.available.sub(before.payer.available)).to.equal(U('2'));
    expect(before.payer.locked.sub(after.payer.locked)).to.equal(U('5'));
    // node payout = amount - fee (bonus 0)
    expect(after.node.available.sub(before.node.available)).to.equal(payout);
    // OPF balance dropped by the granted subsidy
    expect(before.opf.sub(after.opf)).to.equal(U('2'));
    // OPF counters updated
    expect(await opf.dailyUsedBy(payer.address, usdc.address)).to.equal(U('2'));
    expect(await opf.monthlyUsedBy(payer.address, usdc.address)).to.equal(U('2'));
  });

  it('Escrow: list repetition [opf, opf] grants only the remaining budget (no double-spend)', async function () {
    await deployCommon();
    const Router = await ethers.getContractFactory('FactoryRouter');
    const Escrow = await ethers.getContractFactory('Escrow');
    const router = await Router.deploy(deployer.address, usdc.address, '0x000000000000000000000000000000000000dead', feeColl.address, []);
    await router.deployed();
    await router.connect(deployer).updateOPCFee(P('0.1'), P('0.1'), 0, 0);
    const escrow = await Escrow.deploy(router.address, feeColl.address); await escrow.deployed();
    await opf.connect(deployer).setAuthorizedEscrow(escrow.address, true);

    await deposit(escrow, U('10'));
    await authorize(escrow, U('100'));
    const jobId = await createLock(escrow, U('10'));

    const beforePayer = await escrow.getUserFunds(payer.address, usdc.address);
    const beforeOpf = await usdc.balanceOf(opf.address);
    // node names OPF twice in the same claim
    const rc = await (await escrow.connect(node).claimLock(
      jobId, usdc.address, payer.address, U('10'), '0x', 7, [opf.address, opf.address])).wait();

    // only the first consult contributes; the second sees the daily budget exhausted -> 0
    const ev = subsidizedEvents(rc);
    expect(ev.length).to.equal(1);
    expect(ev[0].args.subsidyAmount).to.equal(U('2'));

    const afterPayer = await escrow.getUserFunds(payer.address, usdc.address);
    const afterOpf = await usdc.balanceOf(opf.address);
    expect(afterPayer.available.sub(beforePayer.available)).to.equal(U('2')); // NOT 4
    expect(beforeOpf.sub(afterOpf)).to.equal(U('2'));
    expect(await opf.dailyUsedBy(payer.address, usdc.address)).to.equal(U('2'));
  });

  it('Escrow: 50%-of-job provider listed twice yields 50%, not 100% (pct-binding dedup)', async function () {
    await deployCommon();
    // reconfigure: sponsor 50% of the job, with per-period caps high enough NOT to bind, so the
    // percentage is the only limit. Without dedup, [opf,opf] would stack to 100%.
    await opf.connect(deployer).setTokenLimits(usdc.address, 5000, U('1000000'), 0, U('1000000'), true);

    const Router = await ethers.getContractFactory('FactoryRouter');
    const Escrow = await ethers.getContractFactory('Escrow');
    const router = await Router.deploy(deployer.address, usdc.address, '0x000000000000000000000000000000000000dead', feeColl.address, []);
    await router.deployed();
    await router.connect(deployer).updateOPCFee(P('0.1'), P('0.1'), 0, 0);
    const escrow = await Escrow.deploy(router.address, feeColl.address); await escrow.deployed();
    await opf.connect(deployer).setAuthorizedEscrow(escrow.address, true);

    await deposit(escrow, U('10'));
    await authorize(escrow, U('100'));
    const jobId = await createLock(escrow, U('10'));

    const beforePayer = await escrow.getUserFunds(payer.address, usdc.address);
    const beforeOpf = await usdc.balanceOf(opf.address);
    const rc = await (await escrow.connect(node).claimLock(
      jobId, usdc.address, payer.address, U('10'), '0x', 7, [opf.address, opf.address])).wait();

    // dedup: consulted once -> a single 50% grant of 5, NOT 10
    const ev = subsidizedEvents(rc);
    expect(ev.length).to.equal(1);
    expect(ev[0].args.subsidyAmount).to.equal(U('5'));
    const afterPayer = await escrow.getUserFunds(payer.address, usdc.address);
    expect(afterPayer.available.sub(beforePayer.available)).to.equal(U('5')); // 50%, NOT 100%
    expect(beforeOpf.sub(await usdc.balanceOf(opf.address))).to.equal(U('5'));
    expect(await opf.dailyUsedBy(payer.address, usdc.address)).to.equal(U('5'));
  });

  it('EnterpriseEscrow: claim with [opf] releases the subsidy to the payer', async function () {
    await deployCommon();
    const EnterpriseFeeCollector = await ethers.getContractFactory('EnterpriseFeeCollector');
    const EnterpriseEscrow = await ethers.getContractFactory('EnterpriseEscrow');
    const efc = await EnterpriseFeeCollector.deploy(feeColl.address, deployer.address); await efc.deployed();
    // token allowed, 10% fee (minFee 1 wei < maxFee)
    await efc.connect(deployer).updateToken(usdc.address, 1, U('1000000'), P('0.1'), true);
    const escrow = await EnterpriseEscrow.deploy(efc.address); await escrow.deployed();
    await opf.connect(deployer).setAuthorizedEscrow(escrow.address, true);

    await deposit(escrow, U('5'));
    await authorize(escrow, U('100'));
    const jobId = await createLock(escrow, U('5'));

    const before = {
      payer: await escrow.getUserFunds(payer.address, usdc.address),
      node: await escrow.getUserFunds(node.address, usdc.address),
      opf: await usdc.balanceOf(opf.address),
    };
    const rc = await (await escrow.connect(node).claimLock(
      jobId, usdc.address, payer.address, U('5'), '0x', 7, [opf.address])).wait();
    const ev = subsidizedEvents(rc);
    expect(ev.length).to.equal(1);
    expect(ev[0].args.subsidyAmount).to.equal(U('2'));

    const fee = await efc.calculateFee(usdc.address, U('5'));
    const payout = U('5').sub(fee);
    const after = {
      payer: await escrow.getUserFunds(payer.address, usdc.address),
      node: await escrow.getUserFunds(node.address, usdc.address),
      opf: await usdc.balanceOf(opf.address),
    };
    expect(after.payer.available.sub(before.payer.available)).to.equal(U('2'));
    expect(after.node.available.sub(before.node.available)).to.equal(payout);
    expect(before.opf.sub(after.opf)).to.equal(U('2'));
    expect(await opf.dailyUsedBy(payer.address, usdc.address)).to.equal(U('2'));
  });

  it('Escrow: jobType not on the allowlist -> no subsidy', async function () {
    await deployCommon();
    const Router = await ethers.getContractFactory('FactoryRouter');
    const Escrow = await ethers.getContractFactory('Escrow');
    const router = await Router.deploy(deployer.address, usdc.address, '0x000000000000000000000000000000000000dead', feeColl.address, []);
    await router.deployed();
    await router.connect(deployer).updateOPCFee(P('0.1'), P('0.1'), 0, 0);
    const escrow = await Escrow.deploy(router.address, feeColl.address); await escrow.deployed();
    await opf.connect(deployer).setAuthorizedEscrow(escrow.address, true);

    await deposit(escrow, U('5'));
    await authorize(escrow, U('100'));
    const jobId = await createLock(escrow, U('5'));

    const beforeOpf = await usdc.balanceOf(opf.address);
    // jobType 9 is NOT in the allowlist [7]
    const rc = await (await escrow.connect(node).claimLock(
      jobId, usdc.address, payer.address, U('5'), '0x', 9, [opf.address])).wait();
    expect(subsidizedEvents(rc).length).to.equal(0);
    expect(await usdc.balanceOf(opf.address)).to.equal(beforeOpf); // untouched
    expect(await opf.dailyUsedBy(payer.address, usdc.address)).to.equal(0);
  });
});
