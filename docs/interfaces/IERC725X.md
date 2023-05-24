# Solidity API

## IERC725X

_Contract module which provides the ability to call arbitrary functions at any other smart contract and itself,
including using `delegatecall`, as well creating contracts using `create` and `create2`.
This is the basis for a smart contract based account system, but could also be used as a proxy account system.

ERC 165 interface id: 0x44c028fe

`execute` should only be callable by the owner of the contract set via ERC173._

### ContractCreated

```solidity
event ContractCreated(address contractAddress)
```

_Emitted when a contract is created._

### Executed

```solidity
event Executed(uint256 _operation, address _to, uint256 _value, bytes _data)
```

_Emitted when a contract executed._

