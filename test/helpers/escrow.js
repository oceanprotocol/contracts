/* eslint-env mocha */
/* global */

// Shared helper for deploying the escrows WITH the external SponsorshipLib linked.
// Both Escrow and EnterpriseEscrow reference the (delegatecall-linked) SponsorshipLib, so
// `ethers.getContractFactory("Escrow")` THROWS unless the library is linked. Every test and deploy
// script that deploys an escrow MUST go through here (deploy SponsorshipLib first, then link).

const { ethers } = require("hardhat");

// deploy a fresh SponsorshipLib instance
async function deploySponsorshipLib(signer) {
  const Lib = signer
    ? await ethers.getContractFactory("SponsorshipLib", signer)
    : await ethers.getContractFactory("SponsorshipLib");
  const lib = await Lib.deploy();
  await lib.deployed();
  return lib;
}

// returns a ContractFactory for `name` (Escrow / EnterpriseEscrow) with SponsorshipLib linked.
// `lib` optional - a shared, already-deployed SponsorshipLib; otherwise one is deployed.
async function getEscrowFactory(name, signer, lib) {
  if (!lib) lib = await deploySponsorshipLib(signer);
  const opts = { libraries: { SponsorshipLib: lib.address } };
  if (signer) opts.signer = signer;
  const factory = await ethers.getContractFactory(name, opts);
  factory._sponsorshipLib = lib;
  return factory;
}

// deploy `name` with constructor `args`, linking SponsorshipLib.
async function deployEscrow(name, args, signer, lib) {
  const F = await getEscrowFactory(name, signer, lib);
  const e = await F.deploy(...args);
  await e.deployed();
  e._sponsorshipLib = F._sponsorshipLib;
  return e;
}

module.exports = { deploySponsorshipLib, getEscrowFactory, deployEscrow };
