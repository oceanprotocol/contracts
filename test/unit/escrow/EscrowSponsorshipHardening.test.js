const { assert, expect } = require('chai');
const { ethers } = require('hardhat');
const { getEventFromTx } = require('../../helpers/utils');
const { deployEscrow } = require('../../helpers/escrow');

// =================================================================================================
// Test-hardening pass for the lock-time sponsorship feature: the QA-audit coverage gaps that the
// matrix in EscrowSponsorship.test.js did not reach. Each case asserts exact ledger values and
// (where a ledger changes) solvency. Run against BOTH escrow flavours via a shared factory unless a
// case is enterprise-specific (the enterprise fee gate).
// =================================================================================================

const ZERO = ethers.constants.AddressZero;
const MAXU = ethers.constants.MaxUint256;
const BN = (n) => ethers.BigNumber.from(n);
const BN0 = BN(0);

const fastForward = async (s) => {
  await ethers.provider.send('evm_increaseTime', [s]);
  await ethers.provider.send('evm_mine');
};

for (const KIND of ['community', 'enterprise']) {
  describe(`EscrowSponsorship hardening [${KIND}]`, function () {
    const D6 = (n) => ethers.utils.parseUnits(n, 6);
    const P1 = ethers.utils.parseEther('1');

    let deployer, node, node2, payer, payer2, feeColl, outsider;
    let escrow, router, feeCollector, T6, ProviderF;
    let opcFee;
    let jobSeq = 200;
    const tracked = new Set();
    const trackedProviders = new Set();

    async function setFee(rate) {
      opcFee = BN(rate);
      if (KIND === 'community') await router.connect(deployer).updateOPCFee(rate, rate, 0, 0);
      else await feeCollector.setRate(rate);
    }

    async function depositFn(who, amount) {
      await T6.connect(who).approve(escrow.address, MAXU);
      await escrow.connect(who).deposit(T6.address, amount);
      tracked.add(who.address);
    }
    async function authorizeFn(payerS, nodeAddr, maxLocked) {
      await escrow.connect(payerS).authorize(T6.address, nodeAddr, maxLocked, 1000000, 1000, 0);
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
    const sponsoredTotal = () => escrow.getSponsoredTotal(T6.address);
    const reclaimable = (addr) => escrow.getReclaimable(addr, T6.address);
    const funds = (addr) => escrow.getUserFunds(addr, T6.address);

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
      const Tok = await ethers.getContractFactory('MockERC20Decimals');
      ProviderF = await ethers.getContractFactory('MockSubsidyProvider');
      T6 = await Tok.deploy('USDC', 'USDC', 6); await T6.deployed();
      if (KIND === 'community') {
        const Router = await ethers.getContractFactory('FactoryRouter');
        router = await Router.deploy(deployer.address, T6.address, '0x000000000000000000000000000000000000dead', feeColl.address, []);
        await router.deployed();
        escrow = await deployEscrow('Escrow', [router.address, feeColl.address], deployer);
      } else {
        const FeeCollF = await ethers.getContractFactory('MockEnterpriseFeeCollector');
        feeCollector = await FeeCollF.deploy(); await feeCollector.deployed();
        escrow = await deployEscrow('EnterpriseEscrow', [feeCollector.address], deployer);
      }
      await setFee(ethers.utils.parseEther('0.1'));
      await T6.connect(deployer).transfer(payer.address, D6('4000000'));
      await T6.connect(deployer).transfer(payer2.address, D6('4000000'));
      tracked.add(payer.address); tracked.add(payer2.address);
      tracked.add(node.address); tracked.add(node2.address);
    });

    let __snap;
    beforeEach(async function () { __snap = await ethers.provider.send('evm_snapshot', []); });
    afterEach(async function () { await ethers.provider.send('evm_revert', [__snap]); });

    // helper: create a sponsored lock, return {S,P}
    async function mkLock({ payerS, nodeS, jobId, L, provs, maxLocked, deposit, expiry }) {
      if (deposit !== undefined) await depositFn(payerS, deposit);
      await authorizeFn(payerS, nodeS.address, maxLocked);
      await (await escrow.connect(nodeS).createLock(jobId, T6.address, payerS.address, L, expiry || 100000, 0, provs.map(p => p.c.address))).wait();
    }

    // =============================================================================================
    // #3 revertOnRefund=true: escrow swallows the notify revert; claim AND cancel still settle.
    // =============================================================================================
    it('revertOnRefund provider: PARTIAL claim still settles (ledger + solvency)', async function () {
      await setFee(ethers.utils.parseEther('0.1'));
      const jobId = jobSeq++;
      const p1 = await newProvider(D6('6'));
      await p1.c.setRevertOnRefund(true);
      await mkLock({ payerS: payer, nodeS: node, jobId, L: D6('10'), provs: [p1], maxLocked: D6('100'), deposit: D6('10') });
      const bProv = await T6.balanceOf(p1.c.address);
      // partial claim 4 -> fromSponsored 4, refund 2 pushed (succeeds), notify reverts but is swallowed
      const rc = await (await escrow.connect(node).claimLock(jobId, T6.address, payer.address, D6('4'), '0x', 0, [])).wait();
      assert(getEventFromTx(rc, 'Claimed'), 'Claimed');
      // provider got its unused 2 back despite reverting in onSubsidyRefund
      expect((await T6.balanceOf(p1.c.address)).sub(bProv)).to.equal(D6('2'));
      expect(await reclaimable(p1.c.address)).to.equal(0); // push succeeded -> NOT reclaimable
      const sp = await escrow.getSponsorship(node.address, payer.address, jobId);
      expect(sp.total).to.equal(0);
      await assertSolvent();
    });

    it('revertOnRefund provider: CANCEL (expiry) still settles (ledger + solvency)', async function () {
      await setFee(ethers.utils.parseEther('0.1'));
      const jobId = jobSeq++;
      const p1 = await newProvider(D6('6'));
      await p1.c.setRevertOnRefund(true);
      await mkLock({ payerS: payer, nodeS: node, jobId, L: D6('10'), provs: [p1], maxLocked: D6('100'), deposit: D6('10'), expiry: 50 });
      const bProv = await T6.balanceOf(p1.c.address);
      const bPayer = await funds(payer.address);
      await fastForward(100);
      const rc = await (await escrow.connect(outsider).cancelExpiredLock(jobId, T6.address, payer.address, node.address)).wait();
      assert(getEventFromTx(rc, 'Canceled'), 'Canceled');
      expect((await T6.balanceOf(p1.c.address)).sub(bProv)).to.equal(D6('6')); // full S back
      expect((await funds(payer.address)).available.sub(bPayer.available)).to.equal(D6('4')); // P back
      expect(await sponsoredTotal()).to.equal(0);
      await assertSolvent();
    });

    // =============================================================================================
    // #2 batched cancel with a BAD provider on one lock: the other locks still refund & solvency holds.
    // =============================================================================================
    it('cancelExpiredLocks batch: a revertOnRefund provider on one lock does NOT block the others', async function () {
      await setFee(ethers.utils.parseEther('0'));
      const jA = jobSeq++, jB = jobSeq++, jC = jobSeq++;
      const bad = await newProvider(D6('5')); await bad.c.setRevertOnRefund(true);
      const good1 = await newProvider(D6('7'));
      const good2 = await newProvider(D6('3'));
      await mkLock({ payerS: payer, nodeS: node, jobId: jA, L: D6('10'), provs: [bad], maxLocked: D6('1000'), deposit: D6('60'), expiry: 60 });
      await mkLock({ payerS: payer, nodeS: node, jobId: jB, L: D6('10'), provs: [good1], maxLocked: D6('1000'), deposit: D6('60'), expiry: 60 });
      await mkLock({ payerS: payer, nodeS: node, jobId: jC, L: D6('10'), provs: [good2], maxLocked: D6('1000'), deposit: D6('60'), expiry: 60 });
      const bBad = await T6.balanceOf(bad.c.address);
      const bG1 = await T6.balanceOf(good1.c.address);
      const bG2 = await T6.balanceOf(good2.c.address);
      await fastForward(120);
      // one batch call sweeping all three; the bad provider's reverting notify must not brick it
      await (await escrow.connect(outsider).cancelExpiredLocks(
        [jA, jB, jC], [T6.address, T6.address, T6.address],
        [payer.address, payer.address, payer.address], [node.address, node.address, node.address])).wait();
      expect((await T6.balanceOf(good1.c.address)).sub(bG1)).to.equal(D6('7')); // good ones refunded
      expect((await T6.balanceOf(good2.c.address)).sub(bG2)).to.equal(D6('3'));
      expect((await T6.balanceOf(bad.c.address)).sub(bBad)).to.equal(D6('5'));  // push ok, notify swallowed
      expect(await sponsoredTotal()).to.equal(0);
      for (const j of [jA, jB, jC]) {
        expect((await escrow.getSponsorship(node.address, payer.address, j)).total).to.equal(0);
      }
      await assertSolvent();
    });

    // =============================================================================================
    // #4 Sponsored bundleJobs: a sponsored newLock and a sponsored reLock-grow in one bundle.
    // =============================================================================================
    it('bundleJobs: sponsored newLock + sponsored reLock-grow settle together', async function () {
      await setFee(ethers.utils.parseEther('0'));
      const jExisting = jobSeq++, jNew = jobSeq++;
      const pOld = await newProvider(D6('4'));
      // pre-create the lock to be grown in the bundle
      await mkLock({ payerS: payer, nodeS: node, jobId: jExisting, L: D6('10'), provs: [pOld], maxLocked: D6('1000'), deposit: D6('100') });
      const pNew = await newProvider(D6('6'));   // sponsors the new lock
      const pGrow = await newProvider(D6('5'));  // sponsors the grow delta
      const mkData = (jobId, amount, provs) => ({
        jobId, token: T6.address, payer: payer.address, amount, expiry: 90000, jobType: 0,
        subsidyProviders: provs.map(p => p.c.address),
      });
      const bSpon = await sponsoredTotal();
      await (await escrow.connect(node).bundleJobs(
        [], [],
        [mkData(jNew, D6('10'), [pNew])],              // newLock: S=6
        [mkData(jExisting, D6('20'), [pGrow])],        // reLock grow 10->20: delta 10, pGrow sponsors 5
      )).wait();
      // new lock sponsored 6
      const spNew = await escrow.getSponsorship(node.address, payer.address, jNew);
      expect(spNew.total).to.equal(D6('6'));
      // grown lock: S_old 4 + S_add 5 = 9
      const spGrow = await escrow.getSponsorship(node.address, payer.address, jExisting);
      expect(spGrow.total).to.equal(D6('9'));
      // sponsoredTotal rose by 6 (new) + 5 (grow) = 11
      expect((await sponsoredTotal()).sub(bSpon)).to.equal(D6('11'));
      await assertSolvent();
    });

    // =============================================================================================
    // #7 reLock-grow with an underfunded payer -> clean revert.
    // =============================================================================================
    it('reLock-grow underfunded payer reverts "Payer does not have enough funds"', async function () {
      await setFee(ethers.utils.parseEther('0'));
      const jobId = jobSeq++;
      const p1 = await newProvider(D6('4'));
      // deposit ONLY enough for the initial lock's payer portion (6); grow needs more payer funds
      await mkLock({ payerS: payer, nodeS: node, jobId, L: D6('10'), provs: [p1], maxLocked: D6('1000'), deposit: D6('6') });
      // grow to 100: delta 90, provider p1 adds at most 0 more (sub 4 already fully used by cap? it re-quotes delta)
      // p1 re-quote on delta 90 -> min(4, 90)=4 more; payerAdd = 90-4 = 86, but payer.available is 0
      await expect(
        escrow.connect(node).reLock(jobId, T6.address, payer.address, D6('100'), 90000, 0, [p1.c.address])
      ).to.be.revertedWith('Payer does not have enough funds');
    });

    // =============================================================================================
    // #8 reLock-shrink with P_old>0 and a NON-dividing ratio: payer takes the floor, sponsored absorbs dust.
    // =============================================================================================
    it('reLock-shrink non-dividing ratio: payer gets floor(P_old*L_new/L_old), sponsored absorbs the dust', async function () {
      await setFee(ethers.utils.parseEther('0'));
      const jobId = jobSeq++;
      // L_old=3, S_old=1 (p1), P_old=2. Shrink to L_new=1.
      // P_new = floor(2e6 * 1e6 / 3e6) = 666666 ; S_new = 1e6 - 666666 = 333334
      // payerRefund = 2e6 - 666666 = 1333334 ; d = S_old - S_new = 1e6 - 333334 = 666666
      const p1 = await newProvider(D6('1'));
      await mkLock({ payerS: payer, nodeS: node, jobId, L: D6('3'), provs: [p1], maxLocked: D6('1000'), deposit: D6('50') });
      const bPayer = await funds(payer.address);
      const bProv = await T6.balanceOf(p1.c.address);
      const bSpon = await sponsoredTotal();
      await (await escrow.connect(node).reLock(jobId, T6.address, payer.address, D6('1'), 90000, 0, [])).wait();
      expect((await funds(payer.address)).available.sub(bPayer.available)).to.equal(BN('1333334'));   // payer floor refund
      expect(bPayer.locked.sub((await funds(payer.address)).locked)).to.equal(BN('1333334'));
      expect((await T6.balanceOf(p1.c.address)).sub(bProv)).to.equal(BN('666666'));                   // sponsored dust
      expect(bSpon.sub(await sponsoredTotal())).to.equal(BN('666666'));
      const sp = await escrow.getSponsorship(node.address, payer.address, jobId);
      expect(sp.total).to.equal(BN('333334')); // S_new = L_new - P_new, dust on the sponsored side
      await assertSolvent();
    });

    // =============================================================================================
    // #6 Enterprise fee gate on a sponsored / fully-sponsored (P==0) lock: gate is on GROSS L.
    // =============================================================================================
    if (KIND === 'enterprise') {
      it('enterprise fee gate on a FULLY-sponsored lock: token disallowed => revert even when P==0', async function () {
        await feeCollector.setRate(ethers.utils.parseEther('0.1'));
        await feeCollector.setAllowed(false);
        const jobId = jobSeq++;
        const p1 = await newProvider(D6('10'));
        await authorizeFn(payer2, node2.address, D6('0')); // fully-sponsored, no payer funds
        await expect(
          escrow.connect(node2).createLock(jobId, T6.address, payer2.address, D6('10'), 100000, 0, [p1.c.address])
        ).to.be.revertedWith('This token is not allowed by enterprise fee collector');
        await feeCollector.setAllowed(true);
      });

      it('enterprise fee gate on a fully-sponsored lock: punitive fee vs GROSS L => revert even when P==0', async function () {
        await feeCollector.setAllowed(true);
        await feeCollector.setFee(D6('10')); // fixed fee == gross L -> fee >= amount -> reject
        const jobId = jobSeq++;
        const p1 = await newProvider(D6('10'));
        await authorizeFn(payer2, node2.address, D6('0'));
        await expect(
          escrow.connect(node2).createLock(jobId, T6.address, payer2.address, D6('10'), 100000, 0, [p1.c.address])
        ).to.be.revertedWith('Amount must be higher than enterprise fee');
      });

      it('enterprise fee gate: allowed token + reasonable fee on a sponsored lock => passes', async function () {
        await feeCollector.setAllowed(true);
        await feeCollector.setRate(ethers.utils.parseEther('0.1')); // 10% of gross L < L
        const jobId = jobSeq++;
        const p1 = await newProvider(D6('6'));
        await authorizeFn(payer2, node2.address, D6('100'));
        await depositFn(payer2, D6('10'));
        await (await escrow.connect(node2).createLock(jobId, T6.address, payer2.address, D6('10'), 100000, 0, [p1.c.address])).wait();
        expect((await escrow.getSponsorship(node2.address, payer2.address, jobId)).total).to.equal(D6('6'));
        await assertSolvent();
      });
    }
  });
}

// =================================================================================================
// #5 Fee-on-transfer / under-delivering token: reject-partial at LOCK, push-short -> reclaimable at REFUND.
// A standalone suite with its own token so the escrow's two under-delivery branches (ok==true but
// short) are isolated from the T6 solvency bookkeeping.
// =================================================================================================
for (const KIND of ['community', 'enterprise']) {
  describe(`EscrowSponsorship under-delivering token [${KIND}]`, function () {
    const D6 = (n) => ethers.utils.parseUnits(n, 6);
    let deployer, node, payer, feeColl;
    let escrow, router, feeCollector, short, ProviderF;
    let jobSeq = 300;

    before(async function () {
      const s = await ethers.getSigners();
      deployer = s[0]; node = s[1]; payer = s[4]; feeColl = s[8];
      ProviderF = await ethers.getContractFactory('MockSubsidyProvider');
      const Short = await ethers.getContractFactory('MockERC20ShortTransfer');
      short = await Short.deploy(); await short.deployed();
      if (KIND === 'community') {
        const Router = await ethers.getContractFactory('FactoryRouter');
        router = await Router.deploy(deployer.address, short.address, '0x000000000000000000000000000000000000dead', feeColl.address, []);
        await router.deployed();
        await router.connect(deployer).updateOPCFee(0, 0, 0, 0);
        escrow = await deployEscrow('Escrow', [router.address, feeColl.address], deployer);
      } else {
        const FeeCollF = await ethers.getContractFactory('MockEnterpriseFeeCollector');
        feeCollector = await FeeCollF.deploy(); await feeCollector.deployed();
        await feeCollector.setRate(0);
        escrow = await deployEscrow('EnterpriseEscrow', [feeCollector.address], deployer);
      }
      await short.transfer(payer.address, D6('1000'));
    });

    let __snap;
    beforeEach(async function () { __snap = await ethers.provider.send('evm_snapshot', []); });
    afterEach(async function () { await ethers.provider.send('evm_revert', [__snap]); });

    async function provider(sub) {
      const p = await ProviderF.deploy(escrow.address, short.address); await p.deployed();
      await p.configure(sub, 0, D6('1000'));
      await short.transfer(p.address, D6('1000'));
      return p;
    }

    it('LOCK: provider pull under-delivers => reject-partial => that provider contributes 0', async function () {
      const jobId = jobSeq++;
      const p1 = await provider(D6('6'));
      await short.connect(payer).approve(escrow.address, ethers.constants.MaxUint256);
      await escrow.connect(payer).deposit(short.address, D6('10'));
      await escrow.connect(payer).authorize(short.address, node.address, D6('100'), 1000000, 1000, 0);
      // arm the fee: the escrow's transferFrom pull receives < want -> reject-partial
      await short.setFee(true, 1000); // 10% under-delivery
      await (await escrow.connect(node).createLock(jobId, short.address, payer.address, D6('10'), 100000, 0, [p1.address])).wait();
      expect(await escrow.getSponsoredTotal(short.address)).to.equal(0);           // provider contributed 0
      expect((await escrow.getUserFunds(payer.address, short.address)).locked).to.equal(D6('10')); // fully payer-funded
      expect((await escrow.getSponsorship(node.address, payer.address, jobId)).total).to.equal(0);
    });

    it('REFUND: push under-delivers (ok but short) => falls back to providerReclaimable', async function () {
      const jobId = jobSeq++;
      const p1 = await provider(D6('6'));
      await short.connect(payer).approve(escrow.address, ethers.constants.MaxUint256);
      await escrow.connect(payer).deposit(short.address, D6('10'));
      await escrow.connect(payer).authorize(short.address, node.address, D6('100'), 1000000, 1000, 0);
      // lock with the fee DISARMED so the pull delivers full -> S = 6
      await escrow.connect(node).createLock(jobId, short.address, payer.address, D6('10'), 100000, 0, [p1.address]);
      expect(await escrow.getSponsoredTotal(short.address)).to.equal(D6('6'));
      // arm the fee so the refund PUSH under-delivers: escrow balance drops < refund -> reclaimable
      await short.setFee(true, 1000);
      // partial claim 4 -> fromSponsored 4, refund 2 pushed short (ok==true, dropped==false)
      const rc = await (await escrow.connect(node).claimLock(jobId, short.address, payer.address, D6('4'), '0x', 0, [])).wait();
      const ev = getEventFromTx(rc, 'SponsorRefunded');
      assert(ev, 'SponsorRefunded');
      expect(ev.args.reclaimable).to.equal(true); // short push -> reclaimable fallback
      expect(await escrow.getReclaimable(p1.address, short.address)).to.equal(D6('2'));
    });
  });
}
