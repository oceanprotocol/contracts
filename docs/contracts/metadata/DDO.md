## `DDO`



DDO stands for Decentralized Document. It allows publishers
to publish their dataset metadata in decentralized way.
It follows the Ocean DID Document standard: 
https://github.com/oceanprotocol/OEPs/blob/master/7/v0.2/README.md

### `onlyDIDOwner(bytes32 did)`






### `create(bytes32 did, bytes flags, bytes data)` (external)



create
creates/publishes new DDO document on-chain. 


### `update(bytes32 did, bytes flags, bytes data)` (external)



update
allows only did owners to update the DDO/metadata content


### `transferOwnership(bytes32 did, address owner)` (external)



transferOwnership
allows only did owners to transfer did ownership



### `DDOCreated(bytes32 did, bytes flags, bytes data, uint256 createdAt, address createdBy)`





### `DDOUpdated(bytes32 did, bytes flags, bytes data, uint256 updatedAt, address updatedBy)`





### `DDOOwnershipTransferred(bytes32 did, address owner)`





