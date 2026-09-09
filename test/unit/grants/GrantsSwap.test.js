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
  const RATE_UNIT = parseTokens18("1"); // 1e18 == 1:1 ratio

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
    grantsSwap = await GrantsSwap.deploy(compyToken.address, inputToken.address, RATE_UNIT);
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
        GrantsSwap.deploy(ethers.constants.AddressZero, inputToken.address, RATE_UNIT),
        "GrantsSwap: COMPY token cannot be zero address"
      );
    });

    it("should revert if input token is zero address", async () => {
      const GrantsSwap = await ethers.getContractFactory("GrantsSwap");
      await expectRevert(
        GrantsSwap.deploy(compyToken.address, ethers.constants.AddressZero, RATE_UNIT),
        "GrantsSwap: input token cannot be zero address"
      );
    });

    it("should revert if both tokens are the same", async () => {
      const GrantsSwap = await ethers.getContractFactory("GrantsSwap");
      await expectRevert(
        GrantsSwap.deploy(compyToken.address, compyToken.address, RATE_UNIT),
        "GrantsSwap: tokens must be different"
      );
    });

    it("should revert if initial rate is zero", async () => {
      const GrantsSwap = await ethers.getContractFactory("GrantsSwap");
      await expectRevert(
        GrantsSwap.deploy(compyToken.address, inputToken.address, 0),
        "GrantsSwap: rate must be greater than zero"
      );
    });

    it("should set the initial rate correctly", async () => {
      const currentRate = await grantsSwap.rate();
      assert.isTrue(currentRate.eq(RATE_UNIT));
    });

    it("should set owner correctly", async () => {
      const contractOwner = await grantsSwap.owner();
      assert.equal(contractOwner, owner.address);
    });
  });

  describe("setRate", () => {
    it("should allow owner to update the rate and emit RateChanged", async () => {
      const newRate = parseTokens18("2");

      const tx = await grantsSwap.connect(owner).setRate(newRate);
      const txReceipt = await tx.wait();

      const currentRate = await grantsSwap.rate();
      assert.isTrue(currentRate.eq(newRate));

      const event = getEventFromTx(txReceipt, "RateChanged");
      assert(event, "Cannot find RateChanged event");
      assert.isTrue(event.args.oldRate.eq(RATE_UNIT));
      assert.isTrue(event.args.newRate.eq(newRate));
    });

    it("should revert if new rate is zero", async () => {
      await expectRevert(
        grantsSwap.connect(owner).setRate(0),
        "GrantsSwap: rate must be greater than zero"
      );
    });

    it("should revert if non-owner tries to set the rate", async () => {
      await expectRevert(
        grantsSwap.connect(user1).setRate(parseTokens18("2")),
        "Ownable: caller is not the owner"
      );
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
    it("should return the current rate via getRate", async () => {
      let currentRate = await grantsSwap.getRate();
      assert.isTrue(currentRate.eq(RATE_UNIT));

      const newRate = parseTokens18("5");
      await grantsSwap.connect(owner).setRate(newRate);
      currentRate = await grantsSwap.getRate();
      assert.isTrue(currentRate.eq(newRate));
    });

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

  describe("Variable rate swaps", () => {
    it("should swap at a 2:1 rate", async () => {
      await grantsSwap.connect(owner).setRate(parseTokens18("2"));

      const swapAmount = parseTokens18("1000");
      const expectedCompy = parseTokens("2000");

      await inputToken.connect(user1).approve(grantsSwap.address, swapAmount);

      const quoted = await grantsSwap.getCompyAmount(swapAmount);
      assert.isTrue(quoted.eq(expectedCompy), "Quote should match expected COMPY");

      const before = await compyToken.balanceOf(user1.address);
      const tx = await grantsSwap.connect(user1).swapToCOMPY(swapAmount);
      const txReceipt = await tx.wait();
      const after = await compyToken.balanceOf(user1.address);

      assert.isTrue(after.sub(before).eq(expectedCompy), "User should receive 2x COMPY");

      const event = getEventFromTx(txReceipt, "Swap");
      assert.isTrue(event.args.compyAmount.eq(expectedCompy));
    });

    it("should swap at a 0.5:1 rate", async () => {
      await grantsSwap.connect(owner).setRate(parseTokens18("0.5"));

      const swapAmount = parseTokens18("1000");
      const expectedCompy = parseTokens("500");

      await inputToken.connect(user1).approve(grantsSwap.address, swapAmount);

      const quoted = await grantsSwap.getCompyAmount(swapAmount);
      assert.isTrue(quoted.eq(expectedCompy), "Quote should match expected COMPY");

      const before = await compyToken.balanceOf(user1.address);
      await grantsSwap.connect(user1).swapToCOMPY(swapAmount);
      const after = await compyToken.balanceOf(user1.address);

      assert.isTrue(after.sub(before).eq(expectedCompy), "User should receive half COMPY");
    });

    it("should revert if the output amount rounds down to zero", async () => {
      // 18-decimal input to 6-decimal COMPY at 1:1: amounts below 1e12 round to 0
      const dustAmount = ethers.BigNumber.from("1");
      await inputToken.connect(user1).approve(grantsSwap.address, dustAmount);

      const quoted = await grantsSwap.getCompyAmount(dustAmount);
      assert.isTrue(quoted.eq(0), "Dust amount should quote to zero COMPY");

      await expectRevert(
        grantsSwap.connect(user1).swapToCOMPY(dustAmount),
        "GrantsSwap: output amount must be greater than zero"
      );
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
      grantsSwap = await GrantsSwap.deploy(compyToken.address, permitToken.address, RATE_UNIT);
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

    it("should swap using permit at a 2:1 rate", async () => {
      await grantsSwap.connect(owner).setRate(parseTokens18("2"));

      const swapAmount = parseTokens("1000");
      const expectedCompy = parseTokens("2000");

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

      const before = await compyToken.balanceOf(user1.address);
      const tx = await grantsSwap.connect(user1).swapToCOMPYwithPermit(
        swapAmount,
        deadline,
        v,
        r,
        s
      );
      const txReceipt = await tx.wait();
      const after = await compyToken.balanceOf(user1.address);

      assert.isTrue(after.sub(before).eq(expectedCompy), "User should receive 2x COMPY");

      const event = getEventFromTx(txReceipt, "Swap");
      assert.isTrue(event.args.compyAmount.eq(expectedCompy));
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
