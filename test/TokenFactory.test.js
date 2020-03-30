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

  it('.. should create a deploy a token proxy', async function () {

  	await this.contract.createToken('metadata');

    expect((await this.contract.getTokenCount()).toString()).to.equal('1');

  });
});

