# Solidity API

## IERC721Template

_Required interface of an ERC721 compliant contract._

### RolesType

```solidity
enum RolesType {
  Manager,
  DeployERC20,
  UpdateMetadata,
  Store
}
```

### Transfer

```solidity
event Transfer(address from, address to, uint256 tokenId)
```

_Emitted when `tokenId` token is transferred from `from` to `to`._

### Approval

```solidity
event Approval(address owner, address approved, uint256 tokenId)
```

_Emitted when `owner` enables `approved` to manage the `tokenId` token._

### ApprovalForAll

```solidity
event ApprovalForAll(address owner, address operator, bool approved)
```

_Emitted when `owner` enables or disables (`approved`) `operator` to manage all of its assets._

### MetadataCreated

```solidity
event MetadataCreated(address createdBy, uint8 state, string decryptorUrl, bytes flags, bytes data, string metaDataDecryptorAddress, uint256 timestamp, uint256 blockNumber)
```

### MetadataUpdated

```solidity
event MetadataUpdated(address updatedBy, uint8 state, string decryptorUrl, bytes flags, bytes data, string metaDataDecryptorAddress, uint256 timestamp, uint256 blockNumber)
```

### balanceOf

```solidity
function balanceOf(address owner) external view returns (uint256 balance)
```

_Returns the number of tokens in ``owner``'s account._

### name

```solidity
function name() external view returns (string)
```

### symbol

```solidity
function symbol() external view returns (string)
```

### ownerOf

```solidity
function ownerOf(uint256 tokenId) external view returns (address owner)
```

_Returns the owner of the `tokenId` token.

Requirements:

- `tokenId` must exist._

### isERC20Deployer

```solidity
function isERC20Deployer(address acount) external view returns (bool)
```

### safeTransferFrom

```solidity
function safeTransferFrom(address from, address to, uint256 tokenId) external
```

_Safely transfers `tokenId` token from `from` to `to`, checking first that contract recipients
are aware of the ERC721 protocol to prevent tokens from being forever locked.

Requirements:

- `from` cannot be the zero address.
- `to` cannot be the zero address.
- `tokenId` token must exist and be owned by `from`.
- If the caller is not `from`, 
it must be have been allowed to move this token by either {approve} or {setApprovalForAll}.
- If `to` refers to a smart contract, 
it must implement {IERC721Receiver-onERC721Received}, which is called upon a safe transfer.

Emits a {Transfer} event._

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 tokenId) external
```

_Transfers `tokenId` token from `from` to `to`.

WARNING: Usage of this method is discouraged, use {safeTransferFrom} whenever possible.

Requirements:

- `from` cannot be the zero address.
- `to` cannot be the zero address.
- `tokenId` token must be owned by `from`.
- If the caller is not `from`, it must be approved to move this token by either {approve} or {setApprovalForAll}.

Emits a {Transfer} event._

### approve

```solidity
function approve(address to, uint256 tokenId) external
```

_Gives permission to `to` to transfer `tokenId` token to another account.
The approval is cleared when the token is transferred.

Only a single account can be approved at a time, so approving the zero address clears previous approvals.

Requirements:

- The caller must own the token or be an approved operator.
- `tokenId` must exist.

Emits an {Approval} event._

### getApproved

```solidity
function getApproved(uint256 tokenId) external view returns (address operator)
```

_Returns the account approved for `tokenId` token.

Requirements:

- `tokenId` must exist._

### setApprovalForAll

```solidity
function setApprovalForAll(address operator, bool _approved) external
```

_Approve or remove `operator` as an operator for the caller.
Operators can call {transferFrom} or {safeTransferFrom} for any token owned by the caller.

Requirements:

- The `operator` cannot be the caller.

Emits an {ApprovalForAll} event._

### isApprovedForAll

```solidity
function isApprovedForAll(address owner, address operator) external view returns (bool)
```

_Returns if the `operator` is allowed to manage all of the assets of `owner`.

See {setApprovalForAll}_

### transferFrom

```solidity
function transferFrom(address from, address to) external
```

_Safely transfers `tokenId` token from `from` to `to`.

Requirements:

- `from` cannot be the zero address.
- `to` cannot be the zero address.
- `tokenId` token must exist and be owned by `from`.
- If the caller is not `from`, it must be approved to move this token by either {approve} or {setApprovalForAll}.
- If `to` refers to a smart contract, 
it must implement {IERC721Receiver-onERC721Received}, which is called upon a safe transfer.

Emits a {Transfer} event._

### initialize

```solidity
function initialize(address admin, string name, string symbol, address erc20Factory, address additionalERC20Deployer, address additionalMetaDataUpdater, string tokenURI, bool transferable) external returns (bool)
```

### Roles

```solidity
struct Roles {
  bool manager;
  bool deployERC20;
  bool updateMetadata;
  bool store;
}
```

### metaDataProof

```solidity
struct metaDataProof {
  address validatorAddress;
  uint8 v;
  bytes32 r;
  bytes32 s;
}
```

### getPermissions

```solidity
function getPermissions(address user) external view returns (struct IERC721Template.Roles)
```

### setDataERC20

```solidity
function setDataERC20(bytes32 _key, bytes _value) external
```

### setMetaData

```solidity
function setMetaData(uint8 _metaDataState, string _metaDataDecryptorUrl, string _metaDataDecryptorAddress, bytes flags, bytes data, bytes32 _metaDataHash, struct IERC721Template.metaDataProof[] _metadataProofs) external
```

### getMetaData

```solidity
function getMetaData() external view returns (string, string, uint8, bool)
```

### createERC20

```solidity
function createERC20(uint256 _templateIndex, string[] strings, address[] addresses, uint256[] uints, bytes[] bytess) external returns (address)
```

### removeFromCreateERC20List

```solidity
function removeFromCreateERC20List(address _allowedAddress) external
```

### addToCreateERC20List

```solidity
function addToCreateERC20List(address _allowedAddress) external
```

### addToMetadataList

```solidity
function addToMetadataList(address _allowedAddress) external
```

### removeFromMetadataList

```solidity
function removeFromMetadataList(address _allowedAddress) external
```

### getId

```solidity
function getId() external pure returns (uint8)
```

