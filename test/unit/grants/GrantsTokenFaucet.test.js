/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach, before */
const hre = require("hardhat");
const ethers = hre.ethers;
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const { getEventFromTx } = require("../../helpers/utils");

// Helper function to create values with 6 decimals
function parseTokens(amount) {
  return ethers.utils.parseUnits(amount.toString(), 6);
}

// Helper function to sign a message for the faucet (similar to ERC20Template.test.js)
// Uses ethers signer.signMessage which works with Hardhat (web3.eth.sign requires external node)
async function signFaucetMessage(signer, faucetAddress, userAddress, nonce, amount) {
  // Create the message hash: keccak256(abi.encode(faucetAddress, userAddress, nonce, amount))
  // Updated to match contract: includes contract address to prevent cross-contract replay
  // Use defaultAbiCoder.encode to match contract's abi.encode exactly
  const encoded = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "uint256", "uint256"],
    [faucetAddress, userAddress, nonce, amount]
  );
  const messageHash = ethers.utils.keccak256(encoded);
  
  // signer.signMessage automatically adds "\x19Ethereum Signed Message:\n32" prefix (like web3.eth.sign)
  // This creates: keccak256("\x19Ethereum Signed Message:\n32" + messageHash)
  // Which matches exactly what the contract creates as ethSignedMessageHash
  const signedMessage = await signer.signMessage(ethers.utils.arrayify(messageHash));
  
  // Extract r, s, v from signature (same pattern as ERC20Template.test.js)
  const sig = signedMessage.substr(2); // remove 0x
  const r = '0x' + sig.slice(0, 64);
  const s = '0x' + sig.slice(64, 128);
  const v = '0x' + sig.slice(128, 130);
  
  // Convert to bytes format expected by contract (65 bytes: 32 + 32 + 1)
  const signature = ethers.utils.concat([
    r,
    s,
    v
  ]);
  
  return signature;
}

describe("GrantsTokenFaucet", () => {
  let grantsToken;
  let faucet;
  let owner;
  let signer;
  let user;
  let other;
  let assert;
  let expect;

  const INITIAL_SUPPLY = parseTokens("1000000"); // 1 million tokens
  const TOKEN_CAP = parseTokens("10000000"); // 10 million tokens
  const FAUCET_AMOUNT = parseTokens("100000"); // 100k tokens for faucet

  before("setup test helpers", async function () {
    // Dynamic import of chai to handle ESM module
    const chai = await import("chai");
    assert = chai.assert;
    expect = chai.expect;
  });

  beforeEach("deploy contracts", async () => {
    [owner, signer, user, other] = await ethers.getSigners();

    // Deploy GrantsToken
    const GrantsToken = await ethers.getContractFactory("GrantsToken");
    grantsToken = await GrantsToken.deploy(INITIAL_SUPPLY, TOKEN_CAP);
    await grantsToken.deployed();

    // Deploy GrantsTokenFaucet
    const GrantsTokenFaucet = await ethers.getContractFactory("GrantsTokenFaucet");
    faucet = await GrantsTokenFaucet.deploy(grantsToken.address, signer.address);
    await faucet.deployed();

    // Transfer tokens to faucet
    await grantsToken.transfer(faucet.address, FAUCET_AMOUNT);
  });

  describe("Deployment", () => {
    it("should set correct token address", async () => {
      const tokenAddress = await faucet.token();
      assert.equal(tokenAddress, grantsToken.address);
    });

    it("should set correct signer address", async () => {
      const signerAddress = await faucet.getSigner();
      assert.equal(signerAddress, signer.address);
    });

    it("should set owner correctly", async () => {
      const contractOwner = await faucet.owner();
      assert.equal(contractOwner, owner.address);
    });

    it("should revert if token address is zero", async () => {
      const GrantsTokenFaucet = await ethers.getContractFactory("GrantsTokenFaucet");
      await expectRevert(
        GrantsTokenFaucet.deploy(
          "0x0000000000000000000000000000000000000000",
          signer.address
        ),
        "GrantsTokenFaucet: invalid token address"
      );
    });

    it("should revert if signer address is zero", async () => {
      const GrantsTokenFaucet = await ethers.getContractFactory("GrantsTokenFaucet");
      await expectRevert(
        GrantsTokenFaucet.deploy(
          grantsToken.address,
          "0x0000000000000000000000000000000000000000"
        ),
        "GrantsTokenFaucet: invalid signer address"
      );
    });
  });

  describe("Claim", () => {
    it("should allow user to claim tokens with valid signature", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");
      const initialBalance = await grantsToken.balanceOf(user.address);

      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      const tx = await faucet.connect(user).claim(user.address, nonce, amount, signature);
      const txReceipt = await tx.wait();

      const finalBalance = await grantsToken.balanceOf(user.address);
      assert.isTrue(finalBalance.eq(initialBalance.add(amount)));

      // Check event
      const event = getEventFromTx(txReceipt, "TokensClaimed");
      assert(event, "Cannot find TokensClaimed event");
      assert.equal(event.args.user, user.address);
      assert.isTrue(event.args.nonce.eq(nonce));
      assert.isTrue(event.args.amount.eq(amount));
    });

    it("should update user nonce after claim", async () => {
      const nonce1 = 1;
      const nonce2 = 2;
      const amount = parseTokens("1000");

      // First claim
      const signature1 = await signFaucetMessage(signer, faucet.address, user.address, nonce1, amount);
      await faucet.connect(user).claim(user.address, nonce1, amount, signature1);

      const userNonce1 = await faucet.userNonces(user.address);
      assert.isTrue(userNonce1.eq(nonce1));

      // Second claim with higher nonce
      const signature2 = await signFaucetMessage(signer, faucet.address, user.address, nonce2, amount);
      await faucet.connect(user).claim(user.address, nonce2, amount, signature2);

      const userNonce2 = await faucet.userNonces(user.address);
      assert.isTrue(userNonce2.eq(nonce2));
    });

    it("should allow multiple claims with increasing nonces", async () => {
      const amount = parseTokens("1000");
      const initialBalance = await grantsToken.balanceOf(user.address);

      // Claim with nonce 1
      const signature1 = await signFaucetMessage(signer, faucet.address, user.address, 1, amount);
      await faucet.connect(user).claim(user.address, 1, amount, signature1);

      // Claim with nonce 2
      const signature2 = await signFaucetMessage(signer, faucet.address, user.address, 2, amount);
      await faucet.connect(user).claim(user.address, 2, amount, signature2);

      // Claim with nonce 3
      const signature3 = await signFaucetMessage(signer, faucet.address, user.address, 3, amount);
      await faucet.connect(user).claim(user.address, 3, amount, signature3);

      const finalBalance = await grantsToken.balanceOf(user.address);
      assert.isTrue(finalBalance.eq(initialBalance.add(amount.mul(3))));
    });

    it("should revert if nonce is not greater than last used nonce", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");
      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      // First claim succeeds
      await faucet.connect(user).claim(user.address, nonce, amount, signature);

      // Second claim with same nonce should fail
      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, signature),
        "GrantsTokenFaucet: nonce must be greater than last used nonce"
      );
    });

    it("should revert if nonce is less than last used nonce", async () => {
      const amount = parseTokens("1000");
      
      // Claim with nonce 5
      const signature5 = await signFaucetMessage(signer, faucet.address, user.address, 5, amount);
      await faucet.connect(user).claim(user.address, 5, amount, signature5);

      // Try to claim with nonce 3 (should fail)
      const signature3 = await signFaucetMessage(signer, faucet.address, user.address, 3, amount);
      await expectRevert(
        faucet.connect(user).claim(user.address, 3, amount, signature3),
        "GrantsTokenFaucet: nonce must be greater than last used nonce"
      );
    });

    it("should revert if signature is invalid", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");
      
      // Sign with wrong signer
      const wrongSignature = await signFaucetMessage(other, faucet.address, user.address, nonce, amount);

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, wrongSignature),
        "GrantsTokenFaucet: invalid signature"
      );
    });

    it("should revert if signature is for different user", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");
      
      // Sign for different user
      const signature = await signFaucetMessage(signer, faucet.address, other.address, nonce, amount);

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, signature),
        "GrantsTokenFaucet: invalid signature"
      );
    });

    it("should revert if signature is for different nonce", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");
      
      // Sign for different nonce
      const signature = await signFaucetMessage(signer, faucet.address, user.address, 2, amount);

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, signature),
        "GrantsTokenFaucet: invalid signature"
      );
    });

    it("should revert if signature is for different amount", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");
      const differentAmount = parseTokens("2000");
      
      // Sign for different amount
      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, differentAmount);

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, signature),
        "GrantsTokenFaucet: invalid signature"
      );
    });

    it("should revert if amount is zero", async () => {
      const nonce = 1;
      const amount = 0;
      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, signature),
        "GrantsTokenFaucet: amount must be greater than zero"
      );
    });

    it("should revert if user address is zero", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");
      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      await expectRevert(
        faucet.connect(user).claim(
          "0x0000000000000000000000000000000000000000",
          nonce,
          amount,
          signature
        ),
        "GrantsTokenFaucet: invalid user address"
      );
    });

    it("should revert if signature length is invalid", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");
      const invalidSignature = "0x1234"; // Too short

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, invalidSignature),
        "GrantsTokenFaucet: invalid signature length"
      );
    });

    it("should allow different users to claim independently", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");

      // User 1 claims
      const signature1 = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);
      await faucet.connect(user).claim(user.address, nonce, amount, signature1);

      // User 2 claims with same nonce (should work, nonces are per-user)
      const signature2 = await signFaucetMessage(signer, faucet.address, other.address, nonce, amount);
      await faucet.connect(other).claim(other.address, nonce, amount, signature2);

      const user1Nonce = await faucet.userNonces(user.address);
      const user2Nonce = await faucet.userNonces(other.address);
      assert.isTrue(user1Nonce.eq(nonce));
      assert.isTrue(user2Nonce.eq(nonce));
    });

    it("should allow anyone to call claim for any user", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");
      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      // Other user calls claim for user
      await faucet.connect(other).claim(user.address, nonce, amount, signature);

      const balance = await grantsToken.balanceOf(user.address);
      assert.isTrue(balance.eq(amount));
    });
  });

  describe("setSigner", () => {
    it("should allow owner to change signer", async () => {
      const newSigner = other;
      const tx = await faucet.setSigner(newSigner.address);
      const txReceipt = await tx.wait();

      const currentSigner = await faucet.getSigner();
      assert.equal(currentSigner, newSigner.address);

      // Check event
      const event = getEventFromTx(txReceipt, "SignerChanged");
      assert(event, "Cannot find SignerChanged event");
      assert.equal(event.args.oldSigner, signer.address);
      assert.equal(event.args.newSigner, newSigner.address);
    });

    it("should allow claims with new signer after change", async () => {
      const newSigner = other;
      await faucet.setSigner(newSigner.address);

      const nonce = 1;
      const amount = parseTokens("1000");
      const signature = await signFaucetMessage(newSigner, faucet.address, user.address, nonce, amount);

      await faucet.connect(user).claim(user.address, nonce, amount, signature);

      const balance = await grantsToken.balanceOf(user.address);
      assert.isTrue(balance.eq(amount));
    });

    it("should reject claims with old signer after change", async () => {
      const newSigner = other;
      await faucet.setSigner(newSigner.address);

      const nonce = 1;
      const amount = parseTokens("1000");
      const oldSignature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, oldSignature),
        "GrantsTokenFaucet: invalid signature"
      );
    });

    it("should revert if non-owner tries to change signer", async () => {
      await expectRevert(
        faucet.connect(user).setSigner(other.address),
        "Ownable: caller is not the owner"
      );
    });

    it("should revert if new signer is zero address", async () => {
      await expectRevert(
        faucet.setSigner("0x0000000000000000000000000000000000000000"),
        "GrantsTokenFaucet: invalid signer address"
      );
    });

    it("should revert if new signer is same as current signer", async () => {
      await expectRevert(
        faucet.setSigner(signer.address),
        "GrantsTokenFaucet: signer is already set to this address"
      );
    });
  });

  describe("getUserNonce", () => {
    it("should return zero for new user", async () => {
      const nonce = await faucet.getUserNonce(user.address);
      assert.isTrue(nonce.eq(0));
    });

    it("should return correct nonce after claim", async () => {
      const nonce = 5;
      const amount = parseTokens("1000");
      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      await faucet.connect(user).claim(user.address, nonce, amount, signature);

      const userNonce = await faucet.getUserNonce(user.address);
      assert.isTrue(userNonce.eq(nonce));
    });
  });

  describe("withdrawTokens", () => {
    it("should allow owner to withdraw tokens", async () => {
      const withdrawAmount = parseTokens("10000");
      const initialOwnerBalance = await grantsToken.balanceOf(owner.address);

      await faucet.withdrawTokens(withdrawAmount);

      const finalOwnerBalance = await grantsToken.balanceOf(owner.address);
      assert.isTrue(finalOwnerBalance.eq(initialOwnerBalance.add(withdrawAmount)));
    });

    it("should revert if non-owner tries to withdraw", async () => {
      const withdrawAmount = parseTokens("10000");
      await expectRevert(
        faucet.connect(user).withdrawTokens(withdrawAmount),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("withdrawAllTokens", () => {
    it("should allow owner to withdraw all tokens", async () => {
      const initialOwnerBalance = await grantsToken.balanceOf(owner.address);
      const faucetBalance = await grantsToken.balanceOf(faucet.address);

      await faucet.withdrawAllTokens();

      const finalOwnerBalance = await grantsToken.balanceOf(owner.address);
      const finalFaucetBalance = await grantsToken.balanceOf(faucet.address);

      assert.isTrue(finalOwnerBalance.eq(initialOwnerBalance.add(faucetBalance)));
      assert.isTrue(finalFaucetBalance.eq(0));
    });

    it("should revert if non-owner tries to withdraw all", async () => {
      await expectRevert(
        faucet.connect(user).withdrawAllTokens(),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle large nonce values", async () => {
      const nonce = ethers.BigNumber.from("2").pow(256).sub(1);
      const amount = parseTokens("1000");
      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      await faucet.connect(user).claim(user.address, nonce, amount, signature);

      const userNonce = await faucet.getUserNonce(user.address);
      assert.isTrue(userNonce.eq(nonce));
    });

    it("should handle large amount values", async () => {
      const nonce = 1;
      const amount = FAUCET_AMOUNT; // Use all faucet balance
      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      await faucet.connect(user).claim(user.address, nonce, amount, signature);

      const balance = await grantsToken.balanceOf(user.address);
      assert.isTrue(balance.eq(amount));
    });

    it("should revert if claiming more than faucet balance", async () => {
      const nonce = 1;
      const amount = FAUCET_AMOUNT.add(1); // More than faucet has
      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, signature),
        "ERC20: transfer amount exceeds balance"
      );
    });
  });
});
