/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach, before */
const hre = require("hardhat");
const ethers = hre.ethers;
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const { assert, expect } = require("chai");
const { getEventFromTx } = require("../../helpers/utils");
// Helper function to create values with 6 decimals
function parseTokens(amount) {
  return ethers.utils.parseUnits(amount.toString(), 6);
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
  const TOKEN_CAP = parseTokens("10000000"); // 10 million tokens
  const TOKEN_NAME = "COMPY";
  const TOKEN_SYMBOL = "COMPY";
  const DECIMALS = 6;

  before("setup test helpers", async function () {
    // Dynamic import of chai to handle ESM module
    const chai = await import("chai");
    assert = chai.assert;
    expect = chai.expect;
  });

  beforeEach("deploy contract", async () => {
    [owner, recipient, spender, minter, other] = await ethers.getSigners();

    const GrantsToken = await ethers.getContractFactory("GrantsToken");
    grantsToken = await GrantsToken.deploy(INITIAL_SUPPLY, TOKEN_CAP);
    await grantsToken.deployed();
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
        const amount = parseTokens("10000000000"); // More than cap
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
      const deadline = block.timestamp + 36000; // 10 hour from now
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
      const expiredDeadline = block.timestamp - 3600; // 1 hour ago
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

      // Sign with wrong signer (minter instead of owner)
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
      assert.equal(domainSeparator.length, 66); // 0x + 64 hex chars
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
