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