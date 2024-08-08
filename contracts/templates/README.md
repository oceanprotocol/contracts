Ocean-contracts v1.x (Ocean V4 “Onda”) is built on top of templates, in order to accomodate severals scenarios which are mutually exclusive


# ERC721 Templates
    Only [ERC721Template](ERC721Template.sol) is defined, and has the following specs:
     - adhers to standard ERC721 implementation, but allows only one tokenId (==1). Any operation involving tokenId>1 will revert
     - has functions to deal with metadata (DDO)
     - has roles
     - allows creation of datatokens (caller chooses the datatoken template)

# ERC20 Templates

    For now, three templates are defined:
        - [ERC20Template](#ERC20Template)
        - [ERC20TemplateEnterprise](#ERC20TemplateEnterprise)
        - [ERC20Template3](#ERC20Template3)

### ERC20Template
    - follows the mental model of "get datatokens" then "pass them around" then "consume".
    - requires 2 tx to consume 
        1. get tokens (buy, dispense, etc)
        2. call startOrder
    - has the following price schemas:
        - pools  (deprecated)
        - fixed rate exchanges
        - dispensers

### ERC20TemplateEnterprise
    - follows the mental model of "do not have datatokens in circulation". Means that in a single tx, datatoken is minted, exchanged, used and burned.
    - requires 1 tx to consume: (buyFromFreAndOrder / buyFromDispenserAndOrder)
    - does not allow self custody of datatokens (means that nobody can get tokens from dispensers or fixed rate exchangers)
    - has the following price schemas:
        - fixed rate exchanges
        - dispensers

### ERC20Template3  (Predictoor)
    - designed to work only on Oasis Sapphire, due to privacy features
    - requires 1 tx to consume: buyFromFreAndOrder
    - does not allow self custody of datatokens (means that nobody can buy a datatoken from fixed rate exchange)
    - has the following price schemas:
        - fixed rate exchanges
         
### ERC20Template4 (asset files object stored in contract)
    - follows same functions and principles as ERC20TemplateEnterprise, with the following additions
    - should be deployed only on Oasis Sapphire, and all transactions should be encrypted, otherwise security is compromised
    - on initialize, files object(asset URLs) is stored in the contract
    - owner can change files object anytime, calling setFilesObject
    - for every order, consumer and serviceId are added to a mapping
    - has a list of allowed/denied providers (using standard ERC721.balanceOf). Contracts addresses can be changed by owner
    - when a provider tries to fetch the files object (by calling getFilesObject), the following conditions are checked:
        - provider address has to be in allow list and not on deny list (given those lists are not address_zero)
        - consumer has to have a valid order

The following table sums it up
Template # | Label | Allows fre/dispense by default? | Allows custody of datatokens? | Combines txs? | File object stored in contract | Purpose
:----: | :----: | :----: | :----: | :----:| :----:| :----:
1 | ERC20Template | Y | Y | N | N | General
2 | ERC20TemplateEnterprise | N | N | Y | N |General
3 | ERC20Template3 | N | N | Y | N | Predictoor
4 | ERC20TemplateSapphire | N | N | Y | Y | General

