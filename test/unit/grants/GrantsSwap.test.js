/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach, before */
const hre = require("hardhat");
const ethers = hre.ethers;
const { getEventFromTx } = require("../../helpers/utils");

function parseTokens(amount) {
  return ethers.utils.parseUnits(amount.toString(), 6);
}

function parseTokens18(amount) {
  return ethers.utils.parseUnits(amount.toString(), 18);
}

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
      throw new Error(`Expected revert "${expectedMessage}" but got: "${msg}"`);
    }
  }
}

async function deployGrantsToken(initialSupply, cap, ownerAddress) {
  const GrantsToken = await ethers.getContractFactory("GrantsToken");
  const impl = await GrantsToken.deploy();
  await impl.deployed();

  const initData = impl.interface.encodeFunctionData("initialize", [
    initialSupply,
    cap,
    ownerAddress,
  ]);
  const ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await ProxyFactory.deploy(impl.address, initData);
  await proxy.deployed();

  return GrantsToken.attach(proxy.address);
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

describe("GrantsSwap", () => {
  let grantsSwap;
  let compyToken;
  let inputToken;
  let owner;
  let user1;
  let user2;
  let assert;
  let expect;

  const INITIAL_SUPPLY = parseTokens("1000000");
  const TOKEN_CAP = parseTokens("10000000");
  const INPUT_TOKEN_SUPPLY = parseTokens18("1000000");

  before("setup test helpers", async function () {
    const chai = await import("chai");
    assert = chai.assert;
    expect = chai.expect;
  });

  beforeEach("deploy contracts", async () => {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy COMPY token via UUPS proxy
    compyToken = await deployGrantsToken(INITIAL_SUPPLY, TOKEN_CAP, owner.address);

    // Deploy a mock ERC20 token as input token (standard, no allowlist)
    const MockERC20Decimals = await ethers.getContractFactory("MockERC20Decimals");
    inputToken = await MockERC20Decimals.deploy("Input Token", "INPUT", 18);
    await inputToken.deployed();

    // Deploy GrantsSwap
    const GrantsSwap = await ethers.getContractFactory("GrantsSwap");
    grantsSwap = await GrantsSwap.deploy(compyToken.address, inputToken.address);
    await grantsSwap.deployed();

    // Add to compyToken allowlist:
    // - owner: for initial token distributions
    // - grantsSwap: for sending COMPY to users during swaps and withdrawals
    await compyToken.addToAllowlist(owner.address);
    await compyToken.addToAllowlist(grantsSwap.address);

    // Fund the swap contract and test users
    await compyToken.transfer(grantsSwap.address, parseTokens("100000"));
    await inputToken.transfer(grantsSwap.address, parseTokens18("100000"));
    await compyToken.transfer(user1.address, parseTokens("10000"));
    await inputToken.transfer(user1.address, parseTokens18("10000"));
    await compyToken.transfer(user2.address, parseTokens("5000"));
    await inputToken.transfer(user2.address, parseTokens18("5000"));
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
      const swapAmount = parseTokens18("1000");
      const compyAmount = parseTokens("1000");

      await inputToken.connect(user1).approve(grantsSwap.address, swapAmount);

      const user1COMPYBefore = await compyToken.balanceOf(user1.address);
      const user1InputBefore = await inputToken.balanceOf(user1.address);
      const contractCOMPYBefore = await compyToken.balanceOf(grantsSwap.address);
      const contractInputBefore = await inputToken.balanceOf(grantsSwap.address);

      const tx = await grantsSwap.connect(user1).swapToCOMPY(swapAmount);
      const txReceipt = await tx.wait();

      const user1COMPYAfter = await compyToken.balanceOf(user1.address);
      const user1InputAfter = await inputToken.balanceOf(user1.address);
      const contractCOMPYAfter = await compyToken.balanceOf(grantsSwap.address);
      const contractInputAfter = await inputToken.balanceOf(grantsSwap.address);

      assert.isTrue(user1COMPYAfter.sub(user1COMPYBefore).eq(compyAmount), "User COMPY balance should increase");
      assert.isTrue(user1InputBefore.sub(user1InputAfter).eq(swapAmount), "User input token balance should decrease");
      assert.isTrue(contractCOMPYBefore.sub(contractCOMPYAfter).eq(compyAmount), "Contract COMPY balance should decrease");
      assert.isTrue(contractInputAfter.sub(contractInputBefore).eq(swapAmount), "Contract input token balance should increase");

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
      const swapAmount = parseTokens18("50000");
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
      const swapAmount = parseTokens18("200000");
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
      const user1SwapAmount = parseTokens18("1000");
      const user2SwapAmount = parseTokens18("500");

      await inputToken.connect(user1).approve(grantsSwap.address, user1SwapAmount);
      await grantsSwap.connect(user1).swapToCOMPY(user1SwapAmount);

      await inputToken.connect(user2).approve(grantsSwap.address, user2SwapAmount);
      await grantsSwap.connect(user2).swapToCOMPY(user2SwapAmount);

      const user1COMPYBalance = await compyToken.balanceOf(user1.address);
      const user2COMPYBalance = await compyToken.balanceOf(user2.address);
      const contractCOMPYBalance = await compyToken.balanceOf(grantsSwap.address);

      assert.isTrue(user1COMPYBalance.eq(parseTokens("11000")));
      assert.isTrue(user2COMPYBalance.eq(parseTokens("5500")));
      assert.isTrue(contractCOMPYBalance.eq(parseTokens("98500")));
    });
  });

  describe("swapToCOMPYwithPermit", () => {
    let permitToken;

    beforeEach("deploy permit token and new swap contract", async () => {
      // Deploy a GrantsToken as the permit-capable input token
      permitToken = await deployGrantsToken(
        parseTokens("1000000"),
        parseTokens("10000000"),
        owner.address
      );

      // Deploy a new GrantsSwap instance that uses permitToken as input
      const GrantsSwap = await ethers.getContractFactory("GrantsSwap");
      grantsSwap = await GrantsSwap.deploy(compyToken.address, permitToken.address);
      await grantsSwap.deployed();

      // Update compyToken allowlist: add the new grantsSwap so it can send COMPY to users
      await compyToken.addToAllowlist(grantsSwap.address);

      // Set up permitToken allowlist:
      // - owner: for the initial distribution transfer to user1
      // - grantsSwap: so any user can safeTransferFrom into the swap contract
      await permitToken.addToAllowlist(owner.address);
      await permitToken.addToAllowlist(grantsSwap.address);

      // Fund new swap contract with COMPY (owner is on compyToken allowlist)
      await compyToken.transfer(grantsSwap.address, parseTokens("100000"));

      // Give user1 some permit tokens (owner is on permitToken allowlist)
      await permitToken.transfer(user1.address, parseTokens("10000"));
    });

    it("should swap input tokens for COMPY using permit at 1:1 ratio", async () => {
      const swapAmount = parseTokens("1000");
      const compyAmount = parseTokens("1000");

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

      const user1COMPYBefore = await compyToken.balanceOf(user1.address);
      const user1PermitBefore = await permitToken.balanceOf(user1.address);
      const contractCOMPYBefore = await compyToken.balanceOf(grantsSwap.address);
      const contractPermitBefore = await permitToken.balanceOf(grantsSwap.address);

      const tx = await grantsSwap.connect(user1).swapToCOMPYwithPermit(
        swapAmount,
        deadline,
        v,
        r,
        s
      );
      const txReceipt = await tx.wait();

      const user1COMPYAfter = await compyToken.balanceOf(user1.address);
      const user1PermitAfter = await permitToken.balanceOf(user1.address);
      const contractCOMPYAfter = await compyToken.balanceOf(grantsSwap.address);
      const contractPermitAfter = await permitToken.balanceOf(grantsSwap.address);

      assert.isTrue(user1COMPYAfter.sub(user1COMPYBefore).eq(compyAmount), "User COMPY balance should increase");
      assert.isTrue(user1PermitBefore.sub(user1PermitAfter).eq(swapAmount), "User permit token balance should decrease");
      assert.isTrue(contractCOMPYBefore.sub(contractCOMPYAfter).eq(compyAmount), "Contract COMPY balance should decrease");
      assert.isTrue(contractPermitAfter.sub(contractPermitBefore).eq(swapAmount), "Contract permit token balance should increase");

      const event = getEventFromTx(txReceipt, "Swap");
      assert(event, "Cannot find Swap event");
      assert.equal(event.args.user, user1.address);
      assert.isTrue(event.args.inputTokenAmount.eq(swapAmount));
      assert.isTrue(event.args.compyAmount.eq(compyAmount));

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
      const expiredDeadline = block.timestamp - 3600;
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
        grantsSwap.connect(user1).swapToCOMPYwithPermit(swapAmount, expiredDeadline, v, r, s),
        "ERC20Permit: expired deadline"
      );
    });

    it("should revert if permit signature is invalid", async () => {
      const swapAmount = parseTokens("1000");
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3600;
      const nonce = await permitToken.nonces(user1.address);

      // Sign with wrong signer
      const { v, r, s } = await signPermit(
        user2,
        permitToken,
        grantsSwap.address,
        swapAmount,
        deadline,
        nonce
      );

      await expectRevert(
        grantsSwap.connect(user1).swapToCOMPYwithPermit(swapAmount, deadline, v, r, s),
        "ERC20Permit: invalid signature"
      );
    });

    it("should revert if contract has insufficient COMPY balance", async () => {
      const swapAmount = parseTokens("200000");
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3600;
      const nonce = await permitToken.nonces(user1.address);

      // Give user1 enough permit tokens (owner is on permitToken allowlist)
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
        grantsSwap.connect(user1).swapToCOMPYwithPermit(swapAmount, deadline, v, r, s),
        "ERC20: transfer amount exceeds balance"
      );
    });

    it("should work without prior approval", async () => {
      const swapAmount = parseTokens("1000");
      const compyAmount = parseTokens("1000");

      const allowanceBefore = await permitToken.allowance(user1.address, grantsSwap.address);
      assert.isTrue(allowanceBefore.eq(0), "Should have no allowance initially");

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

      await grantsSwap.connect(user1).swapToCOMPYwithPermit(swapAmount, deadline, v, r, s);

      const user1COMPYBalance = await compyToken.balanceOf(user1.address);
      assert.isTrue(user1COMPYBalance.gte(compyAmount), "User should receive COMPY tokens");
    });
  });

  describe("withdrawTokens", () => {
    it("should allow owner to withdraw COMPY tokens", async () => {
      const withdrawAmount = parseTokens("10000");
      const recipient = user2.address;

      const contractBalanceBefore = await compyToken.balanceOf(grantsSwap.address);
      const recipientBalanceBefore = await compyToken.balanceOf(recipient);

      const tx = await grantsSwap.connect(owner).withdrawTokens(
        compyToken.address,
        recipient,
        withdrawAmount
      );
      const txReceipt = await tx.wait();

      const contractBalanceAfter = await compyToken.balanceOf(grantsSwap.address);
      const recipientBalanceAfter = await compyToken.balanceOf(recipient);

      assert.isTrue(contractBalanceBefore.sub(contractBalanceAfter).eq(withdrawAmount), "Contract balance should decrease");
      assert.isTrue(recipientBalanceAfter.sub(recipientBalanceBefore).eq(withdrawAmount), "Recipient balance should increase");

      const event = getEventFromTx(txReceipt, "Withdraw");
      assert(event, "Cannot find Withdraw event");
      assert.equal(event.args.token, compyToken.address);
      assert.equal(event.args.to, recipient);
      assert.isTrue(event.args.amount.eq(withdrawAmount));
    });

    it("should allow owner to withdraw input tokens", async () => {
      const withdrawAmount = parseTokens18("10000");
      const recipient = user2.address;

      const contractBalanceBefore = await inputToken.balanceOf(grantsSwap.address);
      const recipientBalanceBefore = await inputToken.balanceOf(recipient);

      const tx = await grantsSwap.connect(owner).withdrawTokens(
        inputToken.address,
        recipient,
        withdrawAmount
      );
      const txReceipt = await tx.wait();

      const contractBalanceAfter = await inputToken.balanceOf(grantsSwap.address);
      const recipientBalanceAfter = await inputToken.balanceOf(recipient);

      assert.isTrue(contractBalanceBefore.sub(contractBalanceAfter).eq(withdrawAmount), "Contract balance should decrease");
      assert.isTrue(recipientBalanceAfter.sub(recipientBalanceBefore).eq(withdrawAmount), "Recipient balance should increase");

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
        grantsSwap.connect(owner).withdrawTokens(compyToken.address, recipient, 0),
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
      const withdrawAmount = parseTokens("200000");
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
      const MockERC20Decimals = await ethers.getContractFactory("MockERC20Decimals");
      const randomToken = await MockERC20Decimals.deploy("Random Token", "RAND", 18);
      await randomToken.deployed();

      const amount = parseTokens18("5000");
      await randomToken.transfer(grantsSwap.address, amount);

      const recipient = user2.address;
      await grantsSwap.connect(owner).withdrawTokens(randomToken.address, recipient, amount);

      const recipientBalance = await randomToken.balanceOf(recipient);
      assert.isTrue(recipientBalance.eq(amount), "Recipient should receive the random token");
    });
  });
});
