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
    this.value = new BN("10000000000000000");;
    this.notValue = new BN("100");;
  });

  it('.. should revert a token proxy deployment due to low fee', async function () {

    await expectRevert(this.contract.createToken('metadata', {value:this.notValue}),
      'revert fee amount is not enough');

  });


  it('.. should deploy a token proxy', async function () {

    // await this.contract.createToken('metadata', { value: this.value });
    await this.contract.createToken('metadata', {value:this.value});

    // check that the token was added to minimal registry
    expect((await this.contract.getTokenCount()).toString()).to.equal('1');

    let tokenAddress = await this.contract.getTokenAddress(1);
    let token = await DataToken.at(tokenAddress);

    // check that the token was initialized on creation
    expect((await token.isInitialized()).toString()).to.equal('true');
  });

  it('.. should change contract beneficiary', async function () {

    await this.contract.changeBeneficiary(accounts[1], {from: owner});

    expect(await this.contract.getBeneficiary())
      .to.be.equal(accounts[1]);
  });


});

