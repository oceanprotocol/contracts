const hre = require("hardhat");
const ethers = hre.ethers;
require("dotenv").config();

const logging = true;
const show_verify = true;

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
  if (process.env.MNEMONIC)
    wallet = ethers.Wallet.fromMnemonic(process.env.MNEMONIC);
  if (process.env.PRIVATE_KEY) wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  if (!wallet) {
    console.error("Missing MNEMONIC or PRIVATE_KEY. Aborting..");
    return null;
  }
  const deployer = wallet.connect(provider);

  let gasPrice = null;
  let gasLimit = 6000000;
  let networkName = null;

  // Multisig address that will own the proxy and control upgrades.
  const multisigOwner = "0x09b575B5eC7Fff24cbccC092DE9E36eADdDbEe71";

  switch (networkDetails.chainId) {
    case 11155111:
      networkName = "sepolia";
      gasPrice = ethers.utils.parseUnits("25", "gwei");
      gasLimit = 6000000;
      break;
    case 8453:
      networkName = "base";
      gasPrice = ethers.utils.parseUnits("0.006", "gwei");
      gasLimit = 3000000;
      break;
  }

  if (!networkName) {
    console.error("Invalid network. Aborting..");
    return null;
  }

  

  const options = gasPrice ? { gasLimit, gasPrice } : { gasLimit };

  console.log("Deploying with account:", deployer.address);
  console.log("Deployer nonce:", await deployer.getTransactionCount());
  console.log("Multisig owner:", multisigOwner);

  const initialSupply = ethers.utils.parseUnits("1000000", 6);  // 1 million
  const cap = ethers.utils.parseUnits("100000000", 6);           // 100 million

  // 1. Deploy implementation
  if (logging) console.info("Deploying GrantsToken implementation...");
  const GrantsToken = await ethers.getContractFactory("GrantsToken", deployer);
  const impl = await GrantsToken.deploy(options);
  await impl.deployTransaction.wait(5);
  if (logging) console.info("Implementation deployed at:", impl.address);

  // 2. Deploy ERC1967Proxy pointing at the implementation
  if (logging) console.info("Deploying ERC1967Proxy...");
  const initData = impl.interface.encodeFunctionData("initialize", [
    initialSupply,
    cap,
    multisigOwner,
  ]);
  const ERC1967ProxyFactory = await ethers.getContractFactory("ERC1967Proxy", deployer);
  const proxy = await ERC1967ProxyFactory.deploy(impl.address, initData, options);
  await proxy.deployTransaction.wait(5);

  const proxyAddress = proxy.address;
  const grantsToken = GrantsToken.attach(proxyAddress);
  const owner = await grantsToken.owner();
  if (logging) {
    console.info("Proxy deployed at:          ", proxyAddress);
    console.info("Implementation deployed at: ", impl.address);
    console.info("Owner (multisig):           ", owner);
  }

  if (show_verify) {
    console.log("\nRun the following to verify on Etherscan:");
    console.log(`\tnpx hardhat verify --network ${networkName} ${impl.address}`);
    console.log(`\tnpx hardhat verify --network ${networkName} ${proxyAddress} ${impl.address} ${initData}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
