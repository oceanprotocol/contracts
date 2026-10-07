const { assert, expect } = require('chai');
const { ethers, artifacts } = require("hardhat");
const { getEventFromTx } = require("../../helpers/utils");
const { deployEscrow, getEscrowFactory } = require("../../helpers/escrow");

const ZERO = ethers.constants.AddressZero;
const MAXU = ethers.constants.MaxUint256;
const BN = (n) => ethers.BigNumber.from(n);
const BN0 = BN(0);

const fastForward = async (s) => {
  await ethers.provider.send("evm_increaseTime", [s]);
  await ethers.provider.send("evm_mine");
};
const nowTs = async () => (await ethers.provider.getBlock('latest')).timestamp;

// ERC-165 interfaceId (XOR of all external function selectors) computed from the interface artifact,
// so it tracks the Solidity `type(I).interfaceId` the escrow advertises.
async function erc165Id(name) {
  const art = await artifacts.readArtifact(name);
  const iface = new ethers.utils.Interface(art.abi);
  let id = BN0;
  for (const f of Object.keys(iface.functions)) {
    id = id.xor(BN(iface.getSighash(f)));
  }
  return ethers.utils.hexZeroPad(id.toHexString(), 4);
}

// walk the escrow's list-order, per-provider cap for a lock of amount L (budgets are large so the
// grant is always min(sub, remaining); duplicates contribute 0). Mirrors SponsorshipLib.applyLockSubsidies.
function simContrib(provs, L) {
  let rem = BN(L);
  const out = [];
  const seen = new Set();
  for (const p of provs) {
    if (rem.isZero() || seen.has(p.c.address)) { out.push(BN0); continue; }
    seen.add(p.c.address);
    const g = p.sub.lt(rem) ? p.sub : rem;
    out.push(g);
    rem = rem.sub(g);
  }
  return out;
}
const sum = (arr) => arr.reduce((a, b) => a.add(b), BN0);

// =================================================================================================
// Lifecycle x settlement matrix, run against BOTH escrow flavours via a shared factory.
// =================================================================================================
for (const KIND of ['community', 'enterprise']) {
  describe(`EscrowSponsorship [${KIND}]`, function () {
    const D6 = (n) => ethers.utils.parseUnits(n, 6); // 6-dec USDC-style token
    const P1 = ethers.utils.parseEther('1');
    const feeOf = (base) => base.mul(opcFee).div(P1);

    let deployer, node, node2, payer, payer2, feeColl, outsider;
    let escrow, router, feeCollector, T6, ProviderF;
    let opcFee;
    let jobSeq = 100;
    const tracked = new Set();          // addresses whose escrow funds count toward solvency
    const trackedProviders = new Set(); // provider addresses whose reclaimable counts toward solvency

    async function setFee(rate) {
      opcFee = BN(rate);
      if (KIND === 'community') await router.connect(deployer).updateOPCFee(rate, rate, 0, 0);
      else await feeCollector.setRate(rate);
    }
    const feeSink = () => (KIND === 'community' ? feeColl.address : feeCollector.address);

    async function depositFn(who, amount) {
      await T6.connect(who).approve(escrow.address, MAXU);
      await escrow.connect(who).deposit(T6.address, amount);
      tracked.add(who.address);
    }
    async function authorizeFn(payerS, nodeAddr, maxLocked, expiryTs) {
      await escrow.connect(payerS).authorize(T6.address, nodeAddr, maxLocked, 1000000, 1000, expiryTs || 0);
    }
    async function newProvider(sub, budget, balance) {
      const p = await ProviderF.deploy(escrow.address, T6.address);
      await p.deployed();
      await p.configure(sub, 0, budget === undefined ? D6('1000000') : budget);
      if (balance === undefined) balance = D6('1000000');
      if (balance.gt && balance.gt(0)) await T6.connect(deployer).transfer(p.address, balance);
      trackedProviders.add(p.address);
      return { c: p, sub: BN(sub) };
    }
    async function sponsoredTotal() { return escrow.getSponsoredTotal(T6.address); }
    async function reclaimable(addr) { return escrow.getReclaimable(addr, T6.address); }
    async function funds(addr) { return escrow.getUserFunds(addr, T6.address); }
    async function authOf(payerS, nodeAddr) {
      const a = await escrow.getAuthorizations(T6.address, payerS, nodeAddr);
      return a[0];
    }

    async function assertSolvent() {
      let s = BN0;
      for (const u of tracked) { const f = await funds(u); s = s.add(f.available).add(f.locked); }
      s = s.add(await sponsoredTotal());
      for (const p of trackedProviders) s = s.add(await reclaimable(p));
      const bal = await T6.balanceOf(escrow.address);
      expect(bal, `solvency: escrow bal ${bal} == obligations ${s}`).to.equal(s);
    }

    before(async function () {
      const s = await ethers.getSigners();
      deployer = s[0]; node = s[1]; node2 = s[2]; payer = s[4]; payer2 = s[5]; feeColl = s[8]; outsider = s[9];
      const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
      ProviderF = await ethers.getContractFactory('MockSubsidyProvider');
      T6 = await MockErc20Decimals.deploy('USDC', 'USDC', 6);
      await T6.deployed();

      if (KIND === 'community') {
        const Router = await ethers.getContractFactory('FactoryRouter');
        router = await Router.deploy(deployer.address, T6.address, '0x000000000000000000000000000000000000dead', feeColl.address, []);
        await router.deployed();
        escrow = await deployEscrow('Escrow', [router.address, feeColl.address], deployer);
      } else {
        const FeeCollF = await ethers.getContractFactory('MockEnterpriseFeeCollector');
        feeCollector = await FeeCollF.deploy();
        await feeCollector.deployed();
        escrow = await deployEscrow('EnterpriseEscrow', [feeCollector.address], deployer);
      }
      await setFee(ethers.utils.parseEther('0.1'));

      await T6.connect(deployer).transfer(payer.address, D6('2000000'));
      await T6.connect(deployer).transfer(payer2.address, D6('2000000'));
      tracked.add(payer.address); tracked.add(payer2.address);
      tracked.add(node.address); tracked.add(node2.address);
    });

    // isolate every test from the post-deploy baseline so absolute-value assertions are independent
    let __snap;
    beforeEach(async function () { __snap = await ethers.provider.send('evm_snapshot', []); });
    afterEach(async function () { await ethers.provider.send('evm_revert', [__snap]); });

    // ------- helpers that create a lock and assert the post-lock ledger -------
    async function lockAndAssert({ payerS, nodeS, jobId, L, provs, maxLocked, deposit, expiry }) {
      if (deposit !== undefined) await depositFn(payerS, deposit);
      await authorizeFn(payerS, nodeS.address, maxLocked);
      const beforeProv = await Promise.all(provs.map(p => T6.balanceOf(p.c.address)));
      const beforePayer = await funds(payerS.address);
      const beforeSponsored = await sponsoredTotal();
      const auBefore = await authOf(payerS.address, nodeS.address); // baseline (deltas: multi-lock per auth)
      await (await escrow.connect(nodeS).createLock(jobId, T6.address, payerS.address, L, expiry || 100000, 0, provs.map(p => p.c.address))).wait();
      const contrib = simContrib(provs, L);
      const S = sum(contrib);
      const P = BN(L).sub(S);
      // payer: P moved available->locked
      const afterPayer = await funds(payerS.address);
      expect(beforePayer.available.sub(afterPayer.available)).to.equal(P);
      expect(afterPayer.locked.sub(beforePayer.locked)).to.equal(P);
      // sponsoredTotal += S
      expect((await sponsoredTotal()).sub(beforeSponsored)).to.equal(S);
      // each provider balance dropped by its contribution
      for (let i = 0; i < provs.length; i++) {
        expect(beforeProv[i].sub(await T6.balanceOf(provs[i].c.address))).to.equal(contrib[i]);
      }
      // sponsorship record
      const sp = await escrow.getSponsorship(nodeS.address, payerS.address, jobId);
      expect(sp.total).to.equal(S);
      expect(sum(sp.amounts.map(BN))).to.equal(S);
      // auth currentLockedAmount += P, currentLocks += 1 (deltas, so multiple locks per auth are OK)
      const au = await authOf(payerS.address, nodeS.address);
      expect(au.currentLockedAmount.sub(auBefore.currentLockedAmount)).to.equal(P);
      expect(au.currentLocks.sub(auBefore.currentLocks)).to.equal(1);
      await assertSolvent();
      return { contrib, S, P };
    }

    // list-order refund of `consume` against the stored (nonzero) contributions, in order
    function simRefund(contrib, consume) {
      const nz = contrib.filter(c => !c.isZero());
      let rem = BN(consume);
      const refunds = [];
      for (const amt of nz) {
        const c = amt.lt(rem) ? amt : rem;
        rem = rem.sub(c);
        refunds.push({ amt, refund: amt.sub(c) });
      }
      return refunds;
    }

    async function claimAndAssert({ payerS, nodeS, jobId, L, C, provs, contrib, S, P }) {
      const beforePayer = await funds(payerS.address);
      const beforeNode = await funds(nodeS.address);
      const beforeFee = await T6.balanceOf(feeSink());
      const beforeProv = await Promise.all(provs.map(p => T6.balanceOf(p.c.address)));
      const rc = await (await escrow.connect(nodeS).claimLock(jobId, T6.address, payerS.address, C, '0x', 0, [])).wait();
      assert(getEventFromTx(rc, 'Claimed'), 'Claimed event');
      const fromSponsored = BN(C).lt(S) ? BN(C) : S;
      const payerBack = P.sub(BN(C).sub(fromSponsored)); // unclaimed payer remainder
      const payoutBase = BN(C); // bonus 0
      const payout = payoutBase.sub(feeOf(payoutBase));
      expect((await funds(payerS.address)).available.sub(beforePayer.available)).to.equal(payerBack);
      expect((await funds(nodeS.address)).available.sub(beforeNode.available)).to.equal(payout);
      expect((await T6.balanceOf(feeSink())).sub(beforeFee)).to.equal(feeOf(payoutBase));
      // sponsored refunds (push succeeded -> provider balances rise by their unused share)
      const refunds = simRefund(contrib, fromSponsored);
      const nzIdx = contrib.map((c, i) => [c, i]).filter(([c]) => !c.isZero()).map(([, i]) => i);
      for (let k = 0; k < refunds.length; k++) {
        const i = nzIdx[k];
        expect((await T6.balanceOf(provs[i].c.address)).sub(beforeProv[i])).to.equal(refunds[k].refund);
      }
      // sponsoredTotal decreased by full S; sponsorship deleted
      const sp = await escrow.getSponsorship(nodeS.address, payerS.address, jobId);
      expect(sp.total).to.equal(0);
      await assertSolvent();
    }

    // ---- matrix: lock -> claim, across sponsorship mixes x fee x full/partial ----
    const fees = [ethers.utils.parseEther('0'), ethers.utils.parseEther('0.1')];
    for (const fee of fees) {
      const label = fee.isZero() ? 'fee 0' : 'fee 10%';

      it(`lock->claim FULL, S=0 regression (${label})`, async function () {
        await setFee(fee);
        const jobId = jobSeq++;
        const st = await lockAndAssert({ payerS: payer, nodeS: node, jobId, L: D6('10'), provs: [], maxLocked: D6('100'), deposit: D6('10') });
        await claimAndAssert({ payerS: payer, nodeS: node, jobId, L: D6('10'), C: D6('10'), provs: [], ...st });
      });

      it(`lock->claim PARTIAL, partial sponsorship (${label})`, async function () {
        await setFee(fee);
        const jobId = jobSeq++;
        const p1 = await newProvider(D6('4'));
        const st = await lockAndAssert({ payerS: payer, nodeS: node, jobId, L: D6('10'), provs: [p1], maxLocked: D6('100'), deposit: D6('10') });
        expect(st.S).to.equal(D6('4'));
        await claimAndAssert({ payerS: payer, nodeS: node, jobId, L: D6('10'), C: D6('6'), provs: [p1], ...st });
      });

      it(`lock->claim FULL, fully sponsored S=L (deposit 0, maxLocked 0) (${label})`, async function () {
        await setFee(fee);
        const jobId = jobSeq++;
        const p1 = await newProvider(D6('10'));
        // zero payer deposit, maxLocked 0: payer funds can never be touched
        const st = await lockAndAssert({ payerS: payer2, nodeS: node2, jobId, L: D6('10'), provs: [p1], maxLocked: D6('0'), deposit: D6('0') });
        expect(st.S).to.equal(D6('10'));
        expect(st.P).to.equal(0);
        await claimAndAssert({ payerS: payer2, nodeS: node2, jobId, L: D6('10'), C: D6('10'), provs: [p1], ...st });
      });

      it(`lock->claim PARTIAL, fully sponsored multi-provider (${label})`, async function () {
        await setFee(fee);
        const jobId = jobSeq++;
        const p1 = await newProvider(D6('3'));
        const p2 = await newProvider(D6('3'));
        const p3 = await newProvider(D6('4'));
        const st = await lockAndAssert({ payerS: payer2, nodeS: node2, jobId, L: D6('10'), provs: [p1, p2, p3], maxLocked: D6('0'), deposit: D6('0') });
        expect(st.S).to.equal(D6('10'));
        // partial claim 5 -> consumes p1(3)+p2(2) sponsored, p2 refunds 1, p3 refunds 4
        await claimAndAssert({ payerS: payer2, nodeS: node2, jobId, L: D6('10'), C: D6('5'), provs: [p1, p2, p3], ...st });
      });
    }

    // ---- lock -> expired (cancelExpiredLock) ----
    it('lock->expired: full S refunded to sponsors, P to payer', async function () {
      await setFee(ethers.utils.parseEther('0.1'));
      const jobId = jobSeq++;
      const p1 = await newProvider(D6('6'));
      const st = await lockAndAssert({ payerS: payer, nodeS: node, jobId, L: D6('10'), provs: [p1], maxLocked: D6('100'), deposit: D6('10'), expiry: 50 });
      const bPayer = await funds(payer.address);
      const bProv = await T6.balanceOf(p1.c.address);
      await fastForward(100);
      const rc = await (await escrow.connect(outsider).cancelExpiredLock(jobId, T6.address, payer.address, node.address)).wait();
      assert(getEventFromTx(rc, 'Canceled'), 'Canceled event');
      // payer gets back P; provider gets back full S
      expect((await funds(payer.address)).available.sub(bPayer.available)).to.equal(st.P);
      expect((await T6.balanceOf(p1.c.address)).sub(bProv)).to.equal(st.S);
      expect(await sponsoredTotal()).to.equal(0);
      const sp = await escrow.getSponsorship(node.address, payer.address, jobId);
      expect(sp.total).to.equal(0);
      await assertSolvent();
    });

    it('claim-after-expiry routes into cancel: identical result (sponsored refunded, nothing paid)', async function () {
      await setFee(ethers.utils.parseEther('0.1'));
      const jobId = jobSeq++;
      const p1 = await newProvider(D6('6'));
      const st = await lockAndAssert({ payerS: payer, nodeS: node, jobId, L: D6('10'), provs: [p1], maxLocked: D6('100'), deposit: D6('10'), expiry: 50 });
      const bPayer = await funds(payer.address);
      const bNode = await funds(node.address);
      const bProv = await T6.balanceOf(p1.c.address);
      await fastForward(100);
      const rc = await (await escrow.connect(node).claimLock(jobId, T6.address, payer.address, D6('10'), '0x', 0, [])).wait();
      assert(getEventFromTx(rc, 'Canceled'), 'Canceled (claim routed to cancel)');
      expect((await funds(payer.address)).available.sub(bPayer.available)).to.equal(st.P);
      expect((await funds(node.address)).available.sub(bNode.available)).to.equal(0); // nothing paid
      expect((await T6.balanceOf(p1.c.address)).sub(bProv)).to.equal(st.S);
      await assertSolvent();
    });

    // ---- lock -> reLock(grow) -> claim ----
    it('reLock GROW merges payer+new provider, then claim', async function () {
      await setFee(ethers.utils.parseEther('0.1'));
      const jobId = jobSeq++;
      const p1 = await newProvider(D6('4'));
      const st = await lockAndAssert({ payerS: payer, nodeS: node, jobId, L: D6('10'), provs: [p1], maxLocked: D6('100'), deposit: D6('40') });
      // grow to 20: delta 10, p2 sponsors 5, payer covers 5
      const p2 = await newProvider(D6('5'));
      const bPayer = await funds(payer.address);
      const bSpon = await sponsoredTotal();
      await (await escrow.connect(node).reLock(jobId, T6.address, payer.address, D6('20'), 90000, 0, [p2.c.address])).wait();
      // S_new = 4 + 5 = 9; P_new = 20 - 9 = 11; payer locked += (11 - 6) = 5
      expect((await sponsoredTotal()).sub(bSpon)).to.equal(D6('5'));
      expect(bPayer.available.sub((await funds(payer.address)).available)).to.equal(D6('5'));
      const au = await authOf(payer.address, node.address);
      expect(au.currentLockedAmount).to.equal(D6('11'));
      const sp = await escrow.getSponsorship(node.address, payer.address, jobId);
      expect(sp.total).to.equal(D6('9'));
      await assertSolvent();
      // claim full 20
      const contrib = [p1.sub, p2.sub]; // 4,5 in record order (p1 then p2)
      await claimAndAssert({ payerS: payer, nodeS: node, jobId, L: D6('20'), C: D6('20'), provs: [p1, p2], contrib, S: D6('9'), P: D6('11') });
    });

    it('reLock GROW merges a REPEAT provider by address (no duplicate slot)', async function () {
      await setFee(ethers.utils.parseEther('0'));
      const jobId = jobSeq++;
      const p1 = await newProvider(D6('4'), D6('1000')); // budget covers both grants
      await lockAndAssert({ payerS: payer, nodeS: node, jobId, L: D6('10'), provs: [p1], maxLocked: D6('100'), deposit: D6('40') });
      // grow to 16 with SAME provider: delta 6, p1 grants min(4,6)=4 more -> merged into its slot
      await (await escrow.connect(node).reLock(jobId, T6.address, payer.address, D6('16'), 90000, 0, [p1.c.address])).wait();
      const sp = await escrow.getSponsorship(node.address, payer.address, jobId);
      expect(sp.total).to.equal(D6('8'));
      expect(sp.providers.length).to.equal(1); // merged, not appended
      expect(sp.amounts[0]).to.equal(D6('8'));
      await assertSolvent();
    });

    // ---- lock -> reLock(shrink) -> claim; incl. P_old==0 and dust ----
    it('reLock SHRINK fully-sponsored (P_old==0): refunds sponsors list-order, dust on sponsored side', async function () {
      await setFee(ethers.utils.parseEther('0'));
      const jobId = jobSeq++;
      const p1 = await newProvider(D6('5'));
      const p2 = await newProvider(D6('5'));
      const st = await lockAndAssert({ payerS: payer2, nodeS: node2, jobId, L: D6('10'), provs: [p1, p2], maxLocked: D6('0'), deposit: D6('0') });
      expect(st.S).to.equal(D6('10'));
      const b1 = await T6.balanceOf(p1.c.address);
      const b2 = await T6.balanceOf(p2.c.address);
      // shrink to 7: P_old 0 -> P_new 0, S_new 7, d = 3 refunded LIST-ORDER (front first):
      // p1 (index 0) absorbs the whole 3, p2 untouched
      await (await escrow.connect(node2).reLock(jobId, T6.address, payer2.address, D6('7'), 90000, 0, [])).wait();
      expect(await sponsoredTotal()).to.equal(D6('7'));
      expect((await T6.balanceOf(p1.c.address)).sub(b1)).to.equal(D6('3'));
      expect((await T6.balanceOf(p2.c.address)).sub(b2)).to.equal(0);
      const sp = await escrow.getSponsorship(node2.address, payer2.address, jobId);
      expect(sp.total).to.equal(D6('7'));
      await assertSolvent();
    });

    it('reLock EXPIRY-ONLY leaves S/P untouched', async function () {
      await setFee(ethers.utils.parseEther('0'));
      const jobId = jobSeq++;
      const p1 = await newProvider(D6('4'));
      const st = await lockAndAssert({ payerS: payer, nodeS: node, jobId, L: D6('10'), provs: [p1], maxLocked: D6('100'), deposit: D6('20') });
      const bSpon = await sponsoredTotal();
      const bPayer = await funds(payer.address);
      await (await escrow.connect(node).reLock(jobId, T6.address, payer.address, D6('10'), 95000, 0, [])).wait();
      expect(await sponsoredTotal()).to.equal(bSpon);
      expect((await funds(payer.address)).locked).to.equal(bPayer.locked);
      const sp = await escrow.getSponsorship(node.address, payer.address, jobId);
      expect(sp.total).to.equal(st.S);
      await assertSolvent();
    });

    // ---- lock -> reLock -> expired ----
    it('lock->reLock(grow)->expired refunds reflect post-reLock S/P', async function () {
      await setFee(ethers.utils.parseEther('0.1'));
      const jobId = jobSeq++;
      const p1 = await newProvider(D6('4'));
      await lockAndAssert({ payerS: payer, nodeS: node, jobId, L: D6('10'), provs: [p1], maxLocked: D6('100'), deposit: D6('40'), expiry: 200 });
      const p2 = await newProvider(D6('5'));
      await (await escrow.connect(node).reLock(jobId, T6.address, payer.address, D6('20'), 200, 0, [p2.c.address])).wait();
      // post-reLock: S=9 (p1 4, p2 5), P=11
      const bPayer = await funds(payer.address);
      const b1 = await T6.balanceOf(p1.c.address);
      const b2 = await T6.balanceOf(p2.c.address);
      await fastForward(400);
      await (await escrow.connect(outsider).cancelExpiredLock(jobId, T6.address, payer.address, node.address)).wait();
      expect((await funds(payer.address)).available.sub(bPayer.available)).to.equal(D6('11'));
      expect((await T6.balanceOf(p1.c.address)).sub(b1)).to.equal(D6('4'));
      expect((await T6.balanceOf(p2.c.address)).sub(b2)).to.equal(D6('5'));
      expect(await sponsoredTotal()).to.equal(0);
      await assertSolvent();
    });

    // ---- audit: reLock-shrink multi-provider list-order [1,1,98] shrink S:100->99 ----
    it('audit: shrink [1,1,98] S:100->99 - no over-refund, sum refunds == d', async function () {
      await setFee(ethers.utils.parseEther('0'));
      const jobId = jobSeq++;
      const p1 = await newProvider(D6('1'));
      const p2 = await newProvider(D6('1'));
      const p3 = await newProvider(D6('98'));
      const st = await lockAndAssert({ payerS: payer2, nodeS: node2, jobId, L: D6('100'), provs: [p1, p2, p3], maxLocked: D6('0'), deposit: D6('0') });
      expect(st.S).to.equal(D6('100'));
      const b1 = await T6.balanceOf(p1.c.address);
      const b3 = await T6.balanceOf(p3.c.address);
      // shrink to 99: d = 1 -> list order refunds p1 its 1 first (no over-assign to p3)
      await (await escrow.connect(node2).reLock(jobId, T6.address, payer2.address, D6('99'), 90000, 0, [])).wait();
      expect((await T6.balanceOf(p1.c.address)).sub(b1)).to.equal(D6('1')); // p1 refunded its whole 1
      expect((await T6.balanceOf(p3.c.address)).sub(b3)).to.equal(0);       // p3 untouched (no underflow)
      expect(await sponsoredTotal()).to.equal(D6('99'));
      await assertSolvent();
    });

    // ---- stale-key reuse rejected ----
    it('stale sponsorship key reuse is rejected ("JobId already exists")', async function () {
      await setFee(ethers.utils.parseEther('0'));
      const jobId = jobSeq++;
      const p1 = await newProvider(D6('5'));
      // create a lock, then try to create the SAME (node,payer,jobId) again while it still exists
      await lockAndAssert({ payerS: payer, nodeS: node, jobId, L: D6('10'), provs: [p1], maxLocked: D6('100'), deposit: D6('20') });
      await expect(
        escrow.connect(node).createLock(jobId, T6.address, payer.address, D6('10'), 100000, 0, [p1.c.address])
      ).to.be.revertedWith('JobId already exists');
    });

    // ---- adversarial providers at lock: never brick ----
    it('reverting / short-return / skip-approval providers at lock contribute 0, lock still succeeds', async function () {
      await setFee(ethers.utils.parseEther('0'));
      const jobId = jobSeq++;
      const good = await newProvider(D6('3'));
      const rev = await newProvider(D6('3')); await rev.c.setRevertOnLock(true);
      const short = await newProvider(D6('3')); await short.c.setShortReturnOnLock(true);
      const noappr = await newProvider(D6('3')); await noappr.c.setSkipApprovalOnLock(true);
      await depositFn(payer, D6('10'));
      await authorizeFn(payer, node.address, D6('100'));
      await (await escrow.connect(node).createLock(jobId, T6.address, payer.address, D6('10'), 100000, 0,
        [rev.c.address, short.c.address, noappr.c.address, good.c.address])).wait();
      // only `good` contributed 3; payer funds 7
      expect(await sponsoredTotal()).to.equal(D6('3'));
      expect((await funds(payer.address)).locked).to.equal(D6('7'));
      const sp = await escrow.getSponsorship(node.address, payer.address, jobId);
      expect(sp.total).to.equal(D6('3'));
      await assertSolvent();
    });

    // ---- blacklist token on refund-push -> reclaimable fallback + sweepReclaimable (CEI) ----
    it('refund push to a blacklisted provider falls back to reclaimable; sweepReclaimable works', async function () {
      // dedicated blacklist token so we don't disturb T6 solvency bookkeeping
      const Blk = await ethers.getContractFactory('MockBlacklistToken');
      const blk = await Blk.deploy();
      await blk.deployed();
      if (KIND === 'enterprise') await feeCollector.setRate(ethers.utils.parseEther('0.1'));
      else await router.connect(deployer).updateOPCFee(ethers.utils.parseEther('0.1'), ethers.utils.parseEther('0.1'), 0, 0);
      // provider on the blacklist token
      const prov = await ProviderF.deploy(escrow.address, blk.address);
      await prov.deployed();
      await prov.configure(D6('6'), 0, D6('1000'));
      await blk.transfer(prov.address, D6('1000'));
      // payer deposit + auth on blk
      await blk.transfer(payer.address, D6('100'));
      await blk.connect(payer).approve(escrow.address, MAXU);
      await escrow.connect(payer).deposit(blk.address, D6('10'));
      await escrow.connect(payer).authorize(blk.address, node.address, D6('100'), 1000000, 1000, 0);
      const jobId = jobSeq++;
      await (await escrow.connect(node).createLock(jobId, blk.address, payer.address, D6('10'), 100000, 0, [prov.address])).wait();
      // S = 6. Now blacklist the provider so the refund push fails.
      await blk.setBlacklisted(prov.address, true);
      const provBalBefore = await blk.balanceOf(prov.address);
      // partial claim 4 -> fromSponsored 4, refund 2 pushed to provider -> FAILS -> reclaimable 2
      const rc = await (await escrow.connect(node).claimLock(jobId, blk.address, payer.address, D6('4'), '0x', 0, [])).wait();
      const ev = getEventFromTx(rc, 'SponsorRefunded');
      assert(ev, 'SponsorRefunded event');
      expect(ev.args.reclaimable).to.equal(true);
      expect(await escrow.getReclaimable(prov.address, blk.address)).to.equal(D6('2'));
      expect(await blk.balanceOf(prov.address)).to.equal(provBalBefore); // push failed, nothing moved
      // un-blacklist and sweep (CEI: bucket zeroed before transfer)
      await blk.setBlacklisted(prov.address, false);
      // provider sweeps by calling escrow.sweepReclaimable AS the provider (it is a contract -> impersonate).
      // setBalance (not sendTransaction) because the mock has no receive()/fallback to accept ETH.
      await ethers.provider.send('hardhat_impersonateAccount', [prov.address]);
      await ethers.provider.send('hardhat_setBalance', [prov.address, '0x56BC75E2D63100000']); // 100 ETH
      const provSigner = await ethers.getSigner(prov.address);
      await escrow.connect(provSigner).sweepReclaimable(blk.address);
      await ethers.provider.send('hardhat_stopImpersonatingAccount', [prov.address]);
      expect(await escrow.getReclaimable(prov.address, blk.address)).to.equal(0);
      expect(await blk.balanceOf(prov.address)).to.equal(provBalBefore.add(D6('2')));
      // sweep with empty bucket reverts
      await expect(escrow.connect(node).sweepReclaimable(blk.address)).to.be.revertedWith('Invalid amount');
    });

    // ---- wildcard cancelExpiredLocks refunds the right sponsors ----
    it('wildcard cancelExpiredLocks refunds each matched lock own sponsors', async function () {
      await setFee(ethers.utils.parseEther('0'));
      const jA = jobSeq++, jB = jobSeq++;
      const pA = await newProvider(D6('4'));
      const pB = await newProvider(D6('7'));
      await lockAndAssert({ payerS: payer, nodeS: node, jobId: jA, L: D6('10'), provs: [pA], maxLocked: D6('1000'), deposit: D6('40'), expiry: 60 });
      await lockAndAssert({ payerS: payer, nodeS: node, jobId: jB, L: D6('10'), provs: [pB], maxLocked: D6('1000'), deposit: D6('40'), expiry: 60 });
      const bA = await T6.balanceOf(pA.c.address);
      const bB = await T6.balanceOf(pB.c.address);
      await fastForward(120);
      // wildcard: jobId 0 (any), token any, payer any, payee=node
      await (await escrow.connect(outsider).cancelExpiredLock(0, ZERO, ZERO, node.address)).wait();
      expect((await T6.balanceOf(pA.c.address)).sub(bA)).to.equal(D6('4'));
      expect((await T6.balanceOf(pB.c.address)).sub(bB)).to.equal(D6('7'));
      expect(await sponsoredTotal()).to.equal(0);
      await assertSolvent();
    });

    // ---- capability discovery + version + escrowKind ----
    it('supportsInterface / escrowKind / version', async function () {
      const coreId = await erc165Id('IEscrowCore');
      const subId = await erc165Id('IEscrowLockSubsidy');
      expect(await escrow.supportsInterface(coreId)).to.equal(true);
      expect(await escrow.supportsInterface(subId)).to.equal(true);
      expect(await escrow.supportsInterface('0x01ffc9a7')).to.equal(true); // IERC165
      expect(await escrow.supportsInterface('0xdeadbeef')).to.equal(false);
      expect(await escrow.escrowKind()).to.equal(KIND === 'community' ? 0 : 1);
      expect(await escrow.version()).to.equal(2);
    });
  });
}

// =================================================================================================
// Authorization expiry (both escrows).
// =================================================================================================
for (const KIND of ['community', 'enterprise']) {
  describe(`EscrowSponsorship auth-expiry [${KIND}]`, function () {
    const D6 = (n) => ethers.utils.parseUnits(n, 6);
    let deployer, node, payer, feeColl;
    let escrow, router, feeCollector, T6;

    before(async function () {
      const s = await ethers.getSigners();
      deployer = s[0]; node = s[1]; payer = s[4]; feeColl = s[8];
      const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
      T6 = await MockErc20Decimals.deploy('USDC', 'USDC', 6);
      await T6.deployed();
      if (KIND === 'community') {
        const Router = await ethers.getContractFactory('FactoryRouter');
        router = await Router.deploy(deployer.address, T6.address, '0x000000000000000000000000000000000000dead', feeColl.address, []);
        await router.deployed();
        await router.connect(deployer).updateOPCFee(ethers.utils.parseEther('0.1'), ethers.utils.parseEther('0.1'), 0, 0);
        escrow = await deployEscrow('Escrow', [router.address, feeColl.address], deployer);
      } else {
        const FeeCollF = await ethers.getContractFactory('MockEnterpriseFeeCollector');
        feeCollector = await FeeCollF.deploy();
        await feeCollector.deployed();
        await feeCollector.setRate(ethers.utils.parseEther('0.1'));
        escrow = await deployEscrow('EnterpriseEscrow', [feeCollector.address], deployer);
      }
      await T6.connect(deployer).transfer(payer.address, D6('1000000'));
      await T6.connect(payer).approve(escrow.address, MAXU);
      await escrow.connect(payer).deposit(T6.address, D6('1000'));
    });

    let __snap;
    beforeEach(async function () { __snap = await ethers.provider.send('evm_snapshot', []); });
    afterEach(async function () { await ethers.provider.send('evm_revert', [__snap]); });

    it('expiry 0 == indefinite (unchanged)', async function () {
      await escrow.connect(payer).authorize(T6.address, node.address, D6('100'), 1000000, 100, 0);
      await escrow.connect(node).createLock(9001, T6.address, payer.address, D6('10'), 500, 0, []);
      const lk = (await escrow.getLocks(T6.address, payer.address, node.address)).find(l => l.jobId.eq(9001));
      expect(lk.amount).to.equal(D6('10'));
    });

    it('createLock succeeds before, reverts "Auth expired" after block.timestamp > expiry', async function () {
      const exp = (await nowTs()) + 1000;
      await escrow.connect(payer).authorize(T6.address, node.address, D6('100'), 1000000, 100, exp);
      await escrow.connect(node).createLock(9002, T6.address, payer.address, D6('10'), 50, 0, []); // ok, well within
      await fastForward(1200); // now past the auth expiry
      await expect(
        escrow.connect(node).createLock(9003, T6.address, payer.address, D6('10'), 50, 0, [])
      ).to.be.revertedWith('Auth expired');
    });

    it('a lock whose END exceeds the auth expiry reverts "Auth expired"', async function () {
      const exp = (await nowTs()) + 100;
      await escrow.connect(payer).authorize(T6.address, node.address, D6('100'), 1000000, 100000, exp);
      // expiry (relative) 500 -> end = now+500 > exp(now+100)
      await expect(
        escrow.connect(node).createLock(9004, T6.address, payer.address, D6('10'), 500, 0, [])
      ).to.be.revertedWith('Auth expired');
    });

    it('a lock created while valid stays claimable AND cancellable after the auth is revoked', async function () {
      // a lock can never OUTLIVE its auth (end <= expiryTimestamp is enforced), so to exercise
      // "still claimable after the auth expires" we REVOKE the auth (past timestamp) while the lock
      // is still active: claim/cancel must not re-check auth expiry.
      const exp = (await nowTs()) + 100000;
      await escrow.connect(payer).authorize(T6.address, node.address, D6('100'), 1000000, 100000, exp);
      await escrow.connect(node).createLock(9005, T6.address, payer.address, D6('10'), 5000, 0, []); // active
      await escrow.connect(node).createLock(9006, T6.address, payer.address, D6('10'), 50, 0, []);   // soon-expired
      // revoke: re-authorize with a PAST expiry -> auth can no longer create/extend, existing locks untouched
      await escrow.connect(payer).authorize(T6.address, node.address, D6('100'), 1000000, 100000, 1);
      await expect(
        escrow.connect(node).createLock(9100, T6.address, payer.address, D6('10'), 50, 0, [])
      ).to.be.revertedWith('Auth expired');
      // 9005 still active -> claim succeeds despite the revoked auth, node is paid
      const bNode = await escrow.getUserFunds(node.address, T6.address);
      await escrow.connect(node).claimLock(9005, T6.address, payer.address, D6('10'), '0x', 0, []);
      expect((await escrow.getUserFunds(node.address, T6.address)).available.sub(bNode.available)).to.be.gt(0);
      // 9006 expires -> cancellable despite the revoked auth (funds never stuck)
      await fastForward(100);
      await escrow.connect(node).cancelExpiredLock(9006, T6.address, payer.address, node.address);
      expect((await escrow.getLocks(T6.address, payer.address, node.address)).find(l => l.jobId.eq(9006))).to.be.undefined;
    });

    it('re-authorize renews the expiry; a past timestamp is an immediate revoke', async function () {
      // past timestamp -> instant revoke of NEW locks
      await escrow.connect(payer).authorize(T6.address, node.address, D6('100'), 1000000, 100, 1);
      await expect(
        escrow.connect(node).createLock(9007, T6.address, payer.address, D6('10'), 50, 0, [])
      ).to.be.revertedWith('Auth expired');
      // renew with a future expiry -> works again
      const exp = (await nowTs()) + 1000;
      await escrow.connect(payer).authorize(T6.address, node.address, D6('100'), 1000000, 100, exp);
      await escrow.connect(node).createLock(9008, T6.address, payer.address, D6('10'), 50, 0, []);
      const lk = (await escrow.getLocks(T6.address, payer.address, node.address)).find(l => l.jobId.eq(9008));
      expect(lk.amount).to.equal(D6('10'));
    });
  });
}

// =================================================================================================
// Dual-mode quoting + window-crossing reservation round-trip, via the REAL OPF provider.
// =================================================================================================
describe('EscrowSponsorship dual-mode + window reservation (OPF, community escrow)', function () {
  const U = (n) => ethers.utils.parseUnits(n, 6);
  let deployer, node, payer, feeColl;
  let escrow, router, usdc, opf, userList, nodeList;

  before(async function () {
    const s = await ethers.getSigners();
    deployer = s[0]; node = s[1]; payer = s[4]; feeColl = s[8];
    const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');
    const MockAccessList = await ethers.getContractFactory('MockAccessList');
    const OPF = await ethers.getContractFactory('OPFSubsidyProvider');
    const Router = await ethers.getContractFactory('FactoryRouter');
    usdc = await MockErc20Decimals.deploy('USDC', 'USDC', 6); await usdc.deployed();
    userList = await MockAccessList.deploy(); await userList.deployed();
    nodeList = await MockAccessList.deploy(); await nodeList.deployed();
    opf = await OPF.connect(deployer).deploy(); await opf.deployed();
    router = await Router.deploy(deployer.address, usdc.address, '0x000000000000000000000000000000000000dead', feeColl.address, []);
    await router.deployed();
    await router.connect(deployer).updateOPCFee(0, 0, 0, 0); // zero fee for clean numbers
    escrow = await deployEscrow('Escrow', [router.address, feeColl.address], deployer);

    await usdc.transfer(payer.address, U('1000000'));
    await usdc.transfer(opf.address, U('100000'));
    await opf.connect(deployer).setUserAccessList(userList.address);
    await opf.connect(deployer).setNodeAccessList(nodeList.address);
    // generous caps so a prefunded grant is only bounded by sponsorNeeded / balance
    await opf.connect(deployer).setTokenLimits(usdc.address, 10000, U('1000'), 0, U('100000'), true);
    await opf.connect(deployer).setAllowedJobTypes([7]);
    await userList.setMember(payer.address, true);
    await nodeList.setMember(node.address, true);
    await opf.connect(deployer).setAuthorizedEscrow(escrow.address, true);
    await opf.connect(deployer).setAuthorizedEscrow(deployer.address, true); // so we can callStatic the leg fns
  });

  let __snap;
  beforeEach(async function () { __snap = await ethers.provider.send('evm_snapshot', []); });
  afterEach(async function () { await ethers.provider.send('evm_revert', [__snap]); });

  it('supportsInterface(ISubsidyViewV2/ISubsidyLockProvider) and quoteSubsidyModes match the real grants', async function () {
    const v2 = await erc165Id('ISubsidyViewV2');
    const lockI = await erc165Id('ISubsidyLockProvider');
    expect(await opf.supportsInterface(v2)).to.equal(true);
    expect(await opf.supportsInterface(lockI)).to.equal(true);

    const amount = U('50'), need = U('50'), jobType = 7;
    const modes = await opf.quoteSubsidyModes(node.address, payer.address, jobType, usdc.address, amount, need);
    expect(modes.length).to.equal(2);
    // leg 0 = REIMBURSEMENT, must match callStatic onSubsidyClaim (called as an authorized escrow)
    const claim = await opf.connect(deployer).callStatic.onSubsidyClaim(node.address, payer.address, jobType, usdc.address, amount, need);
    expect(modes[0].subsidy).to.equal(claim.subsidyAmount);
    // leg 1 = PREFUNDED, must match callStatic onSubsidyLock
    const lockId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address', 'address', 'uint256'], [node.address, payer.address, 1]));
    const grant = await opf.connect(deployer).callStatic.onSubsidyLock(lockId, node.address, payer.address, jobType, usdc.address, amount, need);
    expect(modes[1].subsidy).to.equal(grant);
    expect(modes[1].subsidy).to.equal(modes[0].subsidy); // shared budget, equal legs
  });

  it('window-crossing: lock in day D, fast-forward past a day boundary, partial-claim -> used counter == consumed', async function () {
    await usdc.connect(payer).approve(escrow.address, MAXU);
    await escrow.connect(payer).deposit(usdc.address, U('100'));
    await escrow.connect(payer).authorize(usdc.address, node.address, U('1000'), 1000000, 100000, 0);
    const jobId = 7001;
    // long-lived lock so crossing a day boundary does NOT expire it (would route claim into cancel)
    await escrow.connect(node).createLock(jobId, usdc.address, payer.address, U('20'), 300000, 7, [opf.address]);
    // fully sponsored 20 (pct 100%, caps generous); reserved in the CURRENT day
    const lockDayTs = await nowTs();
    expect(await opf.dailyUsedByAt(payer.address, usdc.address, lockDayTs)).to.equal(U('20'));
    // cross exactly one day boundary (+86400 always increments the day index), lock still active
    await fastForward(90000);
    const claimDayTs = await nowTs();
    // partial claim 12 -> fromSponsored 12, refund 8 -> onSubsidyRefund reverses the LOCK day's counter
    await escrow.connect(node).claimLock(jobId, usdc.address, payer.address, U('12'), '0x', 7, []);
    // the lock day's used counter is back to exactly the consumed 12 (not the current day)
    expect(await opf.dailyUsedByAt(payer.address, usdc.address, lockDayTs)).to.equal(U('12'));
    // the claim day's counter was never touched by the refund
    expect(await opf.dailyUsedByAt(payer.address, usdc.address, claimDayTs)).to.equal(0);
  });

  it('node not on the access list gets 0 from the prefunded leg (F3)', async function () {
    // an un-listed node -> onSubsidyLock returns 0 -> fully payer-funded
    const outsiderNode = (await ethers.getSigners())[6];
    await usdc.connect(payer).approve(escrow.address, MAXU);
    await escrow.connect(payer).deposit(usdc.address, U('50'));
    await escrow.connect(payer).authorize(usdc.address, outsiderNode.address, U('1000'), 1000000, 100000, 0);
    const jobId = 7002;
    const bOpf = await usdc.balanceOf(opf.address);
    await escrow.connect(outsiderNode).createLock(jobId, usdc.address, payer.address, U('10'), 100000, 7, [opf.address]);
    expect(await escrow.getSponsoredTotal(usdc.address)).to.equal(0); // nothing sponsored
    expect(await usdc.balanceOf(opf.address)).to.equal(bOpf); // opf pulled nothing
    expect((await escrow.getUserFunds(payer.address, usdc.address)).locked).to.equal(U('10')); // fully payer-funded
  });
});

// =================================================================================================
// Contract size gate: both escrows must be under the EIP-170 24,576-byte limit.
// =================================================================================================
describe('EscrowSponsorship size gate', function () {
  it('Escrow and EnterpriseEscrow deployed bytecode < 24,576 bytes', async function () {
    for (const name of ['Escrow', 'EnterpriseEscrow']) {
      const art = await artifacts.readArtifact(name);
      const size = (art.deployedBytecode.length - 2) / 2; // strip 0x, 2 hex chars/byte
      console.log(`      ${name} deployed size = ${size} bytes (limit 24576)`);
      expect(size, `${name} exceeds EIP-170`).to.be.lt(24576);
    }
  });
});
