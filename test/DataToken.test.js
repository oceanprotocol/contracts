// Load dependencies
const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect } = require('chai');

// Load test helpers
const {
  BN,           // Big Number support
  balance,
  constants,    // Common constants, like the zero address and largest integers
  expectEvent,  // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');


// Load compiled artifacts
const TokenFactory = contract.fromArtifact('TokenFactory');
const DataToken = contract.fromArtifact('DataToken');

// Start test block
describe('DataToken', function () {
  const [ owner ] = accounts;

  beforeEach(async function () {

    // Deploy a new contract for each test
    let template = await DataToken.new({ from: owner });
    this.beneficiary = accounts[1];
    this.factory = await TokenFactory.new(template.address, this.beneficiary, { from: owner });
    this.value = new BN("100000000000000000");
    this.notValue = new BN("100");

    this.factory.createToken('metadata', {value:this.value, from: owner});    
    
    this.beneficiary = await this.factory.getBeneficiary();

    this.token = await DataToken.at(
                 await this.factory.getTokenAddress(
                 await this.factory.getTokenCount()
                 ));
  });

  it('.. should mint one token', async function () {
    let beneficiaryStartBalance = await balance.current(this.beneficiary);

    let receipt = await this.token.mint(owner, 1, {value:this.value, from: owner});
    let cashBack = receipt['logs'][2]['args']['cashBack']
    let fee = receipt['logs'][2]['args']['fee'];    

    let beneficiaryEndBalance = await balance.current(this.beneficiary);

    // check that mint token event was emitted
    expectEvent(receipt, 'TokenMinted');

    // check token balance
    expect((await this.token.balanceOf(owner)).toString()).to.equal('1');

    // check that cashback is greater than zero
    expect (await cashBack.gt(await new BN("0")));

    // check that fee is greater than zero
    expect (await fee.gt(await new BN("0")));

    // check that beneficiary have recieved the fee
    expect (await beneficiaryStartBalance.lt(beneficiaryEndBalance));

  });


});

