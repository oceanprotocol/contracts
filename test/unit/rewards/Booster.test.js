const { expect } = require('chai');
const { ethers } = require("hardhat");
const { json } = require('hardhat/internal/core/params/argumentTypes');

let metadata = {"uptime":100,"image":"ipfs://123"}
let signers
// Start test block
describe('Booster tests', function () {
  before(async function () {
    this.boost=1.5
    this.tokenID=0
    this.boosterContract = await ethers.getContractFactory('Booster');
    this.boosterContract = await this.boosterContract.deploy("Booster","B1.5",ethers.utils.parseUnits(String(this.boost)));
    await this.boosterContract.deployed();

    // Get the contractOwner and collector address
    signers = await ethers.getSigners();

  });


  // Test cases
  it('Check booster collection name', async function () {
    expect(await this.boosterContract.name()).to.exist;
    
  });

  it('Check booster value', async function () {
    expect(await this.boosterContract.boost()).to.equal(ethers.utils.parseUnits(String(this.boost)))
    
  });

  it('Check booster collection symbol', async function () {
    expect(await this.boosterContract.symbol()).to.exist;
  });


  it('Mints one token, using createBoost', async function () {
    await this.boosterContract.createBoost(signers[0].address,JSON.stringify(metadata));
    this.tokenID++;
    expect(await this.boosterContract.balanceOf(signers[0].address)).to.equal(1);
    expect(await this.boosterContract.ownerOf(this.tokenID)).to.equal(signers[0].address);
  });

  it('Mints several tokens, using batchCreateBoosts', async function () {
    const addresses=[]
    const tokenURIs=[]
    
    for (let i = 1; i < 4; i++) {
        addresses.push(signers[i].address)
        tokenURIs.push(JSON.stringify(metadata))
    }
    await this.boosterContract.batchCreateBoosts(addresses,tokenURIs);
    expect(await this.boosterContract.balanceOf(signers[1].address)).to.equal(1);
    expect(await this.boosterContract.ownerOf(2)).to.equal(signers[1].address);

    //signer[4] should not have any nft
    expect(await this.boosterContract.balanceOf(signers[4].address)).to.equal(0);
  });

    
  it('Only owner can mint', async function () {
        await expect(
            this.boosterContract.connect(signers[1])
            .createBoost(signers[0].address,JSON.stringify(metadata)))
            .to.be.revertedWith("Ownable: caller is not the owner")

        await expect(
                this.boosterContract.connect(signers[1])
                .batchCreateBoosts([signers[0].address,signers[1].address],[JSON.stringify(metadata),JSON.stringify(metadata)]))
                .to.be.revertedWith("Ownable: caller is not the owner")
  });

  it('Is able to query the NFT tokenURI', async function () {
    expect(await this.boosterContract.tokenURI(1)).to.equal(JSON.stringify(metadata));
  });

  it('Emits a transfer event for newly minted NFTs', async function () {
    await expect(this.boosterContract.createBoost(signers[1].address,JSON.stringify(metadata)))
    .to.emit(this.boosterContract, "Transfer")
    .withArgs("0x0000000000000000000000000000000000000000", signers[1].address, 5); 
  });

  it('Is not able to transfer NFTs to another wallet when called by user', async function () {
    await expect(this.boosterContract["safeTransferFrom(address,address,uint256)"](signers[0].address,signers[2].address,1)).to.be.revertedWith("Token not transferable");
  });

  it('Is not able to transfer NFTs to another wallet when called by contract owner', async function () {
    await expect(this.boosterContract["safeTransferFrom(address,address,uint256)"](signers[0].address,signers[1].address,2)).to.be.revertedWith("ERC721: caller is not token owner or approved");
  });


});