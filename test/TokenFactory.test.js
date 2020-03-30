// Load dependencies
const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect } = require('chai');

// Load compiled artifacts
const TokenFactory = contract.fromArtifact('TokenFactory');
const DataToken = contract.fromArtifact('DataToken');

// Start test block
describe('TokenFactory', function () {
  const [ owner ] = accounts;

  beforeEach(async function () {

    // Deploy a new contract for each test
    let template = await DataToken.new({ from: owner });
    this.contract = await TokenFactory.new(template.address, owner, { from: owner });

  });

  // Test case
  it('dummy case', async function () {

  	await console.log("dummy");

  });
});

