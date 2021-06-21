NFT Owner: 
- assign Managers
- when creating the NFT, the NFT Owner is added as Manager too.
- if the NFT is transferred, new NFT Owner has to reassign itself as Manager

Managers:
- can assign or revoke main roles for the ERC721 contract.
- can call executeCall (ERC725X implementation), another role?? 

MAIN ROLES:

ERC20Deployers:
- can assign ERC20 Minter at the ERC20 Contract level.
- can update ERC725Y key value store from ERC20Contract level to ERC721. Key is a preset value specific to each individual ERC20Contract but stored in the same ERC721 Contract.

MetadataUpdater:
- can update the Metadata for Ocean Aquarius
NOTE: when updating metadata, it will also store this information with the METADATA_KEY

Store Updater:
- can store, remove update arbitrary key-value following ERC725Y implementation (ERC721 level)




Both in ERC725 and ERC20 contract there’s a function called cleanPermissions:
ERC725: clean all permissions: Manager, ERC20Deployer, MetadataUpdate,Store Updater. After this call even the NFT Owner has to reassign itself as Manager.
ERC20: clean Minter Permissions. 

V3 Integration:
UPDATE: v3DT Owner has to proposeMinter() with the ERC721Contract address as argument, BEFORE calling wrapV3DT
The current V3 has only ERC20 which are controlled by the ‘minter’. Minter is also the only one who can update metadata in Metadata.sol
1 Way of supporting V3 could be to leave it as standalone, so that there would be 2 separate dapps running.

If we want to integrate already deployed ERC20 datatokens, one possible solution could be to allow a user who has created an NFT from the ERC721 Factory, to add a V3 ERC20datatoken if minter == user. 
At 721 contract level, Function wrapV3DT receives 2 arguments: the ERC20 datatoken you want to wrap and the newMinter address.
We first check if the msg.sender is the minter of the datatoken (if is the owner as per V3 specs).
Then we register it into a mapping.
Next line we accept the minter role.
The last line adds the newMinter to the Roles struct at 721 level.

function wrapV3DT(address datatoken, address newMinter) external onlyNFTOwner{
require(IV3ERC20(datatoken).minter() == msg.sender, 'ERC725Template: NOT ERC20 V3 datatoken owner');
v3DT[datatoken] = true;
IV3ERC20(datatoken).approveMinter();
_addV3Minter(newMinter);


}

After we ‘wrapped’ the v3 DT, we can mint new dt using mintV3DT.
This function receives 3 arguments, (datatoken address, to whom we send and the amount)
Only user with v3Minter permission can mint new v3DT.
The NFT owner still stays in control since can add or remove minters.(actually the manager can do it).

function mintV3DT(address datatoken, address to, uint256 value) external {
Roles memory user = permissions[msg.sender];
require(user.v3Minter == true, "ERC725Template: NOT v3 MINTER");
require(v3DT[datatoken] == true, 'NOT V3 datatoken');
IV3ERC20(datatoken).mint(to,value);
}


This way we can still offering support to v3 but allowing owner to have an NFT for new v4 DT, roles and everything we offer in v4.
Some notes I left in the code:
// move minter() to this contract(721), add newMinter which is the only one who can trigger mintV3DT
// PROS: 
// easy migration v3, 
// now the minter is this contract, which is controlled by the NFT owner, which consequently is the owner of the V3 DT
// newMinter is set in the same function, allowing newMinter to mint on any registered datatoken in wrapV3DT. 
// 
// if the NFT is transferred, cleaning permissions will be sufficient, since the minter() in the datatoken is this contract.
// of course the new owner will have to re-add roles (including v3Minter role)

// CONS: won't have full roles at the v4 ERC20 datatoken( missing FeeManager which rignt now is only a role but we haven't assigned yet what it can do(split fee etc))
// v3Minter right now is able to mint any datatoken registered, could be restricted if needed.
// v3 datatokens don’t have all new v4 ERC20 datatoken features like feeManager role for example.


With this design an owner of a v3 DT can easily integrate it and get all features from V3.
Compared to V4 ERC20 datatokens, v3 minting has to be done from the ERC721 contract instead of doing it directly from the ERC20.

On the Metadata side, we added this function at the 721 level.

function setDataV3(address datatoken, bytes calldata _value, bytes calldata flags,
bytes calldata data) external {
Roles memory user = permissions[msg.sender];
require(user.deployERC20 == true, "ERC725Template: NOT erc20 deployer");
require(v3DT[datatoken] == true, 'NOT V3 datatoken');
bytes32 key = keccak256(abi.encodePacked(address(datatoken))); // could be any other key, used a simple configuration
setDataERC20(key, _value); // into the new standard 725Y
IMetadata(_metadata).update(datatoken, flags, data); // Metadata V4 standard for Aqua 
// IMetadata(_metadataV3).update(datatoken, flags, data); // Old Metadata for Aqua (V3 Metadata). We should deprecate this and not support it anymore
// instead we should force V3 migration to start using the new V4 Metadata contract.
}

This function allows to update Metadata on the old V3 where onlyDatatokenMinter modifier still works since the minter is this contract. But we also set the Metadata into the ERC725 Y standard so that it will be able to use all new features.
Here we should discuss if when migrating the V3 metadata should be stored in the old Metadata contract or in the new V4. (in any case we also store it into the ERC725Y standard).