When a new NFT contract is created, we can assign an NFT Owner which will be set as Manager too.

ALL ROLES CAN BE ASSIGNED TO MULTIPLE USERS, NFT Owner excluded :D

ERC721 ROLES

NFT Owner: 
- assign Managers
- when creating the NFT, the NFT Owner is added as Manager too.

Managers:
- can assign or revoke main roles for the ERC721 contract.
- can call executeCall (ERC725X implementation) 

MAIN ROLES:

1) ERC20Deployer:
- can assign ROLES at the ERC20 Contract level.
- can update ERC725Y key value store from ERC20Contract level to ERC721. Key is a preset value specific to each individual ERC20Contract but stored in the same ERC721 Contract.

2) MetadataUpdater:
- can update the Metadata for Ocean Aquarius
NOTE: when updating metadata, it will also store this information with the METADATA_KEY

3) Store Updater:
- can store, remove or update arbitrary key-value following ERC725Y implementation (ERC721 level)

ERC20 ROLES:
ERC20 Roles are managed by the ERC20Deployers at 721 LEVEL

- Minter: can mint new DT20 tokens if cap is not exceeded
- Fee Manager: can set a new Fee Collector, if not set, NFT Owner is the fee Collector

When an NFT is transferred, all ROLES ARE AUTOMATICALLY REVOKED both at 721 and 20 level and feeCollector is set to NFT Owner and has to be set again.
The new Owner is automatically assigned as Manager. 



Both in ERC725 and ERC20 contract there’s a function called cleanPermissions:
ERC725: clean all permissions: Manager, ERC20Deployer, MetadataUpdate,Store Updater. After this call even the NFT Owner has to reassign itself as Manager.
ERC20: clean Minter and Fee Manager Permissions. 

