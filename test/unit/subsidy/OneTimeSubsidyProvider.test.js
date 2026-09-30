const { assert, expect } = require('chai');
const { ethers } = require("hardhat");
const { getEventFromTx } = require("../../helpers/utils");

const ZERO = '0x0000000000000000000000000000000000000000';
const MAXU = ethers.constants.MaxUint256;

// 6-decimal USDC-style amounts
const U = (n) => ethers.utils.parseUnits(n, 6);

const randAddr = () => ethers.Wallet.createRandom().address;

describe('OneTimeSubsidyProvider (unit)', function () {
  let owner, escrowSigner, escrow2, attacker, other;
  let sub, usdc, usdc2, userList, nodeList;

  const JOB = 0; // default jobType (allowlist empty => all allowed unless a test sets it)

  // configure a token: pctBps (0 = no per-job cap), defaultCredit, enabled
  const setConfig = (pctBps, defaultCredit, enabled = true, token = undefined) =>
    sub.connect(owner).setTokenConfig((token || usdc).address, pctBps, defaultCredit, enabled);

  // allow payer+node on both lists (fresh random addresses)
  const allow = async (payer, node) => {
    await userList.setMember(payer, true);
    await nodeList.setMember(node, true);
  };

  beforeEach(async function () {
    const s = await ethers.getSigners();
    owner = s[0]; escrowSigner = s[1]; escrow2 = s[2]; attacker = s[3]; other = s[4];

    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
    const MockAccessList = await ethers.getContractFactory('MockAccessList');
    const OneTime = await ethers.getContractFactory('OneTimeSubsidyProvider');

    usdc = await MockErc20Decimals.deploy("USDC", "USDC", 6);
    await usdc.deployed();
    usdc2 = await MockErc20Decimals.deploy("USDC2", "USDC2", 6);
    await usdc2.deployed();
    userList = await MockAccessList.deploy(); await userList.deployed();
    nodeList = await MockAccessList.deploy(); await nodeList.deployed();

    sub = await OneTime.connect(owner).deploy();
    await sub.deployed();

    // fund with plenty of USDC (both tokens)
    await usdc.transfer(sub.address, U('1000000'));
    await usdc2.transfer(sub.address, U('1000000'));

    // gates on
    await sub.connect(owner).setUserAccessList(userList.address);
    await sub.connect(owner).setNodeAccessList(nodeList.address);
    // authorize the escrow caller
    await sub.connect(owner).setAuthorizedEscrow(escrowSigner.address, true);
  });

  // helper: get grant that onSubsidyClaim WOULD return (no state change)
  const staticGrant = (caller, node, payer, jobType, token, amount, needed) =>
    sub.connect(caller).callStatic.onSubsidyClaim(node, payer, jobType, (token || usdc).address, amount, needed);

  const claim = (node, payer, jobType, token, amount, needed) =>
    sub.connect(escrowSigner).onSubsidyClaim(node, payer, jobType, (token || usdc).address, amount, needed);

  // ---------------------------------------------------------------------------------------------
  it('1 happy path: default credit granted, event + allowance + usage', async function () {
    await setConfig(0, U('10')); // no per-job cap, 10 credit
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);

    const quoted = await sub.quoteSubsidy(node, payer, JOB, usdc.address, U('4'), U('4'));
    const [g, bonus] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('4'), U('4'));
    expect(quoted.subsidy).to.equal(U('4'));
    expect(quoted.bonus).to.equal(0);
    expect(g).to.equal(U('4'));
    expect(bonus).to.equal(0);

    const tx = await claim(node, payer, JOB, usdc, U('4'), U('4'));
    const ev = getEventFromTx(await tx.wait(), 'SubsidyGranted');
    assert(ev, 'missing SubsidyGranted');
    expect(ev.args.amount).to.equal(U('4'));
    expect(ev.args.token).to.equal(usdc.address);
    expect(ev.args.escrow).to.equal(escrowSigner.address);
    expect(ev.args.round).to.equal(0);

    expect(await usdc.allowance(sub.address, escrowSigner.address)).to.equal(U('4'));
    expect(await sub.usedBy(payer, usdc.address)).to.equal(U('4'));
    expect(await sub.remainingCredit(payer, usdc.address)).to.equal(U('6'));
  });

  it('2 cumulative draw-down: credit spent across many jobs, then exhausted', async function () {
    await setConfig(0, U('10'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);

    // job 1: 4
    await claim(node, payer, JOB, usdc, U('4'), U('4'));
    expect(await sub.remainingCredit(payer, usdc.address)).to.equal(U('6'));
    // job 2: 4 -> used 8
    await claim(node, payer, JOB, usdc, U('4'), U('4'));
    expect(await sub.remainingCredit(payer, usdc.address)).to.equal(U('2'));
    // job 3: need 5 but only 2 remains -> grant 2
    const [g3] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5'));
    expect(g3).to.equal(U('2'));
    await claim(node, payer, JOB, usdc, U('5'), U('5'));
    expect(await sub.remainingCredit(payer, usdc.address)).to.equal(0);
    // job 4: nothing left -> 0
    const [g4] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5'));
    expect(g4).to.equal(0);
  });

  it('3 per-user override: default 10, friend 20; unset reverts to default; batch', async function () {
    await setConfig(0, U('10'));
    const def = randAddr(), friend = randAddr(), node = randAddr();
    await allow(def, node);
    await allow(friend, node);

    // default user gets 10
    expect(await sub.effectiveCredit(def, usdc.address)).to.equal(U('10'));
    // override friend to 20
    await expect(sub.connect(owner).setUserCredit(friend, usdc.address, U('20')))
      .to.emit(sub, 'UserCreditSet').withArgs(friend, usdc.address, U('20'));
    expect(await sub.effectiveCredit(friend, usdc.address)).to.equal(U('20'));
    expect(await sub.hasUserCredit(friend, usdc.address)).to.equal(true);

    // friend can draw 15 in one job (no per-job cap), default user only 10
    expect((await staticGrant(escrowSigner, node, friend, JOB, usdc, U('15'), U('15')))[0]).to.equal(U('15'));
    expect((await staticGrant(escrowSigner, node, def, JOB, usdc, U('15'), U('15')))[0]).to.equal(U('10'));

    // override to 0 explicitly -> 0 (distinct from "use default")
    await sub.connect(owner).setUserCredit(friend, usdc.address, 0);
    expect(await sub.effectiveCredit(friend, usdc.address)).to.equal(0);
    expect((await staticGrant(escrowSigner, node, friend, JOB, usdc, U('15'), U('15')))[0]).to.equal(0);

    // unset -> back to default 10
    await expect(sub.connect(owner).unsetUserCredit(friend, usdc.address))
      .to.emit(sub, 'UserCreditUnset').withArgs(friend, usdc.address);
    expect(await sub.hasUserCredit(friend, usdc.address)).to.equal(false);
    expect(await sub.effectiveCredit(friend, usdc.address)).to.equal(U('10'));

    // batch: set several users to 25
    const a = randAddr(), b = randAddr();
    await sub.connect(owner).setUserCredits([a, b], usdc.address, U('25'));
    expect(await sub.effectiveCredit(a, usdc.address)).to.equal(U('25'));
    expect(await sub.effectiveCredit(b, usdc.address)).to.equal(U('25'));
  });

  it('4 resetAllUsers refreshes everyone; overrides persist', async function () {
    await setConfig(0, U('10'));
    const p1 = randAddr(), p2 = randAddr(), node = randAddr();
    await allow(p1, node); await allow(p2, node);
    await sub.connect(owner).setUserCredit(p2, usdc.address, U('20')); // p2 is a friend

    // exhaust both
    await claim(node, p1, JOB, usdc, U('10'), U('10'));
    await claim(node, p2, JOB, usdc, U('20'), U('20'));
    expect(await sub.remainingCredit(p1, usdc.address)).to.equal(0);
    expect(await sub.remainingCredit(p2, usdc.address)).to.equal(0);

    // global reset
    await expect(sub.connect(owner).resetAllUsers())
      .to.emit(sub, 'AllUsersReset').withArgs(1);
    expect(await sub.globalRound()).to.equal(1);

    // both fresh again; p2 override (20) persisted
    expect(await sub.usedBy(p1, usdc.address)).to.equal(0);
    expect(await sub.usedBy(p2, usdc.address)).to.equal(0);
    expect(await sub.remainingCredit(p1, usdc.address)).to.equal(U('10'));
    expect(await sub.remainingCredit(p2, usdc.address)).to.equal(U('20'));
    expect((await staticGrant(escrowSigner, node, p1, JOB, usdc, U('10'), U('10')))[0]).to.equal(U('10'));
  });

  it('5 resetUser refreshes only that user', async function () {
    await setConfig(0, U('10'));
    const p1 = randAddr(), p2 = randAddr(), node = randAddr();
    await allow(p1, node); await allow(p2, node);

    await claim(node, p1, JOB, usdc, U('10'), U('10'));
    await claim(node, p2, JOB, usdc, U('10'), U('10'));

    await expect(sub.connect(owner).resetUser(p1))
      .to.emit(sub, 'UserReset').withArgs(p1, 1);
    expect(await sub.effectiveRound(p1)).to.equal(1);
    expect(await sub.effectiveRound(p2)).to.equal(0);

    // p1 fresh, p2 still exhausted
    expect(await sub.remainingCredit(p1, usdc.address)).to.equal(U('10'));
    expect(await sub.remainingCredit(p2, usdc.address)).to.equal(0);
    expect((await staticGrant(escrowSigner, node, p1, JOB, usdc, U('10'), U('10')))[0]).to.equal(U('10'));
    expect((await staticGrant(escrowSigner, node, p2, JOB, usdc, U('10'), U('10')))[0]).to.equal(0);

    // resetAllUsers refreshes EVERYONE, including the individually-reset p1 (additive model:
    // effectiveRound = globalRound + userRound)
    await sub.connect(owner).resetAllUsers();
    expect(await sub.effectiveRound(p1)).to.equal(2); // global 1 + offset 1
    expect(await sub.effectiveRound(p2)).to.equal(1); // global 1 + offset 0
    // resetUsers batch bumps p1's offset again
    await sub.connect(owner).resetUsers([p1]);
    expect(await sub.effectiveRound(p1)).to.equal(3); // global 1 + offset 2
  });

  it('5b resetAllUsers refreshes a user who was individually reset and used credit since', async function () {
    // Regression guard: under a max()-based round model, resetAllUsers() would silently SKIP a user
    // whose userRound already exceeded globalRound. The additive model must refresh them too.
    await setConfig(0, U('10'));
    const friend = randAddr(), node = randAddr();
    await allow(friend, node);

    await claim(node, friend, JOB, usdc, U('10'), U('10')); // round 0 exhausted
    await sub.connect(owner).resetUser(friend);             // fresh round
    await claim(node, friend, JOB, usdc, U('10'), U('10')); // exhausted again
    expect(await sub.remainingCredit(friend, usdc.address)).to.equal(0);

    // a global reset MUST refresh the friend, not skip them
    await sub.connect(owner).resetAllUsers();
    expect(await sub.remainingCredit(friend, usdc.address)).to.equal(U('10'));
    expect(await sub.usedBy(friend, usdc.address)).to.equal(0);
  });

  it('6 drain guard: unauthorized caller returns (0,0) AND grants no allowance', async function () {
    await setConfig(0, U('10'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);
    const [g, bonus] = await sub.connect(attacker).callStatic.onSubsidyClaim(node, payer, JOB, usdc.address, U('5'), U('5'));
    expect(g).to.equal(0);
    expect(bonus).to.equal(0);
    await sub.connect(attacker).onSubsidyClaim(node, payer, JOB, usdc.address, U('5'), U('5'));
    expect(await usdc.allowance(sub.address, attacker.address)).to.equal(0);
  });

  it('7 gates: user/node not on list, token disabled, paused, zero credit -> 0', async function () {
    await setConfig(0, U('10'));
    const payer = randAddr(), node = randAddr();

    // neither allowed yet
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(0);
    await userList.setMember(payer, true);
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(0); // node blocked
    await nodeList.setMember(node, true);
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(U('5'));

    // token disabled
    await setConfig(0, U('10'), false);
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(0);
    await setConfig(0, U('10'), true);

    // zero default credit -> 0
    await setConfig(0, 0, true);
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(0);
    await setConfig(0, U('10'), true);

    // paused
    await sub.connect(owner).pause();
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(0);
    expect((await sub.quoteSubsidy(node, payer, JOB, usdc.address, U('5'), U('5'))).subsidy).to.equal(0);
    await sub.connect(owner).unpause();
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5')))[0]).to.equal(U('5'));
  });

  it('7b jobType allowlist: restrict, dedup, re-open, non-owner reverts', async function () {
    await setConfig(0, U('10'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);

    // empty allowlist => all allowed
    expect(await sub.isJobTypeSubsidized(9)).to.equal(true);
    expect((await staticGrant(escrowSigner, node, payer, 9, usdc, U('5'), U('5')))[0]).to.equal(U('5'));

    // restrict to [7]
    await expect(sub.connect(owner).setAllowedJobTypes([7])).to.emit(sub, 'AllowedJobTypesSet');
    expect(await sub.getAllowedJobTypes()).to.deep.equal([ethers.BigNumber.from(7)]);
    expect((await staticGrant(escrowSigner, node, payer, 7, usdc, U('5'), U('5')))[0]).to.equal(U('5'));
    expect((await staticGrant(escrowSigner, node, payer, 9, usdc, U('5'), U('5')))[0]).to.equal(0);

    // replace with [3,3,8] -> dedup, old 7 gone
    await sub.connect(owner).setAllowedJobTypes([3, 3, 8]);
    expect(await sub.isJobTypeAllowed(7)).to.equal(false);
    expect(await sub.getAllowedJobTypes()).to.deep.equal([ethers.BigNumber.from(3), ethers.BigNumber.from(8)]);

    // back to [] -> all allowed
    await sub.connect(owner).setAllowedJobTypes([]);
    expect(await sub.isJobTypeSubsidized(9)).to.equal(true);

    await expect(sub.connect(attacker).setAllowedJobTypes([1])).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it('8 optional pctBps per-job cap binds below the credit', async function () {
    await setConfig(1500, U('100')); // 15% per-job cap, 100 credit
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);
    // amount 10 -> 15% = 1.5 < remaining credit
    const [g] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('10'), U('10'));
    expect(g).to.equal(U('1.5'));
    expect((await sub.quoteSubsidy(node, payer, JOB, usdc.address, U('10'), U('10'))).subsidy).to.equal(U('1.5'));
  });

  it('9 subsidyNeeded ceiling and balance cap', async function () {
    // subsidyNeeded ceiling
    await setConfig(0, U('10'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('1')))[0]).to.equal(U('1'));

    // balance cap: drain then refund a small balance
    await sub.connect(owner).withdrawAllTokens(usdc.address, owner.address);
    await usdc.transfer(sub.address, U('1'));
    const [g] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5'));
    expect(g).to.equal(U('1')); // balance binds
    await claim(node, payer, JOB, usdc, U('5'), U('5'));
    expect(await sub.usedBy(payer, usdc.address)).to.equal(U('1'));
    expect(await usdc.allowance(sub.address, escrowSigner.address)).to.equal(U('1'));
  });

  it('10 within a round, repeated consults cannot exceed the credit (CEI persistence)', async function () {
    await setConfig(0, U('5'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);
    // first consult uses full 5
    await claim(node, payer, JOB, usdc, U('5'), U('5'));
    // any further consult in the same round -> 0
    const [g] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('5'), U('5'));
    expect(g).to.equal(0);
    expect(await sub.usedBy(payer, usdc.address)).to.equal(U('5'));
  });

  it('11 independent per-token credits and usage', async function () {
    await setConfig(0, U('10'), true, usdc);
    await setConfig(0, U('7'), true, usdc2);
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);

    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc, U('100'), U('100')))[0]).to.equal(U('10'));
    expect((await staticGrant(escrowSigner, node, payer, JOB, usdc2, U('100'), U('100')))[0]).to.equal(U('7'));

    await claim(node, payer, JOB, usdc, U('100'), U('100'));
    expect(await sub.usedBy(payer, usdc.address)).to.equal(U('10'));
    expect(await sub.usedBy(payer, usdc2.address)).to.equal(0);
    expect(await sub.remainingCredit(payer, usdc.address)).to.equal(0);
    expect(await sub.remainingCredit(payer, usdc2.address)).to.equal(U('7'));
  });

  it('12 getters: quote==grant, remainingSubsidy, getTokenConfig, membership, availableBalance', async function () {
    await setConfig(0, U('10'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);

    expect(await sub.remainingCredit(payer, usdc.address)).to.equal(U('10'));
    expect(await sub.remainingSubsidy(payer, usdc.address)).to.equal(U('10'));

    const quoted = await sub.quoteSubsidy(node, payer, JOB, usdc.address, U('4'), U('4'));
    const [g] = await staticGrant(escrowSigner, node, payer, JOB, usdc, U('4'), U('4'));
    expect(quoted.subsidy).to.equal(g).to.equal(U('4'));

    await claim(node, payer, JOB, usdc, U('4'), U('4'));
    expect(await sub.remainingCredit(payer, usdc.address)).to.equal(U('6'));
    expect(await sub.usedByAt(payer, usdc.address, 0)).to.equal(U('4'));

    // remainingSubsidy capped by a small balance
    await sub.connect(owner).withdrawAllTokens(usdc.address, owner.address);
    await usdc.transfer(sub.address, U('2'));
    expect(await sub.remainingSubsidy(payer, usdc.address)).to.equal(U('2')); // min(6, balance 2)

    expect(await sub.isUserAllowed(payer)).to.equal(true);
    expect(await sub.isNodeAllowed(node)).to.equal(true);
    expect(await sub.isUserAllowed(randAddr())).to.equal(false);
    expect(await sub.availableBalance(usdc.address)).to.equal(await usdc.balanceOf(sub.address));
    const c = await sub.getTokenConfig(usdc.address);
    expect(c.pctBps).to.equal(0);
    expect(c.defaultCredit).to.equal(U('10'));
    expect(c.enabled).to.equal(true);
  });

  it('13 owner-only: setters revert for non-owner; guards; withdraw; events', async function () {
    await expect(sub.connect(owner).setTokenConfig(usdc.address, 5000, U('12'), true))
      .to.emit(sub, 'TokenConfigSet').withArgs(usdc.address, 5000, U('12'), true);
    await expect(sub.connect(owner).setAuthorizedEscrow(escrow2.address, true))
      .to.emit(sub, 'AuthorizedEscrowSet').withArgs(escrow2.address, true);

    // guards
    await expect(sub.connect(owner).setTokenConfig(usdc.address, 10001, U('1'), true))
      .to.be.revertedWith("OneTimeSubsidy: pctBps > BPS");
    await expect(sub.connect(owner).setTokenConfig(ZERO, 0, U('1'), true))
      .to.be.revertedWith("OneTimeSubsidy: token is zero address");
    await expect(sub.connect(owner).setUserCredit(ZERO, usdc.address, U('1')))
      .to.be.revertedWith("OneTimeSubsidy: payer is zero address");

    // non-owner reverts
    const NO = "Ownable: caller is not the owner";
    await expect(sub.connect(attacker).setTokenConfig(usdc.address, 1, 0, true)).to.be.revertedWith(NO);
    await expect(sub.connect(attacker).setUserCredit(other.address, usdc.address, U('1'))).to.be.revertedWith(NO);
    await expect(sub.connect(attacker).setUserCredits([other.address], usdc.address, U('1'))).to.be.revertedWith(NO);
    await expect(sub.connect(attacker).unsetUserCredit(other.address, usdc.address)).to.be.revertedWith(NO);
    await expect(sub.connect(attacker).resetAllUsers()).to.be.revertedWith(NO);
    await expect(sub.connect(attacker).resetUser(other.address)).to.be.revertedWith(NO);
    await expect(sub.connect(attacker).setUserAccessList(ZERO)).to.be.revertedWith(NO);
    await expect(sub.connect(attacker).setNodeAccessList(ZERO)).to.be.revertedWith(NO);
    await expect(sub.connect(attacker).setAllowedJobTypes([1])).to.be.revertedWith(NO);
    await expect(sub.connect(attacker).setAuthorizedEscrow(attacker.address, true)).to.be.revertedWith(NO);
    await expect(sub.connect(attacker).pause()).to.be.revertedWith(NO);
    await expect(sub.connect(attacker).withdrawTokens(usdc.address, attacker.address, U('1'))).to.be.revertedWith(NO);
    await expect(sub.connect(attacker).withdrawAllTokens(usdc.address, attacker.address)).to.be.revertedWith(NO);

    // withdraw returns funds + event + guards
    const before = await usdc.balanceOf(other.address);
    await expect(sub.connect(owner).withdrawTokens(usdc.address, other.address, U('100')))
      .to.emit(sub, 'Withdraw').withArgs(usdc.address, other.address, U('100'));
    expect((await usdc.balanceOf(other.address)).sub(before)).to.equal(U('100'));
    await sub.connect(owner).withdrawAllTokens(usdc.address, other.address);
    expect(await usdc.balanceOf(sub.address)).to.equal(0);
    await expect(sub.connect(owner).withdrawTokens(usdc.address, ZERO, U('1')))
      .to.be.revertedWith("OneTimeSubsidy: cannot withdraw to zero address");
    await expect(sub.connect(owner).withdrawTokens(usdc.address, other.address, 0))
      .to.be.revertedWith("OneTimeSubsidy: amount must be greater than zero");
  });

  it('14 ISubsidyView.subsidyBuckets: single ONE_TIME bucket reflecting credit/used/remaining', async function () {
    await setConfig(0, U('10'));
    const payer = randAddr(), node = randAddr();
    await allow(payer, node);
    await claim(node, payer, JOB, usdc, U('4'), U('4'));

    const report = await sub.subsidyBuckets(payer, usdc.address);
    // payer-side eligibility flags
    expect(report.paused).to.equal(false);
    expect(report.userAllowed).to.equal(true);
    expect(report.tokenEnabled).to.equal(true);
    // raw budget buckets
    const buckets = report.buckets;
    expect(buckets.length).to.equal(1);
    expect(buckets[0].period).to.equal(0); // Period.ONE_TIME
    expect(buckets[0].periodSeconds).to.equal(0); // one-time: no fixed window
    expect(buckets[0].unlimited).to.equal(false);
    expect(buckets[0].limit).to.equal(U('10'));
    expect(buckets[0].used).to.equal(U('4'));
    expect(buckets[0].remaining).to.equal(U('6'));
    expect(buckets[0].resetsAt).to.equal(0); // admin-driven, no timer

    // flags reflect ineligibility without zeroing the raw budget
    const stranger = randAddr();
    const r2 = await sub.subsidyBuckets(stranger, usdc.address);
    expect(r2.userAllowed).to.equal(false);
    expect(r2.buckets[0].limit).to.equal(U('10')); // budget still reported raw
    await sub.connect(owner).pause();
    expect((await sub.subsidyBuckets(payer, usdc.address)).paused).to.equal(true);
    await sub.connect(owner).unpause();
  });

  it('15 ISubsidyView discovery: subsidyKind / version / supportsInterface + gated remainingSubsidy', async function () {
    expect(await sub.subsidyKind()).to.equal(1); // SubsidyKind.ONE_TIME
    expect(await sub.version()).to.equal(1);
    expect(await sub.supportsInterface('0x01ffc9a7')).to.equal(true);  // IERC165
    expect(await sub.supportsInterface('0xffffffff')).to.equal(false);

    // remainingSubsidy is gated: 0 for a non-allowed user, finite/positive once allowed
    await setConfig(0, U('10'));
    const payer = randAddr(), node = randAddr();
    expect(await sub.remainingSubsidy(payer, usdc.address)).to.equal(0); // not on the user list
    await allow(payer, node);
    expect(await sub.remainingSubsidy(payer, usdc.address)).to.equal(U('10'));
    // and 0 while paused
    await sub.connect(owner).pause();
    expect(await sub.remainingSubsidy(payer, usdc.address)).to.equal(0);
    await sub.connect(owner).unpause();
  });
});
