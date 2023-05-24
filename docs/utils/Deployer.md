# Solidity API

## Deployer

_Contract Deployer
     This contract allowes factory contract 
     to deploy new contract instances using
     the same library pattern in solidity.
     the logic it self is deployed only once, but
     executed in the context of the new storage 
     contract (new contract instance)_

### InstanceDeployed

```solidity
event InstanceDeployed(address instance)
```

### deploy

```solidity
function deploy(address _logic) internal returns (address instance)
```

