/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach, before */
const hre = require("hardhat");
const ethers = hre.ethers;
const { getEventFromTx } = require("../../helpers/utils");

async function expectRevert(promise, expectedMessage) {
  let error = null;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  if (!error) throw new Error("Expected transaction to revert but it succeeded");
  if (expectedMessage) {
    const msg = error.message || "";
    if (!msg.includes(expectedMessage)) {
      throw new Error(
        `Expected revert "${expectedMessage}" but got: "${msg}"`
      );
    }
  }
}

function parseTokens(amount) {
  return ethers.utils.parseUnits(amount.toString(), 6);
}

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

describe("GrantsToken", () => {
  let grantsToken;
  let owner;
  let recipient;
  let spender;
  let minter;
  let other;
  let assert;
  let expect;

  const INITIAL_SUPPLY = parseTokens("1000000"); // 1 million tokens
  const TOKEN_CAP = parseTokens("10000000");     // 10 million tokens
  const TOKEN_NAME = "COMPY";
  const TOKEN_SYMBOL = "COMPY";
  const DECIMALS = 6;

  before("setup test helpers", async function () {
    const chai = await import("chai");
    assert = chai.assert;
    expect = chai.expect;
  });

  beforeEach("deploy contract", async () => {
    [owner, recipient, spender, minter, other] = await ethers.getSigners();

    const GrantsToken = await ethers.getContractFactory("GrantsToken");
    const impl = await GrantsToken.deploy();
    await impl.deployed();

    const initData = impl.interface.encodeFunctionData("initialize", [
      INITIAL_SUPPLY,
      TOKEN_CAP,
      owner.address,
    ]);
    const ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
    const proxy = await ProxyFactory.deploy(impl.address, initData);
    await proxy.deployed();

    grantsToken = GrantsToken.attach(proxy.address);

    // Add owner to allowlist so existing transfer tests work unmodified.
    await grantsToken.addToAllowlist(owner.address);
  });

  describe("Deployment", () => {
    it("should have correct name", async () => {
      const name = await grantsToken.name();
      assert.equal(name, TOKEN_NAME);
    });

    it("should have correct symbol", async () => {
      const symbol = await grantsToken.symbol();
      assert.equal(symbol, TOKEN_SYMBOL);
    });

    it("should have correct decimals", async () => {
      const decimals = await grantsToken.decimals();
      assert.equal(decimals, DECIMALS);
    });

    it("should have correct initial supply", async () => {
      const totalSupply = await grantsToken.totalSupply();
      assert.isTrue(totalSupply.eq(INITIAL_SUPPLY));
    });

    it("should have correct token cap", async () => {
      const cap = await grantsToken.cap();
      assert.isTrue(cap.eq(TOKEN_CAP));
    });

    it("should mint initial tokens to owner", async () => {
      const balance = await grantsToken.balanceOf(owner.address);
      assert.isTrue(balance.eq(INITIAL_SUPPLY));
    });

    it("should set owner correctly", async () => {
      const contractOwner = await grantsToken.owner();
      assert.equal(contractOwner, owner.address);
    });

    it("should not be paused on deployment", async () => {
      const paused = await grantsToken.paused();
      assert.isFalse(paused);
    });

    it("should not allow initialize to be called again", async () => {
      await expectRevert(
        grantsToken.initialize(INITIAL_SUPPLY, TOKEN_CAP, owner.address),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("ERC20 Standard Functions", () => {
    describe("approve", () => {
      it("should approve spending amount", async () => {
        const amount = parseTokens("100");
        const tx = await grantsToken.approve(spender.address, amount);
        txReceipt = await tx.wait();
        const event = getEventFromTx(txReceipt, "Approval");
        assert(event, "Cannot find Approval event");
      });

      it("should allow querying approved amount", async () => {
        const amount = parseTokens("500");
        await grantsToken.approve(spender.address, amount);
        const allowance = await grantsToken.allowance(
          owner.address,
          spender.address
        );
        assert.isTrue(allowance.eq(amount));
      });

      it("should update approval amount", async () => {
        const amount1 = parseTokens("100");
        const amount2 = parseTokens("200");

        await grantsToken.approve(spender.address, amount1);
        let allowance = await grantsToken.allowance(
          owner.address,
          spender.address
        );
        assert.isTrue(allowance.eq(amount1));

        await grantsToken.approve(spender.address, amount2);
        allowance = await grantsToken.allowance(owner.address, spender.address);
        assert.isTrue(allowance.eq(amount2));
      });
    });

    describe("transfer", () => {
      it("should transfer tokens from sender to recipient", async () => {
        const amount = parseTokens("100");
        const initialBalance = await grantsToken.balanceOf(recipient.address);

        await grantsToken.transfer(recipient.address, amount);

        const finalBalance = await grantsToken.balanceOf(recipient.address);
        assert.isTrue(finalBalance.eq(initialBalance.add(amount)));
      });

      it("should emit Transfer event", async () => {
        const amount = parseTokens("100");
        const tx = await grantsToken.transfer(recipient.address, amount);

        txReceipt = await tx.wait();
        const event = getEventFromTx(txReceipt, "Transfer");
        assert(event, "Cannot find Transfer event");
      });

      it("should revert if sender has insufficient balance", async () => {
        const amount = parseTokens("10000000000");
        await expectRevert(
          grantsToken.connect(recipient).transfer(owner.address, amount),
          "ERC20: transfer amount exceeds balance"
        );
      });

      it("should revert if transferring to zero address", async () => {
        const amount = parseTokens("100");
        await expectRevert(
          grantsToken.transfer(
            "0x0000000000000000000000000000000000000000",
            amount
          ),
          "ERC20: transfer to the zero address"
        );
      });
    });

    describe("transferFrom", () => {
      it("should transfer tokens on behalf of owner", async () => {
        const amount = parseTokens("100");
        await grantsToken.approve(spender.address, amount);

        const initialBalance = await grantsToken.balanceOf(recipient.address);
        await grantsToken
          .connect(spender)
          .transferFrom(owner.address, recipient.address, amount);
        const finalBalance = await grantsToken.balanceOf(recipient.address);

        assert.isTrue(finalBalance.eq(initialBalance.add(amount)));
      });

      it("should decrease allowance after transferFrom", async () => {
        const amount = parseTokens("100");
        await grantsToken.approve(spender.address, amount);

        await grantsToken
          .connect(spender)
          .transferFrom(owner.address, recipient.address, amount);

        const allowance = await grantsToken.allowance(
          owner.address,
          spender.address
        );
        assert.isTrue(allowance.eq(0));
      });

      it("should emit Transfer event on transferFrom", async () => {
        const amount = parseTokens("100");
        await grantsToken.approve(spender.address, amount);

        const tx = await grantsToken
          .connect(spender)
          .transferFrom(owner.address, recipient.address, amount);

        txReceipt = await tx.wait();
        const event = getEventFromTx(txReceipt, "Transfer");
        assert(event, "Cannot find Transfer event");
      });

      it("should revert if allowance is insufficient", async () => {
        const approveAmount = parseTokens("50");
        const transferAmount = parseTokens("100");

        await grantsToken.approve(spender.address, approveAmount);

        await expectRevert(
          grantsToken
            .connect(spender)
            .transferFrom(owner.address, recipient.address, transferAmount),
          "ERC20: insufficient allowance"
        );
      });
    });

    describe("balanceOf", () => {
      it("should return correct balance", async () => {
        const balance = await grantsToken.balanceOf(owner.address);
        assert.isTrue(balance.eq(INITIAL_SUPPLY));
      });

      it("should return zero for address with no tokens", async () => {
        const balance = await grantsToken.balanceOf(minter.address);
        assert.isTrue(balance.eq(0));
      });
    });
  });

  describe("Minting", () => {
    it("owner can mint new tokens", async () => {
      const amount = parseTokens("1000");
      const initialSupply = await grantsToken.totalSupply();

      await grantsToken.mint(recipient.address, amount);

      const finalSupply = await grantsToken.totalSupply();
      const balance = await grantsToken.balanceOf(recipient.address);

      assert.isTrue(balance.eq(amount));
      assert.isTrue(finalSupply.eq(initialSupply.add(amount)));
    });

    it("should emit TokensMinted event", async () => {
      const amount = parseTokens("1000");
      const tx = await grantsToken.mint(recipient.address, amount);
      txReceipt = await tx.wait();
      const event = getEventFromTx(txReceipt, "TokensMinted");
      assert(event, "Cannot find TokensMinted event");
    });

    it("non-owner cannot mint tokens", async () => {
      const amount = parseTokens("1000");
      await expectRevert(
        grantsToken.connect(other).mint(recipient.address, amount),
        "Ownable: caller is not the owner"
      );
    });

    it("cannot mint to zero address", async () => {
      const amount = parseTokens("1000");
      await expectRevert(
        grantsToken.mint("0x0000000000000000000000000000000000000000", amount),
        "GrantsToken: cannot mint to zero address"
      );
    });

    it("cannot mint more than cap", async () => {
      const exceedingAmount = TOKEN_CAP.add(parseTokens("1"));
      await expectRevert(
        grantsToken.mint(recipient.address, exceedingAmount),
        "ERC20Capped: cap exceeded"
      );
    });

    it("cannot mint when it would exceed cap", async () => {
      const remainingCap = TOKEN_CAP.sub(INITIAL_SUPPLY);
      const exceedingAmount = remainingCap.add(parseTokens("1"));

      await expectRevert(
        grantsToken.mint(recipient.address, exceedingAmount),
        "ERC20Capped: cap exceeded"
      );
    });

    it("can mint up to cap", async () => {
      const remainingCap = TOKEN_CAP.sub(INITIAL_SUPPLY);
      await grantsToken.mint(recipient.address, remainingCap);

      const totalSupply = await grantsToken.totalSupply();
      assert.isTrue(totalSupply.eq(TOKEN_CAP));
    });
  });

  describe("Burning", () => {
    beforeEach(async () => {
      // owner is on allowlist → transfer to recipient succeeds
      const amount = parseTokens("500");
      await grantsToken.transfer(recipient.address, amount);
    });

    it("token holder can burn their own tokens", async () => {
      const initialSupply = await grantsToken.totalSupply();
      const burnAmount = parseTokens("100");
      const initialBalance = await grantsToken.balanceOf(recipient.address);

      await grantsToken.connect(recipient).burn(burnAmount);

      const finalSupply = await grantsToken.totalSupply();
      const finalBalance = await grantsToken.balanceOf(recipient.address);

      assert.isTrue(finalBalance.eq(initialBalance.sub(burnAmount)));
      assert.isTrue(finalSupply.eq(initialSupply.sub(burnAmount)));
    });

    it("should emit TokensBurned event", async () => {
      const burnAmount = parseTokens("100");
      const tx = await grantsToken.connect(recipient).burn(burnAmount);
      txReceipt = await tx.wait();
      const event = getEventFromTx(txReceipt, "TokensBurned");
      assert(event, "Cannot find TokensBurned event");
    });

    it("account with approval can burn on behalf of another", async () => {
      const burnAmount = parseTokens("100");
      const initialSupply = await grantsToken.totalSupply();
      const initialBalance = await grantsToken.balanceOf(recipient.address);

      await grantsToken.connect(recipient).approve(spender.address, burnAmount);

      await grantsToken
        .connect(spender)
        .burnFrom(recipient.address, burnAmount);

      const finalSupply = await grantsToken.totalSupply();
      const finalBalance = await grantsToken.balanceOf(recipient.address);

      assert.isTrue(finalBalance.eq(initialBalance.sub(burnAmount)));
      assert.isTrue(finalSupply.eq(initialSupply.sub(burnAmount)));
    });

    it("should emit TokensBurned event for burnFrom", async () => {
      const burnAmount = parseTokens("100");
      await grantsToken.connect(recipient).approve(spender.address, burnAmount);

      const tx = await grantsToken
        .connect(spender)
        .burnFrom(recipient.address, burnAmount);

      txReceipt = await tx.wait();
      const event = getEventFromTx(txReceipt, "TokensBurned");
      assert(event, "Cannot find TokensBurned event");
    });

    it("cannot burn more than balance", async () => {
      const balance = await grantsToken.balanceOf(recipient.address);
      const excessAmount = balance.add(parseTokens("1"));

      await expectRevert(
        grantsToken.connect(recipient).burn(excessAmount),
        "ERC20: burn amount exceeds balance"
      );
    });

    it("cannot burnFrom without sufficient allowance", async () => {
      const burnAmount = parseTokens("100");
      const allowanceAmount = parseTokens("50");

      await grantsToken
        .connect(recipient)
        .approve(spender.address, allowanceAmount);

      await expectRevert(
        grantsToken.connect(spender).burnFrom(recipient.address, burnAmount),
        "ERC20: insufficient allowance"
      );
    });
  });

  describe("adminBurnFrom", () => {
    beforeEach(async () => {
      // Give recipient some tokens to burn (owner is on allowlist)
      await grantsToken.transfer(recipient.address, parseTokens("500"));
    });

    it("owner can burn tokens from any address without allowance", async () => {
      const burnAmount = parseTokens("200");
      const initialSupply = await grantsToken.totalSupply();
      const initialBalance = await grantsToken.balanceOf(recipient.address);

      await grantsToken.adminBurnFrom(recipient.address, burnAmount);

      const finalSupply = await grantsToken.totalSupply();
      const finalBalance = await grantsToken.balanceOf(recipient.address);

      assert.isTrue(finalBalance.eq(initialBalance.sub(burnAmount)));
      assert.isTrue(finalSupply.eq(initialSupply.sub(burnAmount)));
    });

    it("should emit TokensBurned event", async () => {
      const burnAmount = parseTokens("100");
      const tx = await grantsToken.adminBurnFrom(recipient.address, burnAmount);
      const txReceipt = await tx.wait();
      const event = getEventFromTx(txReceipt, "TokensBurned");
      assert(event, "Cannot find TokensBurned event");
    });

    it("non-owner cannot call adminBurnFrom", async () => {
      const burnAmount = parseTokens("100");
      await expectRevert(
        grantsToken.connect(spender).adminBurnFrom(recipient.address, burnAmount),
        "Ownable: caller is not the owner"
      );
    });

    it("cannot adminBurnFrom more than balance", async () => {
      const balance = await grantsToken.balanceOf(recipient.address);
      const excessAmount = balance.add(parseTokens("1"));

      await expectRevert(
        grantsToken.adminBurnFrom(recipient.address, excessAmount),
        "ERC20: burn amount exceeds balance"
      );
    });

    it("does not require allowance from target address", async () => {
      const burnAmount = parseTokens("100");
      // No approve call — should still succeed
      const initialBalance = await grantsToken.balanceOf(recipient.address);
      await grantsToken.adminBurnFrom(recipient.address, burnAmount);
      const finalBalance = await grantsToken.balanceOf(recipient.address);
      assert.isTrue(finalBalance.eq(initialBalance.sub(burnAmount)));
    });
  });

  describe("Pausing", () => {
    it("owner can pause token transfers", async () => {
      await grantsToken.pause();
      const isPaused = await grantsToken.paused();
      assert.isTrue(isPaused);
    });

    it("owner can unpause token transfers", async () => {
      await grantsToken.pause();
      let isPaused = await grantsToken.paused();
      assert.isTrue(isPaused);

      await grantsToken.unpause();
      isPaused = await grantsToken.paused();
      assert.isFalse(isPaused);
    });

    it("transfers revert when paused", async () => {
      const amount = parseTokens("100");
      await grantsToken.pause();

      await expectRevert(
        grantsToken.transfer(recipient.address, amount),
        "Pausable: paused"
      );
    });

    it("transferFrom reverts when paused", async () => {
      const amount = parseTokens("100");
      await grantsToken.approve(spender.address, amount);
      await grantsToken.pause();

      await expectRevert(
        grantsToken
          .connect(spender)
          .transferFrom(owner.address, recipient.address, amount),
        "Pausable: paused"
      );
    });

    it("non-owner cannot pause", async () => {
      await expectRevert(
        grantsToken.connect(other).pause(),
        "Ownable: caller is not the owner"
      );
    });

    it("non-owner cannot unpause", async () => {
      await grantsToken.pause();

      await expectRevert(
        grantsToken.connect(other).unpause(),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("Transfer Allowlist", () => {
    it("addToAllowlist adds an address and emits AllowlistAdded", async () => {
      const tx = await grantsToken.addToAllowlist(recipient.address);
      const txReceipt = await tx.wait();
      const event = getEventFromTx(txReceipt, "AllowlistAdded");
      assert(event, "Cannot find AllowlistAdded event");

      assert.isTrue(await grantsToken.isAllowlisted(recipient.address));
      assert.equal(await grantsToken.getAllowlistLength(), 2); // owner was added in beforeEach
    });

    it("cannot add the zero address", async () => {
      await expectRevert(
        grantsToken.addToAllowlist("0x0000000000000000000000000000000000000000"),
        "GrantsToken: zero address"
      );
    });

    it("cannot add the same address twice", async () => {
      await grantsToken.addToAllowlist(recipient.address);
      await expectRevert(
        grantsToken.addToAllowlist(recipient.address),
        "GrantsToken: already in allowlist"
      );
    });

    it("non-owner cannot add to allowlist", async () => {
      await expectRevert(
        grantsToken.connect(other).addToAllowlist(recipient.address),
        "Ownable: caller is not the owner"
      );
    });

    it("removeFromAllowlist removes an address and emits AllowlistRemoved", async () => {
      await grantsToken.addToAllowlist(recipient.address);
      const tx = await grantsToken.removeFromAllowlist(recipient.address);
      const txReceipt = await tx.wait();
      const event = getEventFromTx(txReceipt, "AllowlistRemoved");
      assert(event, "Cannot find AllowlistRemoved event");

      assert.isFalse(await grantsToken.isAllowlisted(recipient.address));
    });

    it("cannot remove an address not on the allowlist", async () => {
      await expectRevert(
        grantsToken.removeFromAllowlist(recipient.address),
        "GrantsToken: not in allowlist"
      );
    });

    it("non-owner cannot remove from allowlist", async () => {
      await grantsToken.addToAllowlist(recipient.address);
      await expectRevert(
        grantsToken.connect(other).removeFromAllowlist(recipient.address),
        "Ownable: caller is not the owner"
      );
    });

    it("swap-and-pop preserves correct entries after removal", async () => {
      // Build list: [owner, A, B, C]
      const [, A, B, C] = [owner, recipient, spender, minter];
      await grantsToken.addToAllowlist(A.address);
      await grantsToken.addToAllowlist(B.address);
      await grantsToken.addToAllowlist(C.address);

      // Remove A (index 1): C should take its slot
      await grantsToken.removeFromAllowlist(A.address);

      const len = await grantsToken.getAllowlistLength();
      assert.equal(len, 3);

      const entries = await grantsToken.getAllowlist(0, 10);
      assert.isFalse(entries.includes(A.address));
      assert.isTrue(await grantsToken.isAllowlisted(B.address));
      assert.isTrue(await grantsToken.isAllowlisted(C.address));
    });

    it("getAllowlist returns paginated results", async () => {
      await grantsToken.addToAllowlist(recipient.address);
      await grantsToken.addToAllowlist(spender.address);
      await grantsToken.addToAllowlist(minter.address);
      // list: [owner, recipient, spender, minter]

      const page0 = await grantsToken.getAllowlist(0, 2);
      assert.equal(page0.length, 2);

      const page1 = await grantsToken.getAllowlist(2, 2);
      assert.equal(page1.length, 2);

      const all = await grantsToken.getAllowlist(0, 10);
      assert.equal(all.length, 4);
    });

    it("getAllowlist returns empty array when from >= length", async () => {
      const result = await grantsToken.getAllowlist(100, 10);
      assert.equal(result.length, 0);
    });

    it("isAllowlisted returns false for unlisted address", async () => {
      assert.isFalse(await grantsToken.isAllowlisted(other.address));
    });

    it("transfer reverts when neither sender nor receiver is on allowlist", async () => {
      // Give minter some tokens via owner (owner is on allowlist → transfer OK)
      await grantsToken.transfer(minter.address, parseTokens("100"));

      // minter → other: neither is on allowlist → should revert
      await expectRevert(
        grantsToken.connect(minter).transfer(other.address, parseTokens("50")),
        "GrantsToken: transfer not allowed"
      );
    });

    it("transfer succeeds when sender is on allowlist", async () => {
      await grantsToken.addToAllowlist(minter.address);
      await grantsToken.transfer(minter.address, parseTokens("100"));

      // minter → other: minter is on allowlist → OK
      await grantsToken.connect(minter).transfer(other.address, parseTokens("50"));
      const balance = await grantsToken.balanceOf(other.address);
      assert.isTrue(balance.eq(parseTokens("50")));
    });

    it("transfer succeeds when receiver is on allowlist", async () => {
      await grantsToken.addToAllowlist(other.address);
      await grantsToken.transfer(minter.address, parseTokens("100"));

      // minter → other: other is on allowlist → OK
      await grantsToken.connect(minter).transfer(other.address, parseTokens("50"));
      const balance = await grantsToken.balanceOf(other.address);
      assert.isTrue(balance.eq(parseTokens("50")));
    });

    it("transfer is blocked after address is removed from allowlist", async () => {
      await grantsToken.addToAllowlist(minter.address);
      await grantsToken.transfer(minter.address, parseTokens("100"));

      // minter can send to other while on list
      await grantsToken.connect(minter).transfer(other.address, parseTokens("10"));

      // Remove minter; now minter → other should fail
      await grantsToken.removeFromAllowlist(minter.address);
      await expectRevert(
        grantsToken.connect(minter).transfer(other.address, parseTokens("10")),
        "GrantsToken: transfer not allowed"
      );
    });

    it("mint bypasses allowlist check", async () => {
      // recipient is not on allowlist; minting to them should still succeed
      await grantsToken.mint(recipient.address, parseTokens("100"));
      const balance = await grantsToken.balanceOf(recipient.address);
      assert.isTrue(balance.eq(parseTokens("100")));
    });

    it("burn bypasses allowlist check", async () => {
      // Transfer to minter (owner is on allowlist), then minter burns directly
      await grantsToken.transfer(minter.address, parseTokens("100"));
      await grantsToken.connect(minter).burn(parseTokens("50"));
      const balance = await grantsToken.balanceOf(minter.address);
      assert.isTrue(balance.eq(parseTokens("50")));
    });
  });

  describe("Ownership", () => {
    it("owner can transfer ownership", async () => {
      await grantsToken.transferOwnership(recipient.address);
      const newOwner = await grantsToken.owner();
      assert.equal(newOwner, recipient.address);
    });

    it("non-owner cannot transfer ownership", async () => {
      await expectRevert(
        grantsToken.connect(other).transferOwnership(recipient.address),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("ERC20Permit", () => {
    it("should support ERC20Permit", async () => {
      const amount = parseTokens("100");
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 36000;
      const nonce = await grantsToken.nonces(owner.address);

      const { v, r, s } = await signPermit(
        owner,
        grantsToken,
        spender.address,
        amount,
        deadline,
        nonce
      );

      await grantsToken.permit(
        owner.address,
        spender.address,
        amount,
        deadline,
        v,
        r,
        s
      );

      const allowance = await grantsToken.allowance(owner.address, spender.address);
      assert.isTrue(allowance.eq(amount));
    });

    it("should increment nonce after permit", async () => {
      const amount = parseTokens("100");
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3600;
      const initialNonce = await grantsToken.nonces(owner.address);

      const { v, r, s } = await signPermit(
        owner,
        grantsToken,
        spender.address,
        amount,
        deadline,
        initialNonce
      );

      await grantsToken.permit(
        owner.address,
        spender.address,
        amount,
        deadline,
        v,
        r,
        s
      );

      const finalNonce = await grantsToken.nonces(owner.address);
      assert.isTrue(finalNonce.eq(initialNonce.add(1)));
    });

    it("should revert permit with expired deadline", async () => {
      const amount = parseTokens("100");
      const block = await ethers.provider.getBlock("latest");
      const expiredDeadline = block.timestamp - 3600;
      const nonce = await grantsToken.nonces(owner.address);

      const { v, r, s } = await signPermit(
        owner,
        grantsToken,
        spender.address,
        amount,
        expiredDeadline,
        nonce
      );

      await expectRevert(
        grantsToken.permit(
          owner.address,
          spender.address,
          amount,
          expiredDeadline,
          v,
          r,
          s
        ),
        "ERC20Permit: expired deadline"
      );
    });

    it("should revert permit with invalid signature", async () => {
      const amount = parseTokens("100");
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3600;
      const nonce = await grantsToken.nonces(owner.address);

      const { v, r, s } = await signPermit(
        minter,
        grantsToken,
        spender.address,
        amount,
        deadline,
        nonce
      );

      await expectRevert(
        grantsToken.permit(
          owner.address,
          spender.address,
          amount,
          deadline,
          v,
          r,
          s
        ),
        "ERC20Permit: invalid signature"
      );
    });

    it("should allow transferFrom after permit", async () => {
      const amount = parseTokens("100");
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3600;
      const nonce = await grantsToken.nonces(owner.address);

      const { v, r, s } = await signPermit(
        owner,
        grantsToken,
        spender.address,
        amount,
        deadline,
        nonce
      );

      await grantsToken.permit(
        owner.address,
        spender.address,
        amount,
        deadline,
        v,
        r,
        s
      );

      const initialBalance = await grantsToken.balanceOf(recipient.address);
      await grantsToken
        .connect(spender)
        .transferFrom(owner.address, recipient.address, amount);
      const finalBalance = await grantsToken.balanceOf(recipient.address);

      assert.isTrue(finalBalance.eq(initialBalance.add(amount)));
    });

    it("should get the correct DOMAIN_SEPARATOR", async () => {
      const domainSeparator = await grantsToken.DOMAIN_SEPARATOR();
      assert.isNotNull(domainSeparator);
      assert.equal(domainSeparator.length, 66);
    });

    it("should track nonces correctly", async () => {
      const nonce0 = await grantsToken.nonces(owner.address);
      assert.isTrue(nonce0.eq(0));

      const amount = parseTokens("100");
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3600;

      const { v, r, s } = await signPermit(
        owner,
        grantsToken,
        spender.address,
        amount,
        deadline,
        nonce0
      );

      await grantsToken.permit(
        owner.address,
        spender.address,
        amount,
        deadline,
        v,
        r,
        s
      );

      const nonce1 = await grantsToken.nonces(owner.address);
      assert.isTrue(nonce1.eq(1));
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero amount transfers", async () => {
      const initialBalance = await grantsToken.balanceOf(recipient.address);
      await grantsToken.transfer(recipient.address, 0);
      const finalBalance = await grantsToken.balanceOf(recipient.address);
      assert.isTrue(initialBalance.eq(finalBalance));
    });

    it("should allow multiple approvals to different spenders", async () => {
      const amount1 = parseTokens("100");
      const amount2 = parseTokens("200");

      await grantsToken.approve(spender.address, amount1);
      await grantsToken.approve(minter.address, amount2);

      const allowance1 = await grantsToken.allowance(
        owner.address,
        spender.address
      );
      const allowance2 = await grantsToken.allowance(
        owner.address,
        minter.address
      );

      assert.isTrue(allowance1.eq(amount1));
      assert.isTrue(allowance2.eq(amount2));
    });
  });
});
