// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const fs = require("fs");
const { address } = require("../test/helpers/constants");
const { Wallet } = require("ethers");
const { UV_FS_O_FILEMAP } = require("constants");
const ethers = hre.ethers;
require("dotenv").config();
const logging = true;
const show_verify = true;
const shouldDeployMock20 = false;
// Re-deploy SponsorshipLib even if addresses.SponsorshipLib already exists. Normally false so BOTH
// escrows link the SAME library (and the address file stays consistent); set true to force a fresh one.
const forceDeploySponsorshipLib = false;
async function main() {
  const url = process.env.NETWORK_RPC_URL;
  console.log("Using RPC: " + url);
  if (!url) {
    console.error("Missing NETWORK_RPC_URL. Aborting..");
    return null;
  }
  if (!process.env.ADDRESS_FILE) {
    console.error("Missing ADDRESS_FILE. Aborting..");
    return null;
  }

  const provider = new ethers.providers.JsonRpcProvider(url);
  const network = provider.getNetwork();
  // utils
  const networkDetails = await network;

  let wallet;
  if (process.env.MNEMONIC)
    wallet = new Wallet.fromMnemonic(process.env.MNEMONIC);
  if (process.env.PRIVATE_KEY) wallet = new Wallet(process.env.PRIVATE_KEY);
  if (!wallet) {
    console.error("Missing MNEMONIC or PRIVATE_KEY. Aborting..");
    return null;
  }
  owner = wallet.connect(provider);
  let gasLimit = 3000000;
  let gasPrice = null;
  let sleepAmount = 10;
  let OPFOwner = null;
  let RouterAddress = null;
  console.log("Using chain " + networkDetails.chainId);
  switch (networkDetails.chainId) {
    case 1:
      networkName = "mainnet";
      gasLimit = 6500000;
      gasPrice = ethers.utils.parseUnits("1", "gwei");
      break;
    case 10:
      networkName = "optimism";
      gasPrice = ethers.utils.parseUnits("0.001200495", "gwei");
      gasLimit = 6500000;
      break;
    case 11155111:
      networkName = "sepolia";
      gasPrice = ethers.utils.parseUnits("0.002", "gwei");
      gasLimit = 6500000;
      break;
    case 11155420:
      networkName = "optimism_sepolia";
      gasPrice = ethers.utils.parseUnits("500", "wei");
      gasLimit = 6500000;
      break;
  }

  let options;
  if (gasPrice) {
    options = { gasLimit: gasLimit, gasPrice: gasPrice };
  } else {
    options = { gasLimit };
  }
  // Per-deploy gas limit from a LIVE estimate (+30% headroom, capped at 90% of the block limit).
  // The hardcoded gasLimit is only a fallback: some chains (observed on Sepolia) meter contract
  // code-deposit far above the nominal 200 gas/byte, so the viaIR EnterpriseEscrow (~23 KB) and
  // SponsorshipLib need well over the old fixed 6.5M and would otherwise revert out-of-gas.
  // Over-provisioning the LIMIT is free (unused gas is refunded), so estimating up is always safe.
  let nextNonce; // pinned once, then incremented locally per deploy (see below)
  async function withGas(factory, args) {
    const o = { ...options };
    try {
      const unsigned = factory.getDeployTransaction(...args, {});
      const est = await provider.estimateGas({ from: owner.address, data: unsigned.data });
      const block = await provider.getBlock("latest");
      const cap = block.gasLimit.mul(9).div(10);
      // 2x, not a tight +30%: eth_estimateGas can UNDER-report a contract-creation (the code-deposit
      // step), which made the near-24KB escrow revert "contract creation code storage out of gas".
      // Over-provisioning the LIMIT is free (unused gas is refunded), so double it and cap at the block.
      let gl = est.mul(2);
      if (gl.gt(cap)) gl = cap;
      o.gasLimit = gl;
      console.log(`\tgas: estimate ${est.toString()} -> gasLimit ${gl.toString()}`);
    } catch (e) {
      console.log(`\tgas: estimate failed (${e.message}); using fallback gasLimit ${options.gasLimit}`);
    }
    // Pin the nonce ourselves. Some RPCs load-balance across lagging backends whose "pending" count
    // trails "latest" (seen on Infura optimism-sepolia: latest=61 while pending flips to 59), so
    // ethers' auto nonce can be too low -> "nonce too low". Seed from max(latest,pending) once, then
    // increment locally for each sequential deploy.
    try {
      if (nextNonce === undefined) {
        const [latest, pending] = await Promise.all([
          provider.getTransactionCount(owner.address, "latest"),
          provider.getTransactionCount(owner.address, "pending"),
        ]);
        nextNonce = Math.max(latest, pending);
      }
      o.nonce = nextNonce++;
      console.log(`\tnonce: ${o.nonce}`);
    } catch (e) {
      console.log(`\tnonce: auto (pin failed: ${e.message})`);
    }
    return [...args, o];
  }

  console.log("Deployer nonce:", await owner.getTransactionCount());
  const addressFile = process.env.ADDRESS_FILE;
  let oldAddresses;
  if (addressFile) {
    try {
      oldAddresses = JSON.parse(fs.readFileSync(addressFile));
    } catch (e) {
      console.log(e);
      oldAddresses = {};
    }
    if (!oldAddresses[networkName]) oldAddresses[networkName] = {};
    addresses = oldAddresses[networkName];
  }
  if (logging)
    console.info(
      "Use existing addresses:" + JSON.stringify(addresses, null, 2)
    );
  if (!addresses.EnterpriseFeeCollector) {
    console.error("Missing EnterpriseFeeCollector address. Aborting..");
    return null;
  }
  
  // Deploy SponsorshipLib only if it is not already recorded (or when forced). Reusing the existing
  // library keeps Escrow and EnterpriseEscrow linked to the SAME lib and the address file consistent.
  let libAddress = addresses.SponsorshipLib;
  if (!libAddress || forceDeploySponsorshipLib) {
    if (logging) console.info("Deploying SponsorshipLib (linked into EnterpriseEscrow)");
    const SponsorshipLib = await ethers.getContractFactory("SponsorshipLib", owner);
    const sponsorshipLib = await SponsorshipLib.connect(owner).deploy(...await withGas(SponsorshipLib, []));
    await sponsorshipLib.deployTransaction.wait(1);
    libAddress = sponsorshipLib.address;
    addresses.SponsorshipLib = libAddress;
    console.log("\"SponsorshipLib\":\""+libAddress+"\"");
    if (show_verify) {
      console.log("\tRun the following to verify on etherscan");
      // SponsorshipLib has no constructor arguments
      console.log("\tnpx hardhat verify --network " + networkName + " " + libAddress);
    }
  } else {
    if (logging) console.info("Reusing existing SponsorshipLib at "+libAddress);
  }
  if (logging) console.info("Deploying EnterpriseEscrow");
  // EnterpriseEscrow references the external SponsorshipLib; it MUST be linked or deploy throws.
  const Escrow = await ethers.getContractFactory(
    "EnterpriseEscrow",
    { libraries: { SponsorshipLib: libAddress }, signer: owner }
  );

  const deployEscrow = await Escrow.connect(owner).deploy(
    ...await withGas(Escrow, [addresses.EnterpriseFeeCollector])
  );
  await deployEscrow.deployTransaction.wait(1);
  if (show_verify) {
    console.log("\tRun the following to verify on etherscan");
    console.log(
      "\tnpx hardhat verify --network " +
        networkName +
        " " +
        deployEscrow.address +
        " " +
        addresses.EnterpriseFeeCollector
    );
  }
  addresses.EnterpriseEscrow = deployEscrow.address;
  
  if (addressFile) {
    // write address.json if needed
    oldAddresses[networkName] = addresses;
    try {
      fs.writeFileSync(addressFile, JSON.stringify(oldAddresses, null, 2));
    } catch (e) {
      console.error(e);
    }
  }
}

async function sleep(s) {
  return new Promise((resolve) => {
    setTimeout(resolve, s * 1000);
  });
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
