## `Metadata`



Metadata stands for Decentralized Document. It allows publishers
to publish their dataset metadata in decentralized way.
It follows the Ocean DID Document standard: 
https://github.com/oceanprotocol/OEPs/blob/master/7/v0.2/README.md

### `onlyDataTokenMinter(address dataToken)`






### `create(address dataToken, bytes flags, bytes data)` (external)



create
creates/publishes new metadata/DDO document on-chain. 


### `update(address dataToken, bytes flags, bytes data)` (external)



update
allows only datatoken minter(s) to update the DDO/metadata content



### `MetadataCreated(address dataToken, address createdBy, bytes flags, bytes data)`





### `MetadataUpdated(address dataToken, address updatedBy, bytes flags, bytes data)`





