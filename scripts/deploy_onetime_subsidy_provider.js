// Deploys OneTimeSubsidyProvider, then wires it up:
//   - setUserAccessList / setNodeAccessList
//   - setTokenConfig(token, pctBps, defaultCredit, enabled)
//   - setUserCredit(payer, token, amount) for any per-user overrides (e.g. close friends)
//   - setAllowedJobTypes(jobTypes)
//   - setAuthorizedEscrow(escrow, true) for the deployed Escrow (from ADDRESS_FILE)
//   - optional funding is a plain ERC20 transfer of the subsidy token to the contract (do manually)
//
// Standard script structure (mirrors scripts/deploy_opf_subsidy_provider.js): NETWORK_RPC_URL,
// MNEMONIC/PRIVATE_KEY and ADDRESS_FILE come from env; the configuration below is plain const vars.
// Anything left empty ("" / [] / "0") is skipped with a log line so the owner can finish manually.
const hre = require("hardhat");
const fs = require("fs");
const { Wallet } = require("ethers");
const ethers = hre.ethers;
require("dotenv").config();
const logging = true;
const show_verify = true;

// ---------------------------------------------------------------------------
// OneTimeSubsidyProvider configuration (edit these const values)
// ---------------------------------------------------------------------------
const ONETIME_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // subsidy token; "" => fall back to addresses.Ocean/OCEAN
const ONETIME_PCT_BPS = "0";              // OPTIONAL per-job ceiling in bps (0 = no per-job cap; whole credit usable in one job)
const ONETIME_DEFAULT_CREDIT = "10000000"; // global one-time credit per user in token wei (10 USDC @ 6 decimals)
const ONETIME_USER_ACCESS_LIST = "";      // user AccessList address ("" => user gate off)
const ONETIME_NODE_ACCESS_LIST = "";      // node AccessList address ("" => node gate off)
const ONETIME_ALLOWED_JOBTYPES = [];      // jobTypes to allow, e.g. ["1","2"] ([] => all allowed)
const ONETIME_USER_OVERRIDES = [];        // per-user credit overrides: [{ addr: "0x..", amount: "20000000" }]
// ---------------------------------------------------------------------------

// Track every deployed subsidy provider in a single shared `SubsidyProviders` array (a dashboard
// enumerates it and ERC-165 feature-detects each). Appends without overwriting, migrates any legacy
// single-address `OPFSubsidyProvider` / `OneTimeSubsidyProvider` string key into the array, and dedupes
// case-insensitively so re-running a deploy never double-lists.
function addSubsidyProvider(addresses, newAddr) {
  const list = Array.isArray(addresses.SubsidyProviders) ? addresses.SubsidyProviders.slice() : [];
  for (const legacyKey of ["OPFSubsidyProvider", "OneTimeSubsidyProvider"]) {
    if (typeof addresses[legacyKey] === "string" && addresses[legacyKey]) {
      list.push(addresses[legacyKey]);
      delete addresses[legacyKey];
    }
  }
  if (newAddr) list.push(newAddr);
  const seen = new Set();
  addresses.SubsidyProviders = list.filter((a) => {
    const k = String(a).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function main() {
  const url = process.env.NETWORK_RPC_URL;
  console.log("Using RPC: " + url);
  if (!url) {
    console.error("Missing NETWORK_RPC_URL. Aborting..");
    return null;
  }
  const provider = new ethers.providers.JsonRpcProvider(url);
  const networkDetails = await provider.getNetwork();

  let wallet;
  if (process.env.MNEMONIC) wallet = new Wallet.fromMnemonic(process.env.MNEMONIC);
  if (process.env.PRIVATE_KEY) wallet = new Wallet(process.env.PRIVATE_KEY);
  if (!wallet) {
    console.error("Missing MNEMONIC or PRIVATE_KEY. Aborting..");
    return null;
  }
  if (!process.env.ADDRESS_FILE) {
    console.error("Missing ADDRESS_FILE. Aborting..");
    return null;
  }
  const owner = wallet.connect(provider);

  let gasLimit = 3000000;
  let gasPrice = null;
  let networkName;
  let OPFOwner = null;
  console.log("Using chain " + networkDetails.chainId);
  switch (networkDetails.chainId) {
    case 1:
      networkName = "mainnet";
      OPFOwner = "0x0d27cd67c4A3fd3Eb9C7C757582f59089F058167";
      gasLimit = 6500000;
      gasPrice = ethers.utils.parseUnits('0.12', 'gwei');
      break;
    case 10:
      networkName = "optimism";
      OPFOwner = '0xC7EC1970B09224B317c52d92f37F5e1E4fF6B687';
      gasPrice = ethers.utils.parseUnits('0.0010', 'gwei');
      gasLimit = 6500000;
      break;
    case 0x89:
      networkName = "polygon";
      OPFOwner = "0x6272E00741C16b9A337E29DB672d51Af09eA87dD";
      gasLimit = 6500000;
      gasPrice = ethers.utils.parseUnits('30', 'gwei');
      break;
    case 8453:
      networkName = "base";
      OPFOwner = '0x09b575B5eC7Fff24cbccC092DE9E36eADdDbEe71';
      gasPrice = ethers.utils.parseUnits('0.05', 'gwei');
      gasLimit = 6500000;
      break;
    case 23294:
      networkName = "oasis_sapphire";
      OPFOwner = '0x086E7F0588755af5AF5f8194542Fd8328238F3C1';
      gasPrice = ethers.utils.parseUnits('100', 'gwei');
      gasLimit = 6500000;
      break;
    case 23295:
      networkName = "oasis_saphire_testnet";
      OPFOwner = '0xC7EC1970B09224B317c52d92f37F5e1E4fF6B687';
      gasPrice = ethers.utils.parseUnits('100', 'gwei');
      gasLimit = 6500000;
      break;
    case 11155111:
      networkName = "sepolia";
      OPFOwner = '0xC7EC1970B09224B317c52d92f37F5e1E4fF6B687';
      gasPrice = ethers.utils.parseUnits('23', 'gwei');
      gasLimit = 6500000;
      break;
    case 11155420:
      networkName = "optimism_sepolia";
      OPFOwner = '0xC7EC1970B09224B317c52d92f37F5e1E4fF6B687';
      gasPrice = ethers.utils.parseUnits('0.0016', 'gwei');
      gasLimit = 6500000;
      break;
    default:
      OPFOwner = "0x0d27cd67c4A3fd3Eb9C7C757582f59089F058167";
      networkName = "development";
      break;
  }

  let options;
  if (gasPrice) options = { gasLimit, gasPrice };
  else options = { gasLimit };

  console.log("Network:" + networkName);
  const addressFile = process.env.ADDRESS_FILE;
  let oldAddresses;
  let addresses;
  try {
    oldAddresses = JSON.parse(fs.readFileSync(addressFile));
  } catch (e) {
    console.log(e);
    oldAddresses = {};
  }
  if (!oldAddresses[networkName]) oldAddresses[networkName] = {};
  addresses = oldAddresses[networkName];
  if (logging) console.info("Use existing addresses:" + JSON.stringify(addresses, null, 2));

  console.log("Deployer nonce:", await owner.getTransactionCount());

  // ---- deploy ----
  if (logging) console.info("Deploying OneTimeSubsidyProvider");
  const OneTime = await ethers.getContractFactory("OneTimeSubsidyProvider", owner);
  const oneTime = await OneTime.connect(owner).deploy(options);
  await oneTime.deployTransaction.wait(1);
  if (show_verify) {
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network " + networkName + " " + oneTime.address);
  }
  addSubsidyProvider(addresses, oneTime.address);
  console.log("OneTimeSubsidyProvider deployed: " + oneTime.address);
  console.log("SubsidyProviders now: " + JSON.stringify(addresses.SubsidyProviders));

  // ---- wiring ----
  if (ONETIME_USER_ACCESS_LIST) {
    if (logging) console.info("setUserAccessList " + ONETIME_USER_ACCESS_LIST);
    await (await oneTime.connect(owner).setUserAccessList(ONETIME_USER_ACCESS_LIST, options)).wait(1);
  } else console.info("ONETIME_USER_ACCESS_LIST not set -> user gate OFF (allow all)");
  if (ONETIME_NODE_ACCESS_LIST) {
    if (logging) console.info("setNodeAccessList " + ONETIME_NODE_ACCESS_LIST);
    await (await oneTime.connect(owner).setNodeAccessList(ONETIME_NODE_ACCESS_LIST, options)).wait(1);
  } else console.info("ONETIME_NODE_ACCESS_LIST not set -> node gate OFF (allow all)");

  // token config (global default credit)
  const token = ONETIME_TOKEN || addresses.Ocean || addresses.OCEAN;
  if (token) {
    if (logging) console.info(`setTokenConfig(${token}, ${ONETIME_PCT_BPS}, ${ONETIME_DEFAULT_CREDIT}, true)`);
    await (await oneTime.connect(owner).setTokenConfig(token, ONETIME_PCT_BPS, ONETIME_DEFAULT_CREDIT, true, options)).wait(1);

    // per-user credit overrides (e.g. close friends get more than the default)
    for (const o of ONETIME_USER_OVERRIDES) {
      if (o && o.addr && o.amount) {
        if (logging) console.info(`setUserCredit(${o.addr}, ${token}, ${o.amount})`);
        await (await oneTime.connect(owner).setUserCredit(o.addr, token, o.amount, options)).wait(1);
      }
    }
  } else {
    console.info("No subsidy token configured (ONETIME_TOKEN / addresses.Ocean) -> skip setTokenConfig + overrides");
  }

  // jobType allowlist
  if (Array.isArray(ONETIME_ALLOWED_JOBTYPES) && ONETIME_ALLOWED_JOBTYPES.length > 0) {
    if (logging) console.info("setAllowedJobTypes " + JSON.stringify(ONETIME_ALLOWED_JOBTYPES));
    await (await oneTime.connect(owner).setAllowedJobTypes(ONETIME_ALLOWED_JOBTYPES, options)).wait(1);
  } else console.info("ONETIME_ALLOWED_JOBTYPES empty -> jobType gate OFF (all jobTypes allowed)");

  // authorize the deployed escrow so it can call onSubsidyClaim
  //for (const key of ["Escrow", "EnterpriseEscrow"]) {
  for (const key of ["Escrow"]) {
    if (addresses[key]) {
      if (logging) console.info("setAuthorizedEscrow(" + key + " " + addresses[key] + ", true)");
      await (await oneTime.connect(owner).setAuthorizedEscrow(addresses[key], true, options)).wait(1);
    } else console.info("No " + key + " in address file -> not authorized (do it manually later)");
  }

  // hand ownership to the OPF multisig if we deployed from a different key
  if (OPFOwner && OPFOwner.toLowerCase() !== owner.address.toLowerCase()) {
    if (logging) console.info("transferOwnership -> " + OPFOwner);
    await (await oneTime.connect(owner).transferOwnership(OPFOwner, options)).wait(1);
  }

  // persist
  oldAddresses[networkName] = addresses;
  try {
    fs.writeFileSync(addressFile, JSON.stringify(oldAddresses, null, 2));
  } catch (e) {
    console.error(e);
  }
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
