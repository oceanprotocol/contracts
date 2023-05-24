# Solidity API

## EnumerableMap

_Library for managing an enumerable variant of Solidity's
https://solidity.readthedocs.io/en/latest/types.html#mapping-types[`mapping`]
type.

Maps have the following properties:

- Entries are added, removed, and checked for existence in constant time
(O(1)).
- Entries are enumerated in O(n). No guarantees are made on the ordering.

```
contract Example {
    // Add the library methods
    using EnumerableMap for EnumerableMap.UintToAddressMap;

    // Declare a set state variable
    EnumerableMap.UintToAddressMap private myMap;
}
```

As of v3.0.0, only maps of type `uint256 -> address` (`UintToAddressMap`) are
supported._

### MapEntry

```solidity
struct MapEntry {
  bytes32 _key;
  bytes32 _value;
}
```

### Map

```solidity
struct Map {
  struct EnumerableMap.MapEntry[] _entries;
  mapping(bytes32 => uint256) _indexes;
}
```

### UintToAddressMap

```solidity
struct UintToAddressMap {
  struct EnumerableMap.Map _inner;
}
```

### set

```solidity
function set(struct EnumerableMap.UintToAddressMap map, uint256 key, address value) internal returns (bool)
```

_Adds a key-value pair to a map, or updates the value for an existing
key. O(1).

Returns true if the key was added to the map, that is if it was not
already present._

### remove

```solidity
function remove(struct EnumerableMap.UintToAddressMap map, uint256 key) internal returns (bool)
```

_Removes a value from a set. O(1).

Returns true if the key was removed from the map, that is if it was present._

### contains

```solidity
function contains(struct EnumerableMap.UintToAddressMap map, uint256 key) internal view returns (bool)
```

_Returns true if the key is in the map. O(1)._

### length

```solidity
function length(struct EnumerableMap.UintToAddressMap map) internal view returns (uint256)
```

_Returns the number of elements in the map. O(1)._

### at

```solidity
function at(struct EnumerableMap.UintToAddressMap map, uint256 index) internal view returns (uint256, address)
```

_Returns the element stored at position `index` in the set. O(1).
Note that there are no guarantees on the ordering of values inside the
array, and it may change when more values are added or removed.

Requirements:

- `index` must be strictly less than {length}._

### tryGet

```solidity
function tryGet(struct EnumerableMap.UintToAddressMap map, uint256 key) internal view returns (bool, address)
```

_Tries to returns the value associated with `key`.  O(1).
Does not revert if `key` is not in the map.

_Available since v3.4.__

### get

```solidity
function get(struct EnumerableMap.UintToAddressMap map, uint256 key) internal view returns (address)
```

_Returns the value associated with `key`.  O(1).

Requirements:

- `key` must be in the map._

### get

```solidity
function get(struct EnumerableMap.UintToAddressMap map, uint256 key, string errorMessage) internal view returns (address)
```

_Same as {get}, with a custom error message when `key` is not in the map.

CAUTION: This function is deprecated because it requires allocating memory for the error
message unnecessarily. For custom revert reasons use {tryGet}._

