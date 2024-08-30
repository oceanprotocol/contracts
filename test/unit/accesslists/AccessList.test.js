const { expect, assert } = require('chai');
const { ethers } = require("hardhat");
const { json } = require('hardhat/internal/core/params/argumentTypes');
const { getEventFromTx } = require("../../helpers/utils")



let metadata = {"uptime":100,"image":"ipfs://123"}
let signers
// Start test block
describe('AccessLists tests', function () {
  before(async function  () {
    this.tokenID=0
    this.accessListContract = await ethers.getContractFactory('AccessList');
    this.accessListContract = await this.accessListContract.deploy("AccessList","A");
    await this.accessListContract.deployed();
    const txReceipt = await this.accessListContract.deployTransaction.wait();
    let event = getEventFromTx(txReceipt, 'NewAccessList')
    assert(event, "Cannot find NewAccessList event")
    const contractAddress = event.args[0];
    assert(contractAddress==this.accessListContract.address,"Access list contract address missmatch")
    // Get the contractOwner and collector address
    signers = await ethers.getSigners();

  });


  // Test cases
  it('Check token name', async function () {
    expect(await this.accessListContract.name()).to.exist;
    
  });

  it('Check token symbol', async function () {
    expect(await this.accessListContract.symbol()).to.exist;
  });


  it('Mints one token, using mint', async function () {
    const tx=await this.accessListContract.mint(signers[0].address,JSON.stringify(metadata));
    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt, 'AddressAdded')
    assert(event, "Cannot find AddressAdded event")
    const walletAddress = event.args[0];
    assert(walletAddress==signers[0].address,"AddressAdded event:  wallet address missmatch")
    this.tokenID++;
    expect(await this.accessListContract.balanceOf(signers[0].address)).to.equal(1);
    expect(await this.accessListContract.ownerOf(this.tokenID)).to.equal(signers[0].address);
  });

  it('Mints several tokens, using batchMint', async function () {
    const addresses=[]
    const tokenURIs=[]
    
    for (let i = 1; i < 4; i++) {
        addresses.push(signers[i].address)
        tokenURIs.push(JSON.stringify(metadata))
    }
    await this.accessListContract.batchMint(addresses,tokenURIs);
    expect(await this.accessListContract.balanceOf(signers[1].address)).to.equal(1);
    expect(await this.accessListContract.ownerOf(2)).to.equal(signers[1].address);

    //signer[4] should not have any nft
    expect(await this.accessListContract.balanceOf(signers[4].address)).to.equal(0);
  });

    
  it('Only owner can mint', async function () {
        await expect(
            this.accessListContract.connect(signers[1])
            .mint(signers[0].address,JSON.stringify(metadata)))
            .to.be.revertedWith("Ownable: caller is not the owner")

        await expect(
                this.accessListContract.connect(signers[1])
                .batchMint([signers[0].address,signers[1].address],[JSON.stringify(metadata),JSON.stringify(metadata)]))
                .to.be.revertedWith("Ownable: caller is not the owner")
  });

  it('Is able to query the NFT tokenURI', async function () {
    expect(await this.accessListContract.tokenURI(1)).to.equal(JSON.stringify(metadata));
  });

  it('Emits a transfer event for newly minted NFTs', async function () {
    await expect(this.accessListContract.mint(signers[1].address,JSON.stringify(metadata)))
    .to.emit(this.accessListContract, "Transfer")
    .withArgs("0x0000000000000000000000000000000000000000", signers[1].address, 5); 
  });

  it('Is not able to transfer NFTs to another wallet when called by user', async function () {
    await expect(this.accessListContract["safeTransferFrom(address,address,uint256)"](signers[0].address,signers[2].address,1)).to.be.revertedWith("Token not transferable");
  });

  it('Is not able to transfer NFTs to another wallet when called by contract owner', async function () {
    await expect(this.accessListContract["safeTransferFrom(address,address,uint256)"](signers[0].address,signers[1].address,2)).to.be.revertedWith("ERC721: caller is not token owner or approved");
  });

  it('Is should mint to test burn', async function () {
  await expect(this.accessListContract.mint(signers[1].address,JSON.stringify(metadata)))
    .to.emit(this.accessListContract, "Transfer")
    .withArgs("0x0000000000000000000000000000000000000000", signers[1].address, 6); 
    await expect(this.accessListContract.mint(signers[2].address,JSON.stringify(metadata)))
    .to.emit(this.accessListContract, "Transfer")
    .withArgs("0x0000000000000000000000000000000000000000", signers[2].address, 7); 
  });

  it('Owner should be able to burn', async function () {
    const thisTokenId=6
    const howMany=await this.accessListContract.balanceOf(signers[1].address)
    expect(await this.accessListContract.ownerOf(thisTokenId)).to.equal(signers[1].address);
    const tx=await this.accessListContract.burn(thisTokenId);
    const txReceipt = await tx.wait();
    let event = getEventFromTx(txReceipt, 'AddressRemoved')
    assert(event, "Cannot find AddressRemoved event")
    const walletAddress = event.args[0];
    assert(event.args[0]==thisTokenId,"AddressRemoved event:  tokenId missmatch")
    expect(await this.accessListContract.balanceOf(signers[1].address)).to.equal(howMany-1);
    

  });
  it('Other users should not be able to burn', async function () {
    expect(await this.accessListContract.ownerOf(7)).to.equal(signers[2].address);
    await expect(this.accessListContract.connect(signers[3]).burn(7)).to.be.revertedWith("ERC721: Not owner");
    
  });
  it('Token holder should be able to burn', async function () {
    expect(await this.accessListContract.ownerOf(7)).to.equal(signers[2].address);
    const howMany=await this.accessListContract.balanceOf(signers[2].address)
    await this.accessListContract.connect(signers[2]).burn(7);
    expect(await this.accessListContract.balanceOf(signers[2].address)).to.equal(howMany-1);
    
  });

});