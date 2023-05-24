# Solidity API

## ERC721Template

### hasMetaData

```solidity
bool hasMetaData
```

### metaDataDecryptorUrl

```solidity
string metaDataDecryptorUrl
```

### metaDataDecryptorAddress

```solidity
string metaDataDecryptorAddress
```

### metaDataState

```solidity
uint8 metaDataState
```

### transferable

```solidity
bool transferable
```

### TokenCreated

```solidity
event TokenCreated(address newTokenAddress, address templateAddress, string name, string symbol, uint256 cap, address creator)
```

### MetadataCreated

```solidity
event MetadataCreated(address createdBy, uint8 state, string decryptorUrl, bytes flags, bytes data, bytes32 metaDataHash, uint256 timestamp, uint256 blockNumber)
```

### MetadataUpdated

```solidity
event MetadataUpdated(address updatedBy, uint8 state, string decryptorUrl, bytes flags, bytes data, bytes32 metaDataHash, uint256 timestamp, uint256 blockNumber)
```

### MetadataValidated

```solidity
event MetadataValidated(address validator, bytes32 metaDataHash, uint8 v, bytes32 r, bytes32 s)
```

### MetadataState

```solidity
event MetadataState(address updatedBy, uint8 state, uint256 timestamp, uint256 blockNumber)
```

### TokenURIUpdate

```solidity
event TokenURIUpdate(address updatedBy, string tokenURI, uint256 tokenID, uint256 timestamp, uint256 blockNumber)
```

### onlyNFTOwner

```solidity
modifier onlyNFTOwner()
```

### initialize

```solidity
function initialize(address owner, string name_, string symbol_, address tokenFactory, address additionalERC20Deployer, address additionalMetaDataUpdater, string tokenURI, bool transferable_) external returns (bool)
```

_initialize
     Calls private _initialize function. Only if contract is not initialized.
            This function mints an NFT (tokenId=1) to the owner and add owner as Manager Role_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| owner | address | NFT Owner |
| name_ | string | NFT name |
| symbol_ | string | NFT Symbol |
| tokenFactory | address | NFT factory address |
| additionalERC20Deployer | address | address of additionalERC20Deployer |
| additionalMetaDataUpdater | address | address of additionalMetaDataUpdater |
| tokenURI | string | tokenURI |
| transferable_ | bool | if set to false, this NFT is non-transferable            @return boolean |

### _initialize

```solidity
function _initialize(address owner, string name_, string symbol_, address tokenFactory, string tokenURI, bool transferable_) internal returns (bool)
```

__initialize
     Calls private _initialize function. Only if contract is not initialized.
      This function mints an NFT (tokenId=1) to the owner
      and add owner as Manager Role (Roles admin)_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| owner | address | NFT Owner |
| name_ | string | NFT name |
| symbol_ | string | NFT Symbol |
| tokenFactory | address | NFT factory address |
| tokenURI | string | tokenURI for token 1            @return boolean |
| transferable_ | bool |  |

### setTokenURI

```solidity
function setTokenURI(uint256 tokenId, string tokenURI) public
```

_setTokenURI
     sets tokenURI for a tokenId_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenId | uint256 | token ID |
| tokenURI | string | token URI |

### setMetaDataState

```solidity
function setMetaDataState(uint8 _metaDataState) public
```

_setMetaDataState
     Updates metadata state_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _metaDataState | uint8 | metadata state |

### metaDataProof

```solidity
struct metaDataProof {
  address validatorAddress;
  uint8 v;
  bytes32 r;
  bytes32 s;
}
```

### setMetaData

```solidity
function setMetaData(uint8 _metaDataState, string _metaDataDecryptorUrl, string _metaDataDecryptorAddress, bytes flags, bytes data, bytes32 _metaDataHash, struct ERC721Template.metaDataProof[] _metadataProofs) external
```

_setMetaData
    
             Creates or update Metadata for Aqua(emit event)
             Also, updates the METADATA_DECRYPTOR key_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _metaDataState | uint8 | metadata state |
| _metaDataDecryptorUrl | string | decryptor URL |
| _metaDataDecryptorAddress | string | decryptor public key |
| flags | bytes | flags used by Aquarius |
| data | bytes | data used by Aquarius |
| _metaDataHash | bytes32 | hash of clear data (before the encryption, if any) |
| _metadataProofs | struct ERC721Template.metaDataProof[] | optional signatures of entitys who validated data (before the encryption, if any) |

### _setMetaData

```solidity
function _setMetaData(uint8 _metaDataState, string _metaDataDecryptorUrl, string _metaDataDecryptorAddress, bytes flags, bytes data, bytes32 _metaDataHash, struct ERC721Template.metaDataProof[] _metadataProofs) internal
```

### metaDataAndTokenURI

```solidity
struct metaDataAndTokenURI {
  uint8 metaDataState;
  string metaDataDecryptorUrl;
  string metaDataDecryptorAddress;
  bytes flags;
  bytes data;
  bytes32 metaDataHash;
  uint256 tokenId;
  string tokenURI;
  struct ERC721Template.metaDataProof[] metadataProofs;
}
```

### setMetaDataAndTokenURI

```solidity
function setMetaDataAndTokenURI(struct ERC721Template.metaDataAndTokenURI _metaDataAndTokenURI) external
```

_setMetaDataAndTokenURI
      Helper function to improve UX
             Calls setMetaData & setTokenURI_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _metaDataAndTokenURI | struct ERC721Template.metaDataAndTokenURI | metaDataAndTokenURI struct |

### getMetaData

```solidity
function getMetaData() external view returns (string, string, uint8, bool)
```

_getMetaData
     Returns metaDataState, metaDataDecryptorUrl, metaDataDecryptorAddress_

### createERC20

```solidity
function createERC20(uint256 _templateIndex, string[] strings, address[] addresses, uint256[] uints, bytes[] bytess) external returns (address)
```

_createERC20
       ONLY user with deployERC20 permission (assigned by Manager) can call it
             Creates a new ERC20 datatoken.
            It also adds initial minting and fee management permissions to custom users._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _templateIndex | uint256 | ERC20Template index |
| strings | string[] | refers to an array of strings                      [0] = name                      [1] = symbol |
| addresses | address[] | refers to an array of addresses                     [0]  = minter account who can mint datatokens (can have multiple minters)                     [1]  = feeManager initial feeManager for this DT                     [2]  = publishing Market Address                     [3]  = publishing Market Fee Token |
| uints | uint256[] | refers to an array of uints                     [0] = cap_ the total ERC20 cap                     [1] = publishing Market Fee Amount |
| bytess | bytes[] | refers to an array of bytes                     Currently not used, usefull for future templates            @return ERC20 token address |

### isERC20Deployer

```solidity
function isERC20Deployer(address account) external view returns (bool)
```

_isERC20Deployer_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | true if the account has ERC20 Deploy role |

### name

```solidity
function name() public view returns (string)
```

_name
     It returns the token name._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | Datatoken name. |

### symbol

```solidity
function symbol() public view returns (string)
```

_symbol
     It returns the token symbol._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | Datatoken symbol. |

### isInitialized

```solidity
function isInitialized() external view returns (bool)
```

_isInitialized
     It checks whether the contract is initialized._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | true if the contract is initialized. |

### addManager

```solidity
function addManager(address _managerAddress) external
```

_addManager
     Only NFT Owner can add a new manager (Roles admin)
     There can be multiple minters_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _managerAddress | address | new manager address |

### removeManager

```solidity
function removeManager(address _managerAddress) external
```

_removeManager
     Only NFT Owner can remove a manager (Roles admin)
     There can be multiple minters_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _managerAddress | address | new manager address |

### executeCall

```solidity
function executeCall(uint256 _operation, address _to, uint256 _value, bytes _data) external payable
```

Executes any other smart contract. 
                Is only callable by the Manager.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _operation | uint256 | the operation to execute: CALL = 0; DELEGATECALL = 1; CREATE2 = 2; CREATE = 3; |
| _to | address | the smart contract or address to interact with.           `_to` will be unused if a contract is created (operation 2 and 3) |
| _value | uint256 | the value of ETH to transfer |
| _data | bytes | the call data, or the contract data to deploy |

### setNewData

```solidity
function setNewData(bytes32 _key, bytes _value) external
```

_setNewData
      ONLY user with store permission (assigned by Manager) can call it
            This function allows to set any arbitrary key-value into the 725 standard
     There can be multiple store updaters_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _key | bytes32 | key (see 725 for standard (keccak256))          Data keys, should be the keccak256 hash of a type name.         e.g. keccak256('ERCXXXMyNewKeyType') is 0x6935a24ea384927f250ee0b954ed498cd9203fc5d2bf95c735e52e6ca675e047 |
| _value | bytes | data to store at that key |

### setDataERC20

```solidity
function setDataERC20(bytes32 _key, bytes _value) external
```

_setDataERC20
     ONLY callable FROM the ERC20Template and BY the corresponding ERC20Deployer
            This function allows to store data with a preset key (keccak256(ERC20Address)) into NFT 725 Store_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _key | bytes32 | keccak256(ERC20Address) see setData into ERC20Template.sol |
| _value | bytes | data to store at that key |

### cleanPermissions

```solidity
function cleanPermissions() external
```

_cleanPermissions
     Only NFT Owner  can call it.
     This function allows to remove all ROLES at erc721 level: 
             Managers, ERC20Deployer, MetadataUpdater, StoreUpdater
     Permissions at erc20 level stay._

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 tokenId) external
```

_transferFrom 
     Used for transferring the NFT, can be used by an approved relayer
            Even if we only have 1 tokenId, we leave it open as arguments for being a standard ERC721
            @param from nft owner
            @param to nft receiver
            @param tokenId tokenId (1)_

### safeTransferFrom

```solidity
function safeTransferFrom(address from, address to, uint256 tokenId) external
```

_safeTransferFrom 
     Used for transferring the NFT, can be used by an approved relayer
            Even if we only have 1 tokenId, we leave it open as arguments for being a standard ERC721
            @param from nft owner
            @param to nft receiver
            @param tokenId tokenId (1)_

### _cleanERC20Permissions

```solidity
function _cleanERC20Permissions(uint256 length) internal
```

__cleanERC20Permissions
     Internal function used to clean permissions at ERC20 level when transferring the NFT
            @param length lentgh of the deployedERC20List_

### getId

```solidity
function getId() public pure returns (uint8)
```

_getId
     Return template id in case we need different ABIs. 
     If you construct your own template, please make sure to change the hardcoded value_

### fallback

```solidity
fallback() external payable
```

_fallback function
     this is a default fallback function in which receives
     the collected ether._

### receive

```solidity
receive() external payable
```

_receive function
     this is a default receive function in which receives
     the collected ether._

### withdrawETH

```solidity
function withdrawETH() external payable
```

_withdrawETH
     transfers all the accumlated ether the ownerOf_

### getTokensList

```solidity
function getTokensList() external view returns (address[])
```

### isDeployed

```solidity
function isDeployed(address datatoken) external view returns (bool)
```

### setBaseURI

```solidity
function setBaseURI(string _baseURI) external
```

