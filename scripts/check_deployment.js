/* eslint-disable no-unused-vars */
const fs = require('fs')

async function testDeployment() {
  // load addresses file first
  addresses = null
  console.log("Loading "+process.env.ADDRESS_FILE)
  try {
    addresses = JSON.parse(fs.readFileSync(process.env.ADDRESS_FILE, 'utf8'))
  }
  catch {
    console.error("Could not load addreses files")
    process.exit(1)
  }
  if (!('development' in addresses)) {
    console.error("Missing development network")
    process.exit(1)
  }
  keys = ["startBlock", "Router", "FixedPrice", "ERC20Template", "ERC721Template", "Dispenser", "ERC721Factory","AccessListFactory","Escrow"]
  for (const key of keys) {
    if (!(key in addresses['development'])) {
      console.error("Missing " + key + " deployment")
      process.exit(1)
    }
  }
  console.log("All good")
  process.exit(0)
}

testDeployment()