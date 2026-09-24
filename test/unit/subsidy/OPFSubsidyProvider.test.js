const { assert, expect } = require('chai');
const { ethers } = require("hardhat");
const { getEventFromTx } = require("../../helpers/utils");

const ZERO = '0x0000000000000000000000000000000000000000';
const MAXU = ethers.constants.MaxUint256;

// 6-decimal USDC-style amounts
const U = (n) => ethers.utils.parseUnits(n, 6);

const fastForward = async (seconds) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
};

const randAddr = () => ethers.Wallet.createRandom().address;

describe('OPFSubsidyProvider (unit)', function () {
  let owner, escrowSigner, escrow2, attacker, other;
  let opf, usdc, usdc2, userList, nodeList;

  const JOB = 0; // default jobType (allowlist empty => all allowed unless a test sets it)

  // configure the primary usdc token
  const setLimits = (pctBps, daily, weekly, monthly, enabled = true, token = undefined) =>
    opf.connect(owner).setTokenLimits((token || usdc).address, pctBps, daily, weekly, monthly, enabled);

  // allow payer+node on both lists (fresh random addresses)
  const allow = async (payer, node) => {
    await userList.setMember(payer, true);
    await nodeList.setMember(node, true);
  };

  // advance to (approximately) the start of a fresh 28-day month block; since MONTH is a multiple of
  // WEEK and DAY, this also freshens the week and day indices (small offset).
  const advanceToFreshMonth = async () => {
    const s = (await opf.secondsUntilMonthReset()).toNumber();
    await fastForward(s + 2);
  };

  // Snapshot/revert around the whole suite: these tests advance the EVM clock (evm_increaseTime is
  // cumulative and permanent), and other suites in a combined/coverage run share the same chain, so
  // restore the clock afterwards to avoid polluting them.
  let __snapshotId;
  before(async function () {
    __snapshotId = await ethers.provider.send("evm_snapshot", []);
  });
  after(async function () {
    await ethers.provider.send("evm_revert", [__snapshotId]);
  });

  beforeEach(async function () {
    const s = await ethers.getSigners();
    owner = s[0]; escrowSigner = s[1]; escrow2 = s[2]; attacker = s[3]; other = s[4];

    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
    const MockAccessList = await ethers.getContractFactory('MockAccessList');
    const OPF = await ethers.getContractFactory('OPFSubsidyProvider');

    usdc = await MockErc20Decimals.deploy("USDC", "USDC", 6);
    await usdc.deployed();
    usdc2 = await MockErc20Decimals.deploy("USDC2", "USDC2", 6);
    await usdc2.deployed();
    userList = await MockAccessList.deploy(); await userList.deployed();
    nodeList = await MockAccessList.deploy(); await nodeList.deployed();

    opf = await OPF.connect(owner).deploy();
    await opf.deployed();

    // fund with plenty of USDC (both tokens)
    await usdc.transfer(opf.address, U('1000000'));
    await usdc2.transfer(opf.address, U('1000000'));

    // gates on
    await opf.connect(owner).setUserAccessList(userList.address);
    await opf.connect(owner).setNodeAccessList(nodeList.address);
    // authorize the escrow caller
    await opf.connect(owner).setAuthorizedEscrow(escrowSigner.address, true);

    // Pin the clock to the start of a fresh 28-day month so period math is deterministic regardless of
    // the ambient chain clock (MONTH = 4*WEEK = 28*DAY, so this also zeroes the day & week indices).
    // Only forward moves are allowed; setNextBlockTimestamp is always >= now, so this is safe.
    const MONTH_SECS = 4 * 7 * 24 * 3600;
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    const nextMonthStart = (Math.floor(now / MONTH_SECS) + 1) * MONTH_SECS;
    await ethers.provider.send('evm_setNextBlockTimestamp', [nextMonthStart]);
    await ethers.provider.send('evm_mine', []);
  });

  // helper: get grant that onSubsidyClaim WOULD return (no state change)
  const staticGrant = (caller, node, payer, jobType, token, amount, needed) =>
    opf.connect(caller).callStatic.onSubsidyClaim(node, payer, jobType, (token || usdc).address, amount, needed);

  // ---------------------------------------------------------------------------------------------
  it('1 happy path: daily cap binds', async function () {
    await setLimits(10000, U('2'), 0, U('10')); // 100%, daily 2, weekly unlimited, monthly 10
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);

    const quoted = await opf.quoteSubsidy(node, payer, JOB, usdc.address, U('5'), U('5'));
    const [sub, bonus] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5'));
    expect(quoted).to.equal(U('2'));
    expect(sub).to.equal(U('2'));
    expect(bonus).to.equal(0);

    const tx = await opf.connect(escrowSigner).onSubsidyClaim(node, payer, JOB, usdc.address, U('5'), U('5'));
    const ev = getEventFromTx(await tx.wait(), 'SubsidyGranted');
    assert(ev, 'missing SubsidyGranted');
    expect(ev.args.amount).to.equal(U('2'));
    expect(ev.args.token).to.equal(usdc.address);
    expect(ev.args.escrow).to.equal(escrowSigner.address);

    expect(await usdc.allowance(opf.address, escrowSigner.address)).to.equal(U('2'));
    expect(await opf.dailyUsedBy(payer, usdc.address)).to.equal(U('2'));
    expect(await opf.weeklyUsedBy(payer, usdc.address)).to.equal(U('2'));
    expect(await opf.monthlyUsedBy(payer, usdc.address)).to.equal(U('2'));
  });

  it('1b percentage binds below the caps, then 100% -> daily binds', async function () {
    await setLimits(1500, U('2'), 0, U('10')); // pct=15%
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);
    // amount 10 -> 15% = 1.5 < 2 (daily)
    const [sub] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('10'), U('10'));
    expect(sub).to.equal(U('1.5'));
    expect(await opf.quoteSubsidy(node, payer, JOB, usdc.address, U('10'), U('10'))).to.equal(U('1.5'));

    // now 100% with a FRESH payer -> daily binds at 2
    await setLimits(10000, U('2'), 0, U('10'));
    const payer2 = randAddr(), node2 = randAddr();
    await allow(payer2, node2);
    const [sub2] = await staticGrant(escrowSigner, node2, payer2, JOB, usdc, U('10'), U('10'));
    expect(sub2).to.equal(U('2'));
  });

  it('1c full sponsorship (pct=100%) small job -> user pays 0', async function () {
    await setLimits(10000, U('100'), 0, U('100'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);
    const [sub] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('1'), U('1'));
    expect(sub).to.equal(U('1'));
  });

  it('1d zero sponsorship (pct=0) -> grant 0 regardless of caps/balance', async function () {
    await setLimits(0, U('100'), 0, U('100'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);
    const [sub] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('10'), U('10'));
    expect(sub).to.equal(0);
    expect(await opf.quoteSubsidy(node, payer, JOB, usdc.address, U('10'), U('10'))).to.equal(0);
  });

  it('2 daily cap exhausted same day, resets next day, monthly accumulates', async function () {
    await setLimits(10000, U('2'), 0, U('10'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);

    await opf.connect(escrowSigner).onSubsidyClaim(node, payer, JOB, usdc.address, U('5'), U('5'));
    expect(await opf.dailyUsedBy(payer, usdc.address)).to.equal(U('2'));
    // second claim same day -> 0
    const [sub2] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5'));
    expect(sub2).to.equal(0);

    // next day -> 2 again
    await fastForward(24 * 3600 + 1);
    expect(await opf.dailyUsedBy(payer, usdc.address)).to.equal(0); // reset
    const [sub3] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5'));
    expect(sub3).to.equal(U('2'));
    await opf.connect(escrowSigner).onSubsidyClaim(node, payer, JOB, usdc.address, U('5'), U('5'));
    // monthly accumulated across the two days: 2 + 2 = 4
    expect(await opf.monthlyUsedBy(payer, usdc.address)).to.equal(U('4'));
  });

  it('3 monthly cap across days: 2/day x5 = 10 -> day 6 grants 0 until month rolls over', async function () {
    await advanceToFreshMonth();
    await setLimits(10000, U('2'), 0, U('10')); // monthly 10
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);

    for (let i = 0; i < 5; i++) {
      const [g] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('2'), U('2'));
      expect(g).to.equal(U('2'));
      await opf.connect(escrowSigner).onSubsidyClaim(node, payer, JOB, usdc.address, U('2'), U('2'));
      await fastForward(24 * 3600 + 1);
    }
    expect(await opf.monthlyUsedBy(payer, usdc.address)).to.equal(U('10'));
    // day 6: daily fresh but monthly exhausted -> 0
    const [g6] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('2'), U('2'));
    expect(g6).to.equal(0);
    // roll to next month -> resets
    await advanceToFreshMonth();
    expect(await opf.monthlyUsedBy(payer, usdc.address)).to.equal(0);
    const [g7] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('2'), U('2'));
    expect(g7).to.equal(U('2'));
  });

  it('4 weekly cap enforced when set; resets next week', async function () {
    await advanceToFreshMonth(); // fresh week too
    await setLimits(10000, U('10'), U('3'), 0); // daily 10, weekly 3, monthly unlimited
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);

    await opf.connect(escrowSigner).onSubsidyClaim(node, payer, JOB, usdc.address, U('2'), U('2'));
    await opf.connect(escrowSigner).onSubsidyClaim(node, payer, JOB, usdc.address, U('2'), U('2'));
    // weekly used 3 (capped: 2 + 1)
    expect(await opf.weeklyUsedBy(payer, usdc.address)).to.equal(U('3'));
    const [g] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('2'), U('2'));
    expect(g).to.equal(0);
    // next week -> resets
    await fastForward(7 * 24 * 3600 + 1);
    expect(await opf.weeklyUsedBy(payer, usdc.address)).to.equal(0);
    const [g2] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('2'), U('2'));
    expect(g2).to.equal(U('2'));
  });

  it('5 subsidyNeeded ceiling: needing 1 with daily=2 -> grant 1', async function () {
    await setLimits(10000, U('2'), 0, U('10'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);
    const [g] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('1'));
    expect(g).to.equal(U('1'));
  });

  it('6 balance cap: grant limited to contract balance; counters increment by granted only', async function () {
    // drain then re-fund a small balance
    await opf.connect(owner).withdrawAllTokens(usdc.address, owner.address);
    await usdc.transfer(opf.address, U('1'));
    await setLimits(10000, U('5'), 0, U('50'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);
    const [g] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5'));
    expect(g).to.equal(U('1')); // balance binds
    await opf.connect(escrowSigner).onSubsidyClaim(node, payer, JOB, usdc.address, U('5'), U('5'));
    expect(await opf.dailyUsedBy(payer, usdc.address)).to.equal(U('1'));
    expect(await opf.monthlyUsedBy(payer, usdc.address)).to.equal(U('1'));
    expect(await usdc.allowance(opf.address, escrowSigner.address)).to.equal(U('1'));
  });

  it('7 user not on list -> 0; node not on list -> 0; token disabled -> 0; paused -> 0', async function () {
    await setLimits(10000, U('10'), 0, U('100'));
    const payer = randAddr(), node = randAddr();

    // neither allowed yet
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(0);
    // user only
    await userList.setMember(payer, true);
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(0); // node still blocked
    // both allowed
    await nodeList.setMember(node, true);
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(U('5'));

    // token disabled
    await setLimits(10000, U('10'), 0, U('100'), false);
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(0);
    await setLimits(10000, U('10'), 0, U('100'), true);

    // paused
    await opf.connect(owner).pause();
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(0);
    expect(await opf.quoteSubsidy(node, payer, JOB, usdc.address, U('5'), U('5'))).to.equal(0);
    await opf.connect(owner).unpause();
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(U('5'));
  });

  it('7b jobType allowlist: replace, sync, re-open, non-owner reverts', async function () {
    await setLimits(10000, U('10'), 0, U('100'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);

    // empty allowlist => all jobTypes allowed
    expect(await opf.isJobTypeSubsidized(9)).to.equal(true);
    expect((await staticGrant(escrowSigner, node, payer, 9, usdc, U('5'), U('5')))[0]).to.equal(U('5'));

    // restrict to [7]
    await expect(opf.connect(owner).setAllowedJobTypes([7]))
      .to.emit(opf, 'AllowedJobTypesSet');
    expect(await opf.getAllowedJobTypes()).to.deep.equal([ethers.BigNumber.from(7)]);
    expect(await opf.isJobTypeAllowed(7)).to.equal(true);
    expect(await opf.isJobTypeSubsidized(7)).to.equal(true);
    expect(await opf.isJobTypeSubsidized(9)).to.equal(false);
    expect((await staticGrant(escrowSigner, node, payer, 7, usdc, U('5'), U('5')))[0]).to.equal(U('5'));
    expect((await staticGrant(escrowSigner, node, payer, 9, usdc, U('5'), U('5')))[0]).to.equal(0);

    // replace with [3,3,8] -> dedup to [3,8], old 7 no longer allowed
    await opf.connect(owner).setAllowedJobTypes([3, 3, 8]);
    expect(await opf.isJobTypeAllowed(7)).to.equal(false);
    expect(await opf.isJobTypeAllowed(3)).to.equal(true);
    expect(await opf.isJobTypeAllowed(8)).to.equal(true);
    expect(await opf.getAllowedJobTypes()).to.deep.equal([ethers.BigNumber.from(3), ethers.BigNumber.from(8)]);

    // back to [] -> all allowed again
    await opf.connect(owner).setAllowedJobTypes([]);
    expect(await opf.getAllowedJobTypes()).to.deep.equal([]);
    expect(await opf.isJobTypeSubsidized(9)).to.equal(true);
    expect((await staticGrant(escrowSigner, node, payer, 9, usdc, U('5'), U('5')))[0]).to.equal(U('5'));

    // non-owner reverts
    await expect(opf.connect(attacker).setAllowedJobTypes([1])).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it('8 drain guard: unauthorized caller returns (0,0) AND grants no allowance', async function () {
    await setLimits(10000, U('10'), 0, U('100'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);
    // attacker is NOT an authorized escrow
    const [sub, bonus] = await opf.connect(attacker).callStatic.onSubsidyClaim(node, payer, JOB, usdc.address, U('5'), U('5'));
    expect(sub).to.equal(0);
    expect(bonus).to.equal(0);
    await opf.connect(attacker).onSubsidyClaim(node, payer, JOB, usdc.address, U('5'), U('5'));
    expect(await usdc.allowance(opf.address, attacker.address)).to.equal(0);
  });

  it('9 multiple tokens have independent limits and counters', async function () {
    await setLimits(10000, U('2'), 0, U('10'), true, usdc);
    await setLimits(10000, U('7'), 0, U('50'), true, usdc2);
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);

    const [g1] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('100'), U('100'));
    const [g2] = await staticGrant(escrowSigner, node, payer, JOB, usdc2, U('100'), U('100'));
    expect(g1).to.equal(U('2'));
    expect(g2).to.equal(U('7'));

    await opf.connect(escrowSigner).onSubsidyClaim(node, payer, JOB, usdc.address, U('100'), U('100'));
    // usdc counters moved, usdc2 untouched
    expect(await opf.dailyUsedBy(payer, usdc.address)).to.equal(U('2'));
    expect(await opf.dailyUsedBy(payer, usdc2.address)).to.equal(0);
    expect(await opf.remainingDaily(payer, usdc.address)).to.equal(0);
    expect(await opf.remainingDaily(payer, usdc2.address)).to.equal(U('7'));
  });

  it('10 getters: quote == grant, remaining*, remainingSubsidy, secondsUntil*, isUser/NodeAllowed', async function () {
    await setLimits(10000, U('2'), 0, U('10')); // weekly unlimited
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);

    // remaining before
    expect(await opf.remainingDaily(payer, usdc.address)).to.equal(U('2'));
    expect(await opf.remainingWeekly(payer, usdc.address)).to.equal(MAXU); // unlimited
    expect(await opf.remainingMonthly(payer, usdc.address)).to.equal(U('10'));
    // remainingSubsidy = min(2, MAX, 10, balance) = 2
    expect(await opf.remainingSubsidy(payer, usdc.address)).to.equal(U('2'));

    // quote == static grant
    const quoted = await opf.quoteSubsidy(node, payer, JOB, usdc.address, U('5'), U('5'));
    const [g] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5'));
    expect(quoted).to.equal(g).to.equal(U('2'));

    // apply and re-check remaining
    await opf.connect(escrowSigner).onSubsidyClaim(node, payer, JOB, usdc.address, U('5'), U('5'));
    expect(await opf.remainingDaily(payer, usdc.address)).to.equal(0);
    expect(await opf.remainingMonthly(payer, usdc.address)).to.equal(U('8'));
    expect(await opf.remainingSubsidy(payer, usdc.address)).to.equal(0); // daily exhausted

    // secondsUntil* sane
    expect((await opf.secondsUntilDayReset()).toNumber()).to.be.greaterThan(0);
    expect((await opf.secondsUntilDayReset()).toNumber()).to.be.lte(24 * 3600);
    expect((await opf.secondsUntilWeekReset()).toNumber()).to.be.lte(7 * 24 * 3600);
    expect((await opf.secondsUntilMonthReset()).toNumber()).to.be.lte(28 * 24 * 3600);

    // list membership views
    expect(await opf.isUserAllowed(payer)).to.equal(true);
    expect(await opf.isNodeAllowed(node)).to.equal(true);
    expect(await opf.isUserAllowed(randAddr())).to.equal(false);
    // availableBalance + getTokenLimits
    expect(await opf.availableBalance(usdc.address)).to.equal(await usdc.balanceOf(opf.address));
    const L = await opf.getTokenLimits(usdc.address);
    expect(L.pctBps).to.equal(10000);
    expect(L.daily).to.equal(U('2'));
    expect(L.enabled).to.equal(true);
  });

  it('11 owner-only: setters revert for non-owner; withdraw returns funds; events emitted', async function () {
    // events on setters
    await expect(opf.connect(owner).setTokenLimits(usdc.address, 5000, U('1'), U('2'), U('3'), true))
      .to.emit(opf, 'TokenLimitsSet').withArgs(usdc.address, 5000, U('1'), U('2'), U('3'), true);
    await expect(opf.connect(owner).setUserAccessList(userList.address))
      .to.emit(opf, 'UserAccessListSet').withArgs(userList.address);
    await expect(opf.connect(owner).setNodeAccessList(nodeList.address))
      .to.emit(opf, 'NodeAccessListSet').withArgs(nodeList.address);
    await expect(opf.connect(owner).setAuthorizedEscrow(escrow2.address, true))
      .to.emit(opf, 'AuthorizedEscrowSet').withArgs(escrow2.address, true);

    // pctBps > BPS reverts
    await expect(opf.connect(owner).setTokenLimits(usdc.address, 10001, 0, 0, 0, true))
      .to.be.revertedWith("OPFSubsidy: pctBps > BPS");

    // non-owner reverts
    const NO = "Ownable: caller is not the owner";
    await expect(opf.connect(attacker).setTokenLimits(usdc.address, 1, 0, 0, 0, true)).to.be.revertedWith(NO);
    await expect(opf.connect(attacker).setUserAccessList(ZERO)).to.be.revertedWith(NO);
    await expect(opf.connect(attacker).setNodeAccessList(ZERO)).to.be.revertedWith(NO);
    await expect(opf.connect(attacker).setAllowedJobTypes([1])).to.be.revertedWith(NO);
    await expect(opf.connect(attacker).setAuthorizedEscrow(attacker.address, true)).to.be.revertedWith(NO);
    await expect(opf.connect(attacker).pause()).to.be.revertedWith(NO);
    await expect(opf.connect(attacker).unpause()).to.be.revertedWith(NO);
    await expect(opf.connect(attacker).withdrawTokens(usdc.address, attacker.address, U('1'))).to.be.revertedWith(NO);
    await expect(opf.connect(attacker).withdrawAllTokens(usdc.address, attacker.address)).to.be.revertedWith(NO);

    // withdrawTokens returns funds + event
    const before = await usdc.balanceOf(other.address);
    await expect(opf.connect(owner).withdrawTokens(usdc.address, other.address, U('100')))
      .to.emit(opf, 'Withdraw').withArgs(usdc.address, other.address, U('100'));
    expect((await usdc.balanceOf(other.address)).sub(before)).to.equal(U('100'));

    // withdrawAllTokens drains the rest
    await opf.connect(owner).withdrawAllTokens(usdc.address, other.address);
    expect(await usdc.balanceOf(opf.address)).to.equal(0);

    // withdrawTokens guards
    await expect(opf.connect(owner).withdrawTokens(usdc.address, ZERO, U('1')))
      .to.be.revertedWith("OPFSubsidy: cannot withdraw to zero address");
    await expect(opf.connect(owner).withdrawTokens(usdc.address, other.address, 0))
      .to.be.revertedWith("OPFSubsidy: amount must be greater than zero");
  });

  it('12 get{Day,Week,Month}ByTimestamp + usedByAt read consumption for a specific date', async function () {
    const DAYS = (await opf.DAY()).toNumber();
    const WEEKS = (await opf.WEEK()).toNumber();
    const MONTHS = (await opf.MONTH()).toNumber();

    // index math for an arbitrary timestamp
    const ts = 1700000000; // a fixed past date
    expect(await opf.getDayByTimestamp(ts)).to.equal(Math.floor(ts / DAYS));
    expect(await opf.getWeekByTimestamp(ts)).to.equal(Math.floor(ts / WEEKS));
    expect(await opf.getMonthByTimestamp(ts)).to.equal(Math.floor(ts / MONTHS));
    // at block.timestamp the *ByTimestamp helpers equal the current* getters
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    expect(await opf.getDayByTimestamp(now)).to.equal(await opf.currentDayIndex());
    expect(await opf.getWeekByTimestamp(now)).to.equal(await opf.currentWeekIndex());
    expect(await opf.getMonthByTimestamp(now)).to.equal(await opf.currentMonthIndex());

    // make a claim today, capture the date, then verify usedByAt reads that date's consumption
    await setLimits(10000, U('2'), 0, U('10'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);
    const claimTx = await opf.connect(escrowSigner).onSubsidyClaim(node, payer, JOB, usdc.address, U('2'), U('2'));
    const claimTs = (await ethers.provider.getBlock((await claimTx.wait()).blockNumber)).timestamp;

    expect(await opf.dailyUsedByAt(payer, usdc.address, claimTs)).to.equal(U('2'));
    expect(await opf.weeklyUsedByAt(payer, usdc.address, claimTs)).to.equal(U('2'));
    expect(await opf.monthlyUsedByAt(payer, usdc.address, claimTs)).to.equal(U('2'));

    // advance to a fresh month: the CURRENT day usage resets, but querying the past date still works
    await advanceToFreshMonth();
    expect(await opf.dailyUsedBy(payer, usdc.address)).to.equal(0);
    expect(await opf.dailyUsedByAt(payer, usdc.address, claimTs)).to.equal(U('2'));      // past date intact
    expect(await opf.monthlyUsedByAt(payer, usdc.address, claimTs)).to.equal(U('2'));    // past month intact
    // a date in a period with no activity reads 0
    expect(await opf.dailyUsedByAt(payer, usdc.address, ts)).to.equal(0);
  });
});
