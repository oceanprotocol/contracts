# Solidity API

## IERC725Y

_Contract module which provides the ability to set arbitrary key value sets that can be changed over time.
It is intended to standardise certain keys value pairs to allow automated retrievals and interactions
from interfaces and other smart contracts.

ERC 165 interface id: 0x2bd57b73

`setData` should only be callable by the owner of the contract set via ERC173._

### DataChanged

```solidity
event DataChanged(bytes32 key, bytes value)
```

_Emitted when data at a key is changed._

### getData

```solidity
function getData(bytes32 key) external view returns (bytes value)
```

_Gets data at a given `key`_

