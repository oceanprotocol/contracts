/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach, before */
const hre = require("hardhat");
const ethers = hre.ethers;
const { getEventFromTx } = require("../../helpers/utils");

function parseTokens(amount) {
  return ethers.utils.parseUnits(amount.toString(), 6);
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

async function signFaucetMessage(signer, faucetAddress, userAddress, nonce, amount) {
  const encoded = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "uint256", "uint256"],
    [faucetAddress, userAddress, nonce, amount]
  );
  const messageHash = ethers.utils.keccak256(encoded);
  const signedMessage = await signer.signMessage(ethers.utils.arrayify(messageHash));

  const sig = signedMessage.substr(2);
  const r = "0x" + sig.slice(0, 64);
  const s = "0x" + sig.slice(64, 128);
  const v = "0x" + sig.slice(128, 130);

  return ethers.utils.concat([r, s, v]);
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

  const INITIAL_SUPPLY = parseTokens("1000000");
  const TOKEN_CAP = parseTokens("10000000");
  const FAUCET_AMOUNT = parseTokens("100000");

  before("setup test helpers", async function () {
    const chai = await import("chai");
    assert = chai.assert;
    expect = chai.expect;
  });

  beforeEach("deploy contracts", async () => {
    [owner, signer, user, other] = await ethers.getSigners();

    // Deploy GrantsToken via UUPS proxy
    grantsToken = await deployGrantsToken(INITIAL_SUPPLY, TOKEN_CAP, owner.address);

    // Deploy GrantsTokenFaucet
    const GrantsTokenFaucet = await ethers.getContractFactory("GrantsTokenFaucet");
    faucet = await GrantsTokenFaucet.deploy(grantsToken.address, signer.address);
    await faucet.deployed();

    // Add owner and faucet to the allowlist:
    // - owner: so the initial transfer to faucet is permitted
    // - faucet: so claim/withdraw transfers from the faucet contract are permitted
    await grantsToken.addToAllowlist(owner.address);
    await grantsToken.addToAllowlist(faucet.address);

    // Fund the faucet
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

      const signature1 = await signFaucetMessage(signer, faucet.address, user.address, nonce1, amount);
      await faucet.connect(user).claim(user.address, nonce1, amount, signature1);

      const userNonce1 = await faucet.userNonces(user.address);
      assert.isTrue(userNonce1.eq(nonce1));

      const signature2 = await signFaucetMessage(signer, faucet.address, user.address, nonce2, amount);
      await faucet.connect(user).claim(user.address, nonce2, amount, signature2);

      const userNonce2 = await faucet.userNonces(user.address);
      assert.isTrue(userNonce2.eq(nonce2));
    });

    it("should allow multiple claims with increasing nonces", async () => {
      const amount = parseTokens("1000");
      const initialBalance = await grantsToken.balanceOf(user.address);

      const signature1 = await signFaucetMessage(signer, faucet.address, user.address, 1, amount);
      await faucet.connect(user).claim(user.address, 1, amount, signature1);

      const signature2 = await signFaucetMessage(signer, faucet.address, user.address, 2, amount);
      await faucet.connect(user).claim(user.address, 2, amount, signature2);

      const signature3 = await signFaucetMessage(signer, faucet.address, user.address, 3, amount);
      await faucet.connect(user).claim(user.address, 3, amount, signature3);

      const finalBalance = await grantsToken.balanceOf(user.address);
      assert.isTrue(finalBalance.eq(initialBalance.add(amount.mul(3))));
    });

    it("should revert if nonce is not greater than last used nonce", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");
      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      await faucet.connect(user).claim(user.address, nonce, amount, signature);

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, signature),
        "GrantsTokenFaucet: nonce must be greater than last used nonce"
      );
    });

    it("should revert if nonce is less than last used nonce", async () => {
      const amount = parseTokens("1000");

      const signature5 = await signFaucetMessage(signer, faucet.address, user.address, 5, amount);
      await faucet.connect(user).claim(user.address, 5, amount, signature5);

      const signature3 = await signFaucetMessage(signer, faucet.address, user.address, 3, amount);
      await expectRevert(
        faucet.connect(user).claim(user.address, 3, amount, signature3),
        "GrantsTokenFaucet: nonce must be greater than last used nonce"
      );
    });

    it("should revert if signature is invalid", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");

      const wrongSignature = await signFaucetMessage(other, faucet.address, user.address, nonce, amount);

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, wrongSignature),
        "GrantsTokenFaucet: invalid signature"
      );
    });

    it("should revert if signature is for different user", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");

      const signature = await signFaucetMessage(signer, faucet.address, other.address, nonce, amount);

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, signature),
        "GrantsTokenFaucet: invalid signature"
      );
    });

    it("should revert if signature is for different nonce", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");

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
      const invalidSignature = "0x1234";

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, invalidSignature),
        "GrantsTokenFaucet: invalid signature length"
      );
    });

    it("should allow different users to claim independently", async () => {
      const nonce = 1;
      const amount = parseTokens("1000");

      const signature1 = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);
      await faucet.connect(user).claim(user.address, nonce, amount, signature1);

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
      const amount = FAUCET_AMOUNT;
      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      await faucet.connect(user).claim(user.address, nonce, amount, signature);

      const balance = await grantsToken.balanceOf(user.address);
      assert.isTrue(balance.eq(amount));
    });

    it("should revert if claiming more than faucet balance", async () => {
      const nonce = 1;
      const amount = FAUCET_AMOUNT.add(1);
      const signature = await signFaucetMessage(signer, faucet.address, user.address, nonce, amount);

      await expectRevert(
        faucet.connect(user).claim(user.address, nonce, amount, signature),
        "ERC20: transfer amount exceeds balance"
      );
    });
  });
});
