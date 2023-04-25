/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent, BN } = require("@openzeppelin/test-helpers");
const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { sha256 } = require("@ethersproject/sha2");
const {getEventFromTx} = require("../../helpers/utils");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const ethers = hre.ethers;
const { ecsign } = require("ethereumjs-util");


describe("veFeeOwner tests", () => {
  let veFeeDistributor,
    veFeeDistributorOwner,
    veOcean,
    oceanToken,
    mockERC20Token,
    owner,
    alice,
    bob

    it("#deploy veOcean, veFeeDistributor, veFeeOwner & Ocean", async () => {
        [owner, alice,bob] = await ethers.getSigners();
        const OceanToken = await ethers.getContractFactory('MockOcean');
        oceanToken = await OceanToken.connect(owner).deploy(owner.address);
        const MockERC20Token = await ethers.getContractFactory('MockERC20');
        mockERC20Token = await MockERC20Token.connect(owner).deploy(owner.address,'Mock','Mock');
        const VeOcean = await ethers.getContractFactory("veOCEAN");
        veOcean = await VeOcean.connect(owner).deploy(oceanToken.address,"veOCEAN", "veOCEAN", "0.1.0");
        const VeFeeDistributor = await ethers.getContractFactory("veFeeDistributor");
        const timestamp = Math.floor(new Date().getTime() / 1000)
        veFeeDistributor = await VeFeeDistributor.connect(owner).deploy(veOcean.address,
            1,
            oceanToken.address,
            owner.address,
            owner.address);
        await veFeeDistributor.deployed()
        const VeFeeDistributorOwner = await ethers.getContractFactory("veFeeDistributorOwner");
        veFeeDistributorOwner = await VeFeeDistributorOwner.connect(owner).deploy(veFeeDistributor.address);
        await veFeeDistributorOwner.deployed()
        await veFeeDistributor.connect(owner).toggle_allow_checkpoint_token()
        assert(await veFeeDistributor.can_checkpoint_token()===true)
        await oceanToken.transfer(alice.address,1000)
        let tx = await oceanToken.transfer(bob.address,1000)
        await tx.wait()
        const aliceBalance = await oceanToken.balanceOf(alice.address)
        assert(String(aliceBalance)==='1000', 'Alice balance is off. Expecting 1000, got '+aliceBalance)
        tx = await veFeeDistributor.connect(owner).commit_admin(veFeeDistributorOwner.address)
        await tx.wait()
        tx = await veFeeDistributor.connect(owner).apply_admin()
        await tx.wait()
        assert(await veFeeDistributor.admin()==veFeeDistributorOwner.address, 'veFeeDistributor ownership change failed')
        const token = await veFeeDistributorOwner.veFeeDistributorToken()
        assert(token==oceanToken.address, ' veFeeDistributor token missmatch. Expecting '+oceanToken.address+', got '+token)
        const veDistContract = await veFeeDistributorOwner.veFeeDistributorContract()
        assert(veDistContract==veFeeDistributor.address, ' veFeeDistributor contract missmatch. Expecting '+veFeeDistributor.address+', got '+token)
        const ownerCHeck = await veFeeDistributorOwner.owner()
        assert(ownerCHeck===owner.address,"veFeeDistributor owner is wrong")
        

    })
    it("#Alice locks OceanTokens", async () => {
        //alice locks 1000 ocean
        const unlockTime = Math.floor(new Date().getTime() / 1000) + 60*60*24*30
        await oceanToken.connect(alice).approve(veOcean.address,1000)
        const tx = await veOcean.connect(alice).create_lock(1000,unlockTime)
        const txReceipt = await tx.wait();
        
    });
    it("#Owner sends 1000 Ocean to feeDistributor", async () => {
        const tx = await oceanToken.connect(owner).transfer(veFeeDistributor.address,1000)
        await tx.wait()
        const veFeeDistributorBalance = await oceanToken.balanceOf(veFeeDistributor.address)
        assert(String(veFeeDistributorBalance)==='1000', 'veFeeDistributor balance is off. Expecting 1000, got '+veFeeDistributorBalance)
    });
    it("#Anyone can checkpoint veFeeDistributor", async () => {
        let tx = await veFeeDistributorOwner.connect(alice).checkpoint_token()
        let txReceipt = await tx.wait();
        let event = getEventFromTx(txReceipt,'CheckpointToken')
        assert(event, "Cannot find CheckpointToken event")
        tx = await veFeeDistributorOwner.connect(alice).checkpoint_total_supply()
        txReceipt = await tx.wait();
        tx = await veFeeDistributorOwner.connect(alice).checkpoint()
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt,'CheckpointToken')
        assert(event, "Cannot find CheckpointToken event")
    })
    it("#Alice should fail to call veFeeDistributor checkpoint", async () => {
        await expectRevert.unspecified(
            veFeeDistributor
              .connect(alice)
              .checkpoint_token()
          );
    })
    it("#Alice should fail to call veFeeDistributorOwner kill_me", async () => {
        await expectRevert.unspecified(
            veFeeDistributorOwner
              .connect(alice)
              .kill_me()
          );
        await expectRevert.unspecified(
            veFeeDistributorOwner
              .connect(alice)
              .recover_balance(oceanToken.address)
          );
        await expectRevert.unspecified(
            veFeeDistributorOwner
              .connect(alice)
              .commit_admin(alice.address)
          );
          await expectRevert.unspecified(
            veFeeDistributorOwner
              .connect(alice)
              .apply_admin()
          );
    })
    it("#Owner should be able to call veFeeDistributorOwner recover_balance", async () => {
        await mockERC20Token.connect(owner).transfer(veFeeDistributor.address,100)
        let veFeeDistributorBalance = await mockERC20Token.balanceOf(veFeeDistributor.address)
        assert(String(veFeeDistributorBalance)==='100', 'veFeeDistributor balance is off. Expecting 100, got '+veFeeDistributorBalance)
        await 
            veFeeDistributorOwner
              .connect(owner)
              .recover_balance(mockERC20Token.address)
        veFeeDistributorBalance = await mockERC20Token.balanceOf(veFeeDistributor.address)
        assert(String(veFeeDistributorBalance)==='0', 'veFeeDistributor balance is off. Expecting 0, got '+veFeeDistributorBalance)
          
    })
    it("#Owner should be able to tranfer veFeeDistributor ownership to Alice", async () => {
        assert(await veFeeDistributor.admin()!=alice.address,' Alice cannot be admin yet')
        await veFeeDistributorOwner.connect(owner).commit_admin(alice.address)
        const tx = await veFeeDistributorOwner.connect(owner).apply_admin()
        await tx.wait()
        assert(await veFeeDistributor.admin()===alice.address,' Alice should be the new admin')
    })
  
});