const { expect } = require('chai');
const { ethers } = require('hardhat');

// =================================================================================================
// Direct UNIT tests of the ISubsidyLockProvider leg (onSubsidyLock / onSubsidyRefund) and the
// ISubsidyViewV2 dual-mode quotes, for BOTH real providers (OPF + OneTime). We call the callbacks
// directly from an EOA registered as an authorized escrow, so we can pin grant sizing, both access
// gates, the authorizedEscrow guard, zero-then-set allowance, per-lockId reservation accounting,
// escrow-scoped reservation keys, window/round crossing, and dual-mode non-additivity with exact
// values — no escrow in the loop.
// =================================================================================================

const U = (n) => ethers.utils.parseUnits(n, 6); // 6-dec USDC-style
const BN = (n) => ethers.BigNumber.from(n);
const ZERO = ethers.constants.AddressZero;
const DAY = 86400, WEEK = 7 * DAY, MONTH = 28 * DAY;

const fastForward = async (s) => {
  await ethers.provider.send('evm_increaseTime', [s]);
  await ethers.provider.send('evm_mine');
};
const nowTs = async () => (await ethers.provider.getBlock('latest')).timestamp;
const lockIdFor = (node, payer, jobId) =>
  ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address', 'address', 'uint256'], [node, payer, jobId]));

// provider-specific adapters so the shared test bodies stay DRY
const CONFIGS = [
  {
    name: 'OPFSubsidyProvider',
    notAuth: 'OPFSubsidy: not authorized escrow',
    // open config: 100% of job, no day/week/month caps -> grant bounded only by need & balance
    setOpen: (p, t) => p.setTokenLimits(t, 10000, 0, 0, 0, true),
    usedNow: (p, payer, t) => p.dailyUsedBy(payer, t),
    usedAtTs: (p, payer, t, ts) => p.dailyUsedByAt(payer, t, ts),
    weeklyAtTs: (p, payer, t, ts) => p.weeklyUsedByAt(payer, t, ts),
    monthlyAtTs: (p, payer, t, ts) => p.monthlyUsedByAt(payer, t, ts),
  },
  {
    name: 'OneTimeSubsidyProvider',
    notAuth: 'OneTimeSubsidy: not authorized escrow',
    // open config: no per-job pct cap, a big one-time credit -> grant bounded only by need & balance
    setOpen: (p, t) => p.setTokenConfig(t, 0, U('1000000'), true),
    usedNow: (p, payer, t) => p.usedBy(payer, t),
  },
];

for (const cfg of CONFIGS) {
  describe(`SubsidyLockProvider unit [${cfg.name}]`, function () {
    let deployer, escrow1, escrow2, node, payer, outsider;
    let token, prov, userList, nodeList;
    let jobSeq = 500;

    beforeEach(async function () {
      const s = await ethers.getSigners();
      deployer = s[0]; escrow1 = s[1]; escrow2 = s[2]; node = s[3]; payer = s[4]; outsider = s[6];
      const Tok = await ethers.getContractFactory('MockERC20Decimals');
      const AL = await ethers.getContractFactory('MockAccessList');
      const Prov = await ethers.getContractFactory(cfg.name);
      token = await Tok.deploy('USDC', 'USDC', 6); await token.deployed();
      userList = await AL.deploy(); await userList.deployed();
      nodeList = await AL.deploy(); await nodeList.deployed();
      prov = await Prov.connect(deployer).deploy(); await prov.deployed();
      await token.transfer(prov.address, U('1000000'));
      await cfg.setOpen(prov, token.address);
      await prov.setAuthorizedEscrow(escrow1.address, true);
      await prov.setAuthorizedEscrow(escrow2.address, true);
    });

    const doLock = (sig, lockId, L, need, jt) =>
      prov.connect(sig).onSubsidyLock(lockId, node.address, payer.address, jt === undefined ? 7 : jt, token.address, L, need);
    const callLock = (sig, lockId, L, need, jt) =>
      prov.connect(sig).callStatic.onSubsidyLock(lockId, node.address, payer.address, jt === undefined ? 7 : jt, token.address, L, need);
    const doRefund = (sig, lockId, amt, jt) =>
      prov.connect(sig).onSubsidyRefund(lockId, node.address, payer.address, jt === undefined ? 7 : jt, token.address, amt);

    // ---- grant sizing (need / balance / provider-specific pct & caps) ----
    it('onSubsidyLock caps the grant at sponsorNeeded', async function () {
      const g = await callLock(escrow1, lockIdFor(node.address, payer.address, jobSeq++), U('50'), U('30'));
      expect(g).to.equal(U('30')); // bounded by need, not by the 50 lock amount
    });

    it('onSubsidyLock caps the grant at the provider balance', async function () {
      // drain the provider down to 7 USDC
      await prov.connect(deployer).withdrawTokens(token.address, deployer.address, U('1000000').sub(U('7')));
      const g = await callLock(escrow1, lockIdFor(node.address, payer.address, jobSeq++), U('50'), U('50'));
      expect(g).to.equal(U('7'));
    });

    if (cfg.name === 'OPFSubsidyProvider') {
      it('OPF: grant capped by pct-of-job and by the rolling daily cap', async function () {
        await prov.connect(deployer).setTokenLimits(token.address, 5000 /*50%*/, U('8'), 0, 0, true);
        // 50% of a 50 job = 25, but daily cap 8 wins
        const g = await callLock(escrow1, lockIdFor(node.address, payer.address, jobSeq++), U('50'), U('50'));
        expect(g).to.equal(U('8'));
      });
    } else {
      it('OneTime: grant capped by the one-time credit and the optional pct ceiling', async function () {
        await prov.connect(deployer).setTokenConfig(token.address, 2500 /*25%*/, U('40'), true);
        // credit 40, 25% of a 50 job = 12.5 -> pct wins
        const g = await callLock(escrow1, lockIdFor(node.address, payer.address, jobSeq++), U('50'), U('50'));
        expect(g).to.equal(U('12.5'));
      });
    }

    // ---- BOTH gates: zero=open, set+non-member => 0 ----
    it('both gates open (lists == address(0)) => grants', async function () {
      const g = await callLock(escrow1, lockIdFor(node.address, payer.address, jobSeq++), U('10'), U('10'));
      expect(g).to.equal(U('10'));
    });

    it('user list set + payer NON-member => grant 0 (user gate)', async function () {
      await prov.connect(deployer).setUserAccessList(userList.address);
      await nodeList.setMember(node.address, true); // irrelevant: node gate still off
      // payer not a member of userList
      const g = await callLock(escrow1, lockIdFor(node.address, payer.address, jobSeq++), U('10'), U('10'));
      expect(g).to.equal(0);
      await userList.setMember(payer.address, true); // now a member -> grants
      expect(await callLock(escrow1, lockIdFor(node.address, payer.address, jobSeq++), U('10'), U('10'))).to.equal(U('10'));
    });

    it('node list set + node NON-member => grant 0 (node gate)', async function () {
      await prov.connect(deployer).setNodeAccessList(nodeList.address);
      const g = await callLock(escrow1, lockIdFor(node.address, payer.address, jobSeq++), U('10'), U('10'));
      expect(g).to.equal(0);
      await nodeList.setMember(node.address, true);
      expect(await callLock(escrow1, lockIdFor(node.address, payer.address, jobSeq++), U('10'), U('10'))).to.equal(U('10'));
    });

    it('BOTH gates set: grant only when payer AND node are members', async function () {
      await prov.connect(deployer).setUserAccessList(userList.address);
      await prov.connect(deployer).setNodeAccessList(nodeList.address);
      await userList.setMember(payer.address, true);
      // node not yet listed -> still 0
      expect(await callLock(escrow1, lockIdFor(node.address, payer.address, jobSeq++), U('10'), U('10'))).to.equal(0);
      await nodeList.setMember(node.address, true);
      expect(await callLock(escrow1, lockIdFor(node.address, payer.address, jobSeq++), U('10'), U('10'))).to.equal(U('10'));
    });

    // ---- authorizedEscrow-only ----
    it('unauthorized caller => onSubsidyLock returns 0 and reserves nothing', async function () {
      const lockId = lockIdFor(node.address, payer.address, jobSeq++);
      expect(await prov.connect(outsider).callStatic.onSubsidyLock(lockId, node.address, payer.address, 7, token.address, U('10'), U('10'))).to.equal(0);
      await prov.connect(outsider).onSubsidyLock(lockId, node.address, payer.address, 7, token.address, U('10'), U('10'));
      expect(await cfg.usedNow(prov, payer.address, token.address)).to.equal(0);
      expect(await token.allowance(prov.address, outsider.address)).to.equal(0);
    });

    it('unauthorized caller => onSubsidyRefund reverts', async function () {
      await expect(doRefund(outsider, lockIdFor(node.address, payer.address, jobSeq++), U('1'))).to.be.revertedWith(cfg.notAuth);
    });

    // ---- zero-then-set approve / allowance ----
    it('onSubsidyLock sets allowance EXACTLY to the grant (zero-then-set, not additive)', async function () {
      const lockId = lockIdFor(node.address, payer.address, jobSeq++);
      await doLock(escrow1, lockId, U('10'), U('6'));
      expect(await token.allowance(prov.address, escrow1.address)).to.equal(U('6'));
      // a SECOND lock (new lockId) from the same escrow re-sets the allowance to the new grant, not 6+4
      await doLock(escrow1, lockIdFor(node.address, payer.address, jobSeq++), U('10'), U('4'));
      expect(await token.allowance(prov.address, escrow1.address)).to.equal(U('4'));
    });

    // ---- per-lockId reservation ----
    it('reservations are tracked per lockId; refunding one leaves the other intact', async function () {
      const lockA = lockIdFor(node.address, payer.address, 9001);
      const lockB = lockIdFor(node.address, payer.address, 9002);
      await doLock(escrow1, lockA, U('10'), U('6'));
      await doLock(escrow1, lockB, U('10'), U('4'));
      expect(await cfg.usedNow(prov, payer.address, token.address)).to.equal(U('10')); // 6 + 4
      await doRefund(escrow1, lockA, U('6')); // fully refund A
      expect(await cfg.usedNow(prov, payer.address, token.address)).to.equal(U('4')); // only B remains
      // refunding A again does nothing (reservation already empty)
      await doRefund(escrow1, lockA, U('6'));
      expect(await cfg.usedNow(prov, payer.address, token.address)).to.equal(U('4'));
    });

    // ---- reserve -> full refund round-trip leaves the budget unchanged ----
    it('reserve -> full refund round-trip leaves the used counter back at 0', async function () {
      const lockId = lockIdFor(node.address, payer.address, jobSeq++);
      expect(await cfg.usedNow(prov, payer.address, token.address)).to.equal(0);
      await doLock(escrow1, lockId, U('20'), U('20'));
      expect(await cfg.usedNow(prov, payer.address, token.address)).to.equal(U('20'));
      await doRefund(escrow1, lockId, U('20'));
      expect(await cfg.usedNow(prov, payer.address, token.address)).to.equal(0);
    });

    // ---- partial refund leaves ONLY the consumed amount spent ----
    it('partial refund leaves only the consumed amount marked used', async function () {
      const lockId = lockIdFor(node.address, payer.address, jobSeq++);
      await doLock(escrow1, lockId, U('20'), U('20'));
      await doRefund(escrow1, lockId, U('8')); // consumed 12, refunded 8
      expect(await cfg.usedNow(prov, payer.address, token.address)).to.equal(U('12'));
    });

    // ---- escrow-scoped reservation key: same lockId from two escrows stays separate ----
    it('same lockId from two different authorized escrows keeps SEPARATE reservations', async function () {
      const lockId = lockIdFor(node.address, payer.address, 9100); // identical lockId for both
      await doLock(escrow1, lockId, U('10'), U('5'));
      await doLock(escrow2, lockId, U('10'), U('5'));
      expect(await cfg.usedNow(prov, payer.address, token.address)).to.equal(U('10')); // 5 + 5 shared payer counter
      // refunding the escrow1 reservation only reverses escrow1's 5; escrow2's reservation untouched
      await doRefund(escrow1, lockId, U('5'));
      expect(await cfg.usedNow(prov, payer.address, token.address)).to.equal(U('5'));
      // a second escrow1 refund is a no-op (its reservation is empty), proving the keys are distinct
      await doRefund(escrow1, lockId, U('5'));
      expect(await cfg.usedNow(prov, payer.address, token.address)).to.equal(U('5'));
      // escrow2 can still reverse its own reservation
      await doRefund(escrow2, lockId, U('5'));
      expect(await cfg.usedNow(prov, payer.address, token.address)).to.equal(0);
    });

    // ---- dual-mode non-additivity: consuming one leg reduces the other (shared budget) ----
    it('dual-mode legs share one budget: spending REIMBURSEMENT reduces PREFUNDED availability', async function () {
      // cap the shared budget so the drop is observable with exact numbers
      if (cfg.name === 'OPFSubsidyProvider') {
        await prov.connect(deployer).setTokenLimits(token.address, 10000, U('30'), 0, 0, true); // daily 30
      } else {
        await prov.connect(deployer).setTokenConfig(token.address, 0, U('40'), true); // credit 40
      }
      const beforeMax = cfg.name === 'OPFSubsidyProvider' ? U('30') : U('40');
      const q0 = await prov.quoteSubsidyModes(node.address, payer.address, 7, token.address, U('100'), U('100'));
      expect(q0.length).to.equal(2);
      expect(q0[0].subsidy).to.equal(beforeMax); // REIMBURSEMENT leg
      expect(q0[1].subsidy).to.equal(beforeMax); // PREFUNDED leg, same shared budget
      // actually CONSUME via the reimbursement callback (onSubsidyClaim) for 15
      await prov.connect(escrow1).onSubsidyClaim(node.address, payer.address, 7, token.address, U('100'), U('15'));
      const q1 = await prov.quoteSubsidyModes(node.address, payer.address, 7, token.address, U('100'), U('100'));
      expect(q1[0].subsidy).to.equal(beforeMax.sub(U('15'))); // reimbursement dropped
      expect(q1[1].subsidy).to.equal(beforeMax.sub(U('15'))); // PREFUNDED dropped too -> NOT additive
    });

    // ---- window / round crossing between lock and refund (audit F1) ----
    if (cfg.name === 'OPFSubsidyProvider') {
      it('OPF: lock crosses a WEEK boundary -> refund reverses the LOCK week only', async function () {
        const lockId = lockIdFor(node.address, payer.address, jobSeq++);
        const ts = await nowTs();
        await doLock(escrow1, lockId, U('20'), U('20'));
        expect(await cfg.weeklyAtTs(prov, payer.address, token.address, ts)).to.equal(U('20'));
        await fastForward(WEEK + 100);
        await doRefund(escrow1, lockId, U('8')); // consumed 12
        expect(await cfg.weeklyAtTs(prov, payer.address, token.address, ts)).to.equal(U('12'));
        // the CURRENT (claim) week's counter was never touched
        expect(await prov.weeklyUsedBy(payer.address, token.address)).to.equal(0);
      });

      it('OPF: lock crosses a MONTH boundary -> refund reverses the LOCK month only', async function () {
        const lockId = lockIdFor(node.address, payer.address, jobSeq++);
        const ts = await nowTs();
        await doLock(escrow1, lockId, U('20'), U('20'));
        expect(await cfg.monthlyAtTs(prov, payer.address, token.address, ts)).to.equal(U('20'));
        await fastForward(MONTH + 100);
        await doRefund(escrow1, lockId, U('8'));
        expect(await cfg.monthlyAtTs(prov, payer.address, token.address, ts)).to.equal(U('12'));
        expect(await prov.monthlyUsedBy(payer.address, token.address)).to.equal(0);
      });
    } else {
      it('OneTime: admin round bump between lock and refund -> refund reverses the LOCK round only', async function () {
        const lockId = lockIdFor(node.address, payer.address, jobSeq++);
        const r0 = await prov.effectiveRound(payer.address);
        await doLock(escrow1, lockId, U('20'), U('20'));
        expect(await prov.usedByAt(payer.address, token.address, r0)).to.equal(U('20'));
        await prov.connect(deployer).resetAllUsers(); // round bump
        expect(await prov.effectiveRound(payer.address)).to.equal(r0.add(1));
        await doRefund(escrow1, lockId, U('8')); // consumed 12
        expect(await prov.usedByAt(payer.address, token.address, r0)).to.equal(U('12')); // lock round restored
        expect(await prov.usedBy(payer.address, token.address)).to.equal(0); // new round untouched
      });
    }
  });
}

// =================================================================================================
// ISubsidyModeConfig — owner-settable mode (BOTH / REFUND_ONLY / PREPAID_ONLY), for BOTH providers.
// BOTH (default) is already covered by the suites above; here we pin the restricted modes.
// =================================================================================================
const MODE = { BOTH: 0, REFUND_ONLY: 1, PREPAID_ONLY: 2 };

for (const cfg of CONFIGS) {
  describe(`SubsidyModeConfig [${cfg.name}]`, function () {
    let deployer, escrow, node, payer, outsider, token, prov;
    let jobSeq = 900;

    beforeEach(async function () {
      const s = await ethers.getSigners();
      deployer = s[0]; escrow = s[1]; node = s[3]; payer = s[4]; outsider = s[6];
      const Tok = await ethers.getContractFactory('MockERC20Decimals');
      const Prov = await ethers.getContractFactory(cfg.name);
      token = await Tok.deploy('USDC', 'USDC', 6); await token.deployed();
      prov = await Prov.connect(deployer).deploy(); await prov.deployed();
      await token.transfer(prov.address, U('1000000'));
      await cfg.setOpen(prov, token.address);
      await prov.setAuthorizedEscrow(escrow.address, true);
    });

    const lockId = () => lockIdFor(node.address, payer.address, jobSeq++);
    const callLock = (need) =>
      prov.connect(escrow).callStatic.onSubsidyLock(lockId(), node.address, payer.address, 7, token.address, need, need);
    const callClaim = (need) =>
      prov.connect(escrow).callStatic.onSubsidyClaim(node.address, payer.address, 7, token.address, need, need);
    const modes = (need) => prov.quoteSubsidyModes(node.address, payer.address, 7, token.address, need, need);
    const byMode = (m, need) => prov.quoteSubsidyByMode(node.address, payer.address, 7, token.address, need, need, m);

    it('defaults to BOTH and advertises ISubsidyModeConfig via ERC-165', async function () {
      expect(await prov.subsidyModeConfig()).to.equal(MODE.BOTH);
      // type(ISubsidyModeConfig).interfaceId
      const iface = new ethers.utils.Interface([
        'function subsidyModeConfig() view returns (uint8)',
        'function setSubsidyMode(uint8)',
      ]);
      let id = ethers.BigNumber.from(0);
      for (const f of Object.keys(iface.functions)) id = id.xor(ethers.BigNumber.from(iface.getSighash(f)));
      const id4 = ethers.utils.hexZeroPad(id.toHexString(), 4);
      expect(await prov.supportsInterface(id4)).to.equal(true);
    });

    it('only the owner can set the mode', async function () {
      await expect(prov.connect(outsider).setSubsidyMode(MODE.REFUND_ONLY)).to.be.reverted;
      await expect(prov.connect(deployer).setSubsidyMode(MODE.REFUND_ONLY))
        .to.emit(prov, 'SubsidyModeConfigSet').withArgs(MODE.REFUND_ONLY);
      expect(await prov.subsidyModeConfig()).to.equal(MODE.REFUND_ONLY);
    });

    it('REFUND_ONLY: claim grants, lock returns 0; quote legs reflect it', async function () {
      await prov.connect(deployer).setSubsidyMode(MODE.REFUND_ONLY);
      const [sub] = await callClaim(U('10'));
      expect(sub).to.equal(U('10'));           // refund leg active
      expect(await callLock(U('10'))).to.equal(0); // prepaid leg disabled
      const q = await modes(U('10'));
      expect(q[0].subsidy).to.equal(U('10'));  // REIMBURSEMENT
      expect(q[1].subsidy).to.equal(0);        // PREFUNDED
      expect((await byMode(0, U('10'))).subsidy).to.equal(U('10'));
      expect((await byMode(1, U('10'))).subsidy).to.equal(0);
    });

    it('PREPAID_ONLY: lock grants, claim returns 0; quote legs reflect it', async function () {
      await prov.connect(deployer).setSubsidyMode(MODE.PREPAID_ONLY);
      expect(await callLock(U('10'))).to.equal(U('10')); // prepaid leg active
      const [sub] = await callClaim(U('10'));
      expect(sub).to.equal(0);                 // refund leg disabled
      const q = await modes(U('10'));
      expect(q[0].subsidy).to.equal(0);        // REIMBURSEMENT
      expect(q[1].subsidy).to.equal(U('10'));  // PREFUNDED
      expect((await byMode(0, U('10'))).subsidy).to.equal(0);
      expect((await byMode(1, U('10'))).subsidy).to.equal(U('10'));
    });
  });
}
