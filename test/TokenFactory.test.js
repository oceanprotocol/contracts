// Load dependencies
const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect } = require('chai');

// Load test helpers
const {
  BN,           // Big Number support
  constants,    // Common constants, like the zero address and largest integers
  expectEvent,  // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');


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

  it('.. should deploy a token proxy', async function () {

    await this.contract.createToken('metadata');
    // check that token was added to minimal registry
    expect((await this.contract.getTokenCount()).toString()).to.equal('1');

    let tokenAddress = await this.contract.getTokenAddress(1);
    let token = await DataToken.at(tokenAddress);

    // check that token was initialized on creation
    expect((await token.isInitialized()).toString()).to.equal('true');

  });
});

