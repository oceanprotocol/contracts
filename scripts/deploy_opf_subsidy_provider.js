// Deploys OPFSubsidyProvider, then wires it up:
//   - setUserAccessList / setNodeAccessList
//   - setTokenLimits(token, pctBps, daily, weekly, monthly, enabled)
//   - setAllowedJobTypes(jobTypes)
//   - setAuthorizedEscrow(escrow, true) for the deployed Escrow / EnterpriseEscrow (from ADDRESS_FILE)
//   - optional funding (plain ERC20 transfer of the subsidy token to the contract)
//
// Standard script structure (mirrors scripts/deploy_escrow.js): NETWORK_RPC_URL, MNEMONIC/PRIVATE_KEY
// and ADDRESS_FILE come from env; the OPF-specific configuration below is plain const variables.
// Anything left empty ("" / [] / "0") is skipped with a log line so the owner can finish manually.
const hre = require("hardhat");
const fs = require("fs");
const { Wallet } = require("ethers");
const ethers = hre.ethers;
require("dotenv").config();
const logging = true;
const show_verify = true;

// ---------------------------------------------------------------------------
// OPF configuration (edit these const values)
// ---------------------------------------------------------------------------
const OPF_SUBSIDY_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";        // subsidy token address; "" => fall back to addresses.Ocean/OCEAN
const OPF_SUBSIDY_PCT_BPS = "10000"; // percentage-of-job ceiling in bps (10000 = 100%)
const OPF_SUBSIDY_DAILY = "0";       // per-user daily cap in token wei ("0" = unlimited)
const OPF_SUBSIDY_WEEKLY = "0";      // per-user weekly cap in token wei ("0" = unlimited)
const OPF_SUBSIDY_MONTHLY = "0";     // per-user monthly cap in token wei ("0" = unlimited)
const OPF_USER_ACCESS_LIST = "";     // user AccessList address ("" => user gate off)
const OPF_NODE_ACCESS_LIST = "";     // node AccessList address ("" => node gate off)
const OPF_ALLOWED_JOBTYPES = [];     // jobTypes to allow, e.g. ["1","2"] ([] => all allowed)
// ---------------------------------------------------------------------------

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
  if (logging) console.info("Deploying OPFSubsidyProvider");
  const OPF = await ethers.getContractFactory("OPFSubsidyProvider", owner);
  const opf = await OPF.connect(owner).deploy(options);
  await opf.deployTransaction.wait(1);
  if (show_verify) {
    console.log("\tRun the following to verify on etherscan");
    console.log("\tnpx hardhat verify --network " + networkName + " " + opf.address);
  }
  addresses.OPFSubsidyProvider = opf.address;
  console.log("\"OPFSubsidyProvider\":\"" + opf.address + "\"");

  // ---- wiring ----
  if (OPF_USER_ACCESS_LIST) {
    if (logging) console.info("setUserAccessList " + OPF_USER_ACCESS_LIST);
    await (await opf.connect(owner).setUserAccessList(OPF_USER_ACCESS_LIST, options)).wait(1);
  } else console.info("OPF_USER_ACCESS_LIST not set -> user gate OFF (allow all)");
  if (OPF_NODE_ACCESS_LIST) {
    if (logging) console.info("setNodeAccessList " + OPF_NODE_ACCESS_LIST);
    await (await opf.connect(owner).setNodeAccessList(OPF_NODE_ACCESS_LIST, options)).wait(1);
  } else console.info("OPF_NODE_ACCESS_LIST not set -> node gate OFF (allow all)");

  // token limits
  const token = OPF_SUBSIDY_TOKEN || addresses.Ocean || addresses.OCEAN;
  if (token) {
    if (logging) console.info(`setTokenLimits(${token}, ${OPF_SUBSIDY_PCT_BPS}, ${OPF_SUBSIDY_DAILY}, ${OPF_SUBSIDY_WEEKLY}, ${OPF_SUBSIDY_MONTHLY}, true)`);
    await (await opf.connect(owner).setTokenLimits(token, OPF_SUBSIDY_PCT_BPS, OPF_SUBSIDY_DAILY, OPF_SUBSIDY_WEEKLY, OPF_SUBSIDY_MONTHLY, true, options)).wait(1);

    
  } else {
    console.info("No subsidy token configured (OPF_SUBSIDY_TOKEN / addresses.Ocean) -> skip setTokenLimits + funding");
  }

  // jobType allowlist
  if (Array.isArray(OPF_ALLOWED_JOBTYPES) && OPF_ALLOWED_JOBTYPES.length > 0) {
    if (logging) console.info("setAllowedJobTypes " + JSON.stringify(OPF_ALLOWED_JOBTYPES));
    await (await opf.connect(owner).setAllowedJobTypes(OPF_ALLOWED_JOBTYPES, options)).wait(1);
  } else console.info("OPF_ALLOWED_JOBTYPES empty -> jobType gate OFF (all jobTypes allowed)");

  // authorize the deployed escrow so they can call onSubsidyClaim (OPF allows only community escrow)
  //for (const key of ["Escrow", "EnterpriseEscrow"]) {
  for (const key of ["Escrow"]) {
    if (addresses[key]) {
      if (logging) console.info("setAuthorizedEscrow(" + key + " " + addresses[key] + ", true)");
      await (await opf.connect(owner).setAuthorizedEscrow(addresses[key], true, options)).wait(1);
    } else console.info("No " + key + " in address file -> not authorized (do it manually later)");
  }

  // hand ownership to the OPF multisig if we deployed from a different key
  if (OPFOwner && OPFOwner.toLowerCase() !== owner.address.toLowerCase()) {
    if (logging) console.info("transferOwnership -> " + OPFOwner);
    await (await opf.connect(owner).transferOwnership(OPFOwner, options)).wait(1);
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
