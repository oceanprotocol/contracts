/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach, before */
const hre = require("hardhat");
const ethers = hre.ethers;
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const { getEventFromTx } = require("../../helpers/utils");

// Helper function to create values with 6 decimals (COMPY uses 6 decimals)
function parseTokens(amount) {
  return ethers.utils.parseUnits(amount.toString(), 6);
}

// Helper function to create values with 18 decimals (standard ERC20)
function parseTokens18(amount) {
  return ethers.utils.parseUnits(amount.toString(), 18);
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

describe("GrantsSwap", () => {
  let grantsSwap;
  let compyToken;
  let inputToken;
  let owner;
  let user1;
  let user2;
  let assert;
  let expect;

  const INITIAL_SUPPLY = parseTokens("1000000"); // 1 million COMPY tokens
  const TOKEN_CAP = parseTokens("10000000"); // 10 million COMPY tokens
  const INPUT_TOKEN_SUPPLY = parseTokens18("1000000"); // 1 million input tokens

  before("setup test helpers", async function () {
    // Dynamic import of chai to handle ESM module
    const chai = await import("chai");
    assert = chai.assert;
    expect = chai.expect;
  });

  beforeEach("deploy contracts", async () => {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy COMPY token
    const GrantsToken = await ethers.getContractFactory("GrantsToken");
    compyToken = await GrantsToken.deploy(INITIAL_SUPPLY, TOKEN_CAP);
    await compyToken.deployed();

    // Deploy a mock ERC20 token as input token (with 18 decimals)
    const MockERC20Decimals = await ethers.getContractFactory("MockERC20Decimals");
    inputToken = await MockERC20Decimals.deploy("Input Token", "INPUT", 18);
    await inputToken.deployed();

    // Deploy GrantsSwap contract
    const GrantsSwap = await ethers.getContractFactory("GrantsSwap");
    grantsSwap = await GrantsSwap.deploy(compyToken.address, inputToken.address);
    await grantsSwap.deployed();

    // Transfer some COMPY tokens to the swap contract for swaps
    const swapContractCOMPYBalance = parseTokens("100000"); // 100k COMPY
    await compyToken.transfer(grantsSwap.address, swapContractCOMPYBalance);

    // Transfer some input tokens to the swap contract for swaps
    const swapContractInputBalance = parseTokens18("100000"); // 100k INPUT
    await inputToken.transfer(grantsSwap.address, swapContractInputBalance);

    // Give user1 some COMPY tokens
    const user1COMPYBalance = parseTokens("10000"); // 10k COMPY
    await compyToken.transfer(user1.address, user1COMPYBalance);

    // Give user1 some input tokens
    const user1InputBalance = parseTokens18("10000"); // 10k INPUT
    await inputToken.transfer(user1.address, user1InputBalance);

    // Give user2 some COMPY tokens
    const user2COMPYBalance = parseTokens("5000"); // 5k COMPY
    await compyToken.transfer(user2.address, user2COMPYBalance);

    // Give user2 some input tokens
    const user2InputBalance = parseTokens18("5000"); // 5k INPUT
    await inputToken.transfer(user2.address, user2InputBalance);
  });

  describe("Deployment", () => {
    it("should set COMPY token address correctly", async () => {
      const compyAddress = await grantsSwap.compyToken();
      assert.equal(compyAddress, compyToken.address);
    });

    it("should set input token address correctly", async () => {
      const inputAddress = await grantsSwap.inputToken();
      assert.equal(inputAddress, inputToken.address);
    });

    it("should revert if COMPY token is zero address", async () => {
      const GrantsSwap = await ethers.getContractFactory("GrantsSwap");
      await expectRevert(
        GrantsSwap.deploy(ethers.constants.AddressZero, inputToken.address),
        "GrantsSwap: COMPY token cannot be zero address"
      );
    });

    it("should revert if input token is zero address", async () => {
      const GrantsSwap = await ethers.getContractFactory("GrantsSwap");
      await expectRevert(
        GrantsSwap.deploy(compyToken.address, ethers.constants.AddressZero),
        "GrantsSwap: input token cannot be zero address"
      );
    });

    it("should revert if both tokens are the same", async () => {
      const GrantsSwap = await ethers.getContractFactory("GrantsSwap");
      await expectRevert(
        GrantsSwap.deploy(compyToken.address, compyToken.address),
        "GrantsSwap: tokens must be different"
      );
    });

    it("should set owner correctly", async () => {
      const contractOwner = await grantsSwap.owner();
      assert.equal(contractOwner, owner.address);
    });
  });

  describe("swapToCOMPY", () => {
    it("should swap input tokens for COMPY at 1:1 ratio", async () => {
      const swapAmount = parseTokens18("1000"); // 1000 INPUT (18 decimals)
      // 1000 INPUT tokens = 1000 * 10^18 wei
      // For 1:1 ratio with 6 decimal token: 1000 * 10^6 wei = 1000 COMPY tokens
      const compyAmount = parseTokens("1000"); // 1000 COMPY (6 decimals)

      // Approve input tokens
      await inputToken.connect(user1).approve(grantsSwap.address, swapAmount);

      // Get initial balances
      const user1COMPYBefore = await compyToken.balanceOf(user1.address);
      const user1InputBefore = await inputToken.balanceOf(user1.address);
      const contractCOMPYBefore = await compyToken.balanceOf(grantsSwap.address);
      const contractInputBefore = await inputToken.balanceOf(grantsSwap.address);

      // Perform swap
      const tx = await grantsSwap.connect(user1).swapToCOMPY(swapAmount);
      const txReceipt = await tx.wait();

      // Check balances after swap
      const user1COMPYAfter = await compyToken.balanceOf(user1.address);
      const user1InputAfter = await inputToken.balanceOf(user1.address);
      const contractCOMPYAfter = await compyToken.balanceOf(grantsSwap.address);
      const contractInputAfter = await inputToken.balanceOf(grantsSwap.address);

      // Verify balances
      assert.isTrue(user1COMPYAfter.sub(user1COMPYBefore).eq(compyAmount), "User COMPY balance should increase");
      assert.isTrue(user1InputBefore.sub(user1InputAfter).eq(swapAmount), "User input token balance should decrease");
      assert.isTrue(contractCOMPYBefore.sub(contractCOMPYAfter).eq(compyAmount), "Contract COMPY balance should decrease");
      assert.isTrue(contractInputAfter.sub(contractInputBefore).eq(swapAmount), "Contract input token balance should increase");

      // Check event
      const event = getEventFromTx(txReceipt, "Swap");
      assert(event, "Cannot find Swap event");
      assert.equal(event.args.user, user1.address);
      assert.isTrue(event.args.inputTokenAmount.eq(swapAmount));
      assert.isTrue(event.args.compyAmount.eq(compyAmount));
    });

    it("should revert if amount is zero", async () => {
      await expectRevert(
        grantsSwap.connect(user1).swapToCOMPY(0),
        "GrantsSwap: amount must be greater than zero"
      );
    });

    it("should revert if user has insufficient input token balance", async () => {
      const swapAmount = parseTokens18("50000"); // More than user1 has
      await inputToken.connect(user1).approve(grantsSwap.address, swapAmount);

      await expectRevert(
        grantsSwap.connect(user1).swapToCOMPY(swapAmount),
        "ERC20: transfer amount exceeds balance"
      );
    });

    it("should revert if user has not approved input tokens", async () => {
      const swapAmount = parseTokens18("1000");
      await expectRevert(
        grantsSwap.connect(user1).swapToCOMPY(swapAmount),
        "ERC20: transfer amount exceeds allowance"
      );
    });

    it("should revert if contract has insufficient COMPY balance", async () => {
      const swapAmount = parseTokens18("200000"); // More than contract has COMPY
      await inputToken.connect(user1).approve(grantsSwap.address, swapAmount);

      await expectRevert(
        grantsSwap.connect(user1).swapToCOMPY(swapAmount),
        "ERC20: transfer amount exceeds balance"
      );
    });
  });

  describe("View Functions", () => {
    it("should return correct COMPY balance", async () => {
      const balance = await grantsSwap.getCOMPYBalance();
      const expectedBalance = await compyToken.balanceOf(grantsSwap.address);
      assert.isTrue(balance.eq(expectedBalance));
    });

    it("should return correct input token balance", async () => {
      const balance = await grantsSwap.getInputTokenBalance();
      const expectedBalance = await inputToken.balanceOf(grantsSwap.address);
      assert.isTrue(balance.eq(expectedBalance));
    });
  });

  describe("Multiple Swaps", () => {
    it("should handle multiple swaps from different users", async () => {
      const user1SwapAmount = parseTokens18("1000"); // 1000 INPUT
      const user2SwapAmount = parseTokens18("500"); // 500 INPUT

      // User1 swaps input tokens for COMPY
      await inputToken.connect(user1).approve(grantsSwap.address, user1SwapAmount);
      await grantsSwap.connect(user1).swapToCOMPY(user1SwapAmount);

      // User2 swaps input tokens for COMPY
      await inputToken.connect(user2).approve(grantsSwap.address, user2SwapAmount);
      await grantsSwap.connect(user2).swapToCOMPY(user2SwapAmount);

      // Verify balances
      const user1COMPYBalance = await compyToken.balanceOf(user1.address);
      const user2COMPYBalance = await compyToken.balanceOf(user2.address);
      const contractCOMPYBalance = await compyToken.balanceOf(grantsSwap.address);

      // User1 should have 10k + 1k = 11k COMPY (initial 10k + swapped 1k)
      assert.isTrue(user1COMPYBalance.eq(parseTokens("11000")));
      // User2 should have 5k + 0.5k = 5.5k COMPY (initial 5k + swapped 0.5k)
      assert.isTrue(user2COMPYBalance.eq(parseTokens("5500")));
      // Contract should have 100k - 1k - 0.5k = 98.5k COMPY
      assert.isTrue(contractCOMPYBalance.eq(parseTokens("98500")));
    });
  });

  describe("swapToCOMPYwithPermit", () => {
    let permitToken; // Token that supports permit for testing

    beforeEach("deploy permit token and swap contract", async () => {
      // Deploy a GrantsToken as input token (it supports permit)
      const GrantsToken = await ethers.getContractFactory("GrantsToken");
      permitToken = await GrantsToken.deploy(parseTokens("1000000"), parseTokens("10000000"));
      await permitToken.deployed();

      // Deploy a new GrantsSwap with permit token
      const GrantsSwap = await ethers.getContractFactory("GrantsSwap");
      grantsSwap = await GrantsSwap.deploy(compyToken.address, permitToken.address);
      await grantsSwap.deployed();

      // Transfer some COMPY tokens to the swap contract
      const swapContractCOMPYBalance = parseTokens("100000"); // 100k COMPY
      await compyToken.transfer(grantsSwap.address, swapContractCOMPYBalance);

      // Transfer some permit tokens to user1
      const user1PermitBalance = parseTokens("10000"); // 10k permit tokens
      await permitToken.transfer(user1.address, user1PermitBalance);
    });

    it("should swap input tokens for COMPY using permit at 1:1 ratio", async () => {
      const swapAmount = parseTokens("1000"); // 1000 permit tokens (6 decimals)
      const compyAmount = parseTokens("1000"); // 1000 COMPY (6 decimals, same decimals = 1:1)

      // Get permit signature
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3600; // 1 hour from now
      const nonce = await permitToken.nonces(user1.address);

      const { v, r, s } = await signPermit(
        user1,
        permitToken,
        grantsSwap.address,
        swapAmount,
        deadline,
        nonce
      );

      // Get initial balances
      const user1COMPYBefore = await compyToken.balanceOf(user1.address);
      const user1PermitBefore = await permitToken.balanceOf(user1.address);
      const contractCOMPYBefore = await compyToken.balanceOf(grantsSwap.address);
      const contractPermitBefore = await permitToken.balanceOf(grantsSwap.address);

      // Perform swap with permit
      const tx = await grantsSwap.connect(user1).swapToCOMPYwithPermit(
        swapAmount,
        deadline,
        v,
        r,
        s
      );
      const txReceipt = await tx.wait();

      // Check balances after swap
      const user1COMPYAfter = await compyToken.balanceOf(user1.address);
      const user1PermitAfter = await permitToken.balanceOf(user1.address);
      const contractCOMPYAfter = await compyToken.balanceOf(grantsSwap.address);
      const contractPermitAfter = await permitToken.balanceOf(grantsSwap.address);

      // Verify balances
      assert.isTrue(user1COMPYAfter.sub(user1COMPYBefore).eq(compyAmount), "User COMPY balance should increase");
      assert.isTrue(user1PermitBefore.sub(user1PermitAfter).eq(swapAmount), "User permit token balance should decrease");
      assert.isTrue(contractCOMPYBefore.sub(contractCOMPYAfter).eq(compyAmount), "Contract COMPY balance should decrease");
      assert.isTrue(contractPermitAfter.sub(contractPermitBefore).eq(swapAmount), "Contract permit token balance should increase");

      // Check event
      const event = getEventFromTx(txReceipt, "Swap");
      assert(event, "Cannot find Swap event");
      assert.equal(event.args.user, user1.address);
      assert.isTrue(event.args.inputTokenAmount.eq(swapAmount));
      assert.isTrue(event.args.compyAmount.eq(compyAmount));

      // Verify allowance was set by permit
      const allowance = await permitToken.allowance(user1.address, grantsSwap.address);
      assert.isTrue(allowance.eq(0), "Allowance should be consumed after swap");
    });

    it("should revert if amount is zero", async () => {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3600;
      const nonce = await permitToken.nonces(user1.address);

      const { v, r, s } = await signPermit(
        user1,
        permitToken,
        grantsSwap.address,
        0,
        deadline,
        nonce
      );

      await expectRevert(
        grantsSwap.connect(user1).swapToCOMPYwithPermit(0, deadline, v, r, s),
        "GrantsSwap: amount must be greater than zero"
      );
    });

    it("should revert if permit deadline has expired", async () => {
      const swapAmount = parseTokens("1000");
      const block = await ethers.provider.getBlock("latest");
      const expiredDeadline = block.timestamp - 3600; // 1 hour ago
      const nonce = await permitToken.nonces(user1.address);

      const { v, r, s } = await signPermit(
        user1,
        permitToken,
        grantsSwap.address,
        swapAmount,
        expiredDeadline,
        nonce
      );

      await expectRevert(
        grantsSwap.connect(user1).swapToCOMPYwithPermit(
          swapAmount,
          expiredDeadline,
          v,
          r,
          s
        ),
        "ERC20Permit: expired deadline"
      );
    });

    it("should revert if permit signature is invalid", async () => {
      const swapAmount = parseTokens("1000");
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3600;
      const nonce = await permitToken.nonces(user1.address);

      // Sign with wrong signer (user2 instead of user1)
      const { v, r, s } = await signPermit(
        user2,
        permitToken,
        grantsSwap.address,
        swapAmount,
        deadline,
        nonce
      );

      await expectRevert(
        grantsSwap.connect(user1).swapToCOMPYwithPermit(
          swapAmount,
          deadline,
          v,
          r,
          s
        ),
        "ERC20Permit: invalid signature"
      );
    });

    it("should revert if contract has insufficient COMPY balance", async () => {
      const swapAmount = parseTokens("200000"); // More than contract has COMPY
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3600;
      const nonce = await permitToken.nonces(user1.address);

      // Give user1 enough permit tokens
      await permitToken.transfer(user1.address, swapAmount);

      const { v, r, s } = await signPermit(
        user1,
        permitToken,
        grantsSwap.address,
        swapAmount,
        deadline,
        nonce
      );

      await expectRevert(
        grantsSwap.connect(user1).swapToCOMPYwithPermit(
          swapAmount,
          deadline,
          v,
          r,
          s
        ),
        "ERC20: transfer amount exceeds balance"
      );
    });

    it("should work without prior approval", async () => {
      const swapAmount = parseTokens("1000");
      const compyAmount = parseTokens("1000");

      // Verify user1 has no allowance before
      const allowanceBefore = await permitToken.allowance(user1.address, grantsSwap.address);
      assert.isTrue(allowanceBefore.eq(0), "Should have no allowance initially");

      // Get permit signature
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3600;
      const nonce = await permitToken.nonces(user1.address);

      const { v, r, s } = await signPermit(
        user1,
        permitToken,
        grantsSwap.address,
        swapAmount,
        deadline,
        nonce
      );

      // Perform swap with permit (no prior approval needed)
      await grantsSwap.connect(user1).swapToCOMPYwithPermit(
        swapAmount,
        deadline,
        v,
        r,
        s
      );

      // Verify swap succeeded
      const user1COMPYBalance = await compyToken.balanceOf(user1.address);
      assert.isTrue(user1COMPYBalance.gte(compyAmount), "User should receive COMPY tokens");
    });
  });

  describe("withdrawTokens", () => {
    it("should allow owner to withdraw COMPY tokens", async () => {
      const withdrawAmount = parseTokens("10000"); // 10k COMPY
      const recipient = user2.address;

      // Get initial balances
      const contractBalanceBefore = await compyToken.balanceOf(grantsSwap.address);
      const recipientBalanceBefore = await compyToken.balanceOf(recipient);

      // Owner withdraws tokens
      const tx = await grantsSwap.connect(owner).withdrawTokens(
        compyToken.address,
        recipient,
        withdrawAmount
      );
      const txReceipt = await tx.wait();

      // Check balances after withdrawal
      const contractBalanceAfter = await compyToken.balanceOf(grantsSwap.address);
      const recipientBalanceAfter = await compyToken.balanceOf(recipient);

      // Verify balances
      assert.isTrue(contractBalanceBefore.sub(contractBalanceAfter).eq(withdrawAmount), "Contract balance should decrease");
      assert.isTrue(recipientBalanceAfter.sub(recipientBalanceBefore).eq(withdrawAmount), "Recipient balance should increase");

      // Check event
      const event = getEventFromTx(txReceipt, "Withdraw");
      assert(event, "Cannot find Withdraw event");
      assert.equal(event.args.token, compyToken.address);
      assert.equal(event.args.to, recipient);
      assert.isTrue(event.args.amount.eq(withdrawAmount));
    });

    it("should allow owner to withdraw input tokens", async () => {
      const withdrawAmount = parseTokens18("10000"); // 10k INPUT
      const recipient = user2.address;

      // Get initial balances
      const contractBalanceBefore = await inputToken.balanceOf(grantsSwap.address);
      const recipientBalanceBefore = await inputToken.balanceOf(recipient);

      // Owner withdraws tokens
      const tx = await grantsSwap.connect(owner).withdrawTokens(
        inputToken.address,
        recipient,
        withdrawAmount
      );
      const txReceipt = await tx.wait();

      // Check balances after withdrawal
      const contractBalanceAfter = await inputToken.balanceOf(grantsSwap.address);
      const recipientBalanceAfter = await inputToken.balanceOf(recipient);

      // Verify balances
      assert.isTrue(contractBalanceBefore.sub(contractBalanceAfter).eq(withdrawAmount), "Contract balance should decrease");
      assert.isTrue(recipientBalanceAfter.sub(recipientBalanceBefore).eq(withdrawAmount), "Recipient balance should increase");

      // Check event
      const event = getEventFromTx(txReceipt, "Withdraw");
      assert(event, "Cannot find Withdraw event");
      assert.equal(event.args.token, inputToken.address);
      assert.equal(event.args.to, recipient);
      assert.isTrue(event.args.amount.eq(withdrawAmount));
    });

    it("should revert if non-owner tries to withdraw", async () => {
      const withdrawAmount = parseTokens("1000");
      const recipient = user2.address;

      await expectRevert(
        grantsSwap.connect(user1).withdrawTokens(
          compyToken.address,
          recipient,
          withdrawAmount
        ),
        "Ownable: caller is not the owner"
      );
    });

    it("should revert if withdrawing to zero address", async () => {
      const withdrawAmount = parseTokens("1000");

      await expectRevert(
        grantsSwap.connect(owner).withdrawTokens(
          compyToken.address,
          ethers.constants.AddressZero,
          withdrawAmount
        ),
        "GrantsSwap: cannot withdraw to zero address"
      );
    });

    it("should revert if amount is zero", async () => {
      const recipient = user2.address;

      await expectRevert(
        grantsSwap.connect(owner).withdrawTokens(
          compyToken.address,
          recipient,
          0
        ),
        "GrantsSwap: amount must be greater than zero"
      );
    });

    it("should revert if token address is zero", async () => {
      const withdrawAmount = parseTokens("1000");
      const recipient = user2.address;

      await expectRevert(
        grantsSwap.connect(owner).withdrawTokens(
          ethers.constants.AddressZero,
          recipient,
          withdrawAmount
        ),
        "GrantsSwap: token address cannot be zero"
      );
    });

    it("should revert if contract has insufficient balance", async () => {
      const withdrawAmount = parseTokens("200000"); // More than contract has
      const recipient = user2.address;

      await expectRevert(
        grantsSwap.connect(owner).withdrawTokens(
          compyToken.address,
          recipient,
          withdrawAmount
        ),
        "ERC20: transfer amount exceeds balance"
      );
    });

    it("should allow owner to withdraw any ERC20 token", async () => {
      // Deploy a random ERC20 token
      const MockERC20Decimals = await ethers.getContractFactory("MockERC20Decimals");
      const randomToken = await MockERC20Decimals.deploy("Random Token", "RAND", 18);
      await randomToken.deployed();

      // Transfer some tokens to the swap contract
      const amount = parseTokens18("5000");
      await randomToken.transfer(grantsSwap.address, amount);

      // Owner withdraws the random token
      const recipient = user2.address;
      await grantsSwap.connect(owner).withdrawTokens(
        randomToken.address,
        recipient,
        amount
      );

      // Verify recipient received the tokens
      const recipientBalance = await randomToken.balanceOf(recipient);
      assert.isTrue(recipientBalance.eq(amount), "Recipient should receive the random token");
    });
  });
});
