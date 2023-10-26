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
         

The following table sums it up
Template # | Label | Allows fre/dispense by default? | Allows custody of datatokens? | Combines txs? | Purpose
:----: | :----: | :----: | :----: | :----:| :----:
1 | ERC20Template | Y | Y | N | General
2 | ERC20TemplateEnterprise | N | N | Y | General
3 | ERC20Template3 | N | N | Y | Predictoor

