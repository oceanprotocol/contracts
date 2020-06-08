## `Deployer`



Contract Deployer
This contract allowes factory contract 
to deploy new contract instances using
the same library pattern in solidity.
the logic it self is deployed only once, but
executed in the context of the new storage 
contract (new contract instance)


### `deploy(address _logic) → address instance` (internal)



deploy
deploy new contract instance 



### `InstanceDeployed(address instance)`





