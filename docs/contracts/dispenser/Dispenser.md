## `Dispenser`






### `status(address datatoken) → bool active, address owner, bool minterApproved, bool isTrueMinter, uint256 maxTokens, uint256 maxBalance, uint256 balance` (external)



status
    Get information about a datatoken dispenser


### `activate(address datatoken, uint256 maxTokens, uint256 maxBalance)` (external)



activate
    Activate a new dispenser


### `deactivate(address datatoken)` (external)



deactivate
    Deactivate an existing dispenser


### `acceptMinter(address datatoken)` (external)



acceptMinter
    Accepts Minter role  (existing datatoken minter has to call datatoken.proposeMinter(dispenserAddress) first)


### `removeMinter(address datatoken)` (external)



removeMinter
    Removes Minter role and proposes the owner as a new minter (the owner has to call approveMinter after this)


### `dispense(address datatoken, uint256 amount)` (external)



dispense
    Dispense datatokens to caller. The dispenser must be active, hold enough DT (or be able to mint more) and respect maxTokens/maxBalance requirements


### `ownerWithdraw(address datatoken)` (external)



ownerWithdraw
    Allow owner to withdraw all datatokens in this dispenser balance


### `fallback()` (external)






### `Activated(address datatokenAddress)`





### `Deactivated(address datatokenAddress)`





### `AcceptedMinter(address datatokenAddress)`





### `RemovedMinter(address datatokenAddress)`





### `TokensDispensed(address datatokenAddress, address userAddress, uint256 amount)`





### `OwnerWithdrawed(address datatoken, address owner, uint256 amount)`





