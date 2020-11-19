[![banner](https://raw.githubusercontent.com/oceanprotocol/art/master/github/repo-banner%402x.png)](https://oceanprotocol.com)

<h1 align="center">Ocean Protocol Contracts Arhitecture</h1>

---

**This is in alpha state and you can expect running into problems. Still early WIP**

---


----
*One Eye Trader,staker,vester bot  (aka 1SS)*

Rule: only one “pool” to interact with. There’s no way for user to e.g. stake without bot interference (we *want* bot interference)

Options to implement:
BPool calls functions from 1SSx.sol (where many possible x). Bot is owned by the pool. No one else can call the 1SS functions.

Roles:
 - has role of the owner of DT (publisher gets nothing, he only gets DT for data consumption)
 - during the burn-in period, is called by the pool to replace the buyDT/sellDT(if allowed) calls. Thus, buying/selling DT using a pre-defined schema 
 - after the burn-in period, acts as a staker bot, compensating pool liquidity adds in basetoken (keeping the *price unchanged*). 
 - can have a vest function, to distribute a specified amount of DT to publisher over a period of X blocks
 - all trading calls(buy/sell/stake,etc) can be called only by the pool

Burn-in period is defined as a block#  (= last block in which the bot will act as buyer/seller DT)

Each 1ss Compatible contract accepts an uint256 ssParams argument, in order to set some internals (rates, bonding curves, vesting, etc..).Check the docs for each!

When deploing a new DT, you can choose a 1ss based on type (FRE,Bonding,Dutch)  or create your own (be sure to export the required minimal functions, see ssCompatible interface)

---

Example :

First phase: publishing
* Publisher choose burn-in approach: (a) fixed price (b) Dutch.  Note: there will always be one-sided DT staking after burn-in period. 
* Publisher chooses length of burn-in period (1 hour - 1 wk). It will auto-compute the burn-in end block block # upon publishing.
* Publisher chooses % going to publisher (max 5%), and vesting time (6 mos - 24 mos)
* Publisher A creates DT with a total cap, default 100M. But instead of minting them to his address, all DT are sent to 1SS contract that does burn-in, one-sided staking, and vesting.
* Publisher deploys new pool by calling BFactory with 1SS address. 

New phase: Burn-in period.
* Pool defers buy/sell to the 1SS contact. Disabled: sell DT, add liquidity, remove liquidity. Allowed: buy (according to bot rule), consume.
* Publisher A buys DT from pool  (which defers internally to 1SS)
* User A buys DT from pool (which defers internally to 1SS)

New phase: Early open market.
* 1SS will add its OCEAN reserve(DT sells in burn period) for this pool and corresponding DT into the pool. Price is set from burn-in period result (set by fixed price or Dutch auction final price).
* User C stakes 100 OCEAN to the pool. 1SS auto-stakes DT to the pool to preserve price (keep ratio of # DT : # OCEAN constant)
* User C unstakes his OCEAN tokens. 1SS auto-unstakes removes DT from the pool (compute how many DT for shares = # shares spent by user D)
* User D buys DT from pool (price of DT goes up). (Equivalent: user D sells OCEAN to the pool). 1SS has no action.
* User D sells DT to the pool (price of DT goes down). (Equivalent: user D buys OCEAN from the pool). 1SS has no action.
* User E stakes 100 OCEAN to the pool. 1SS auto-stakes more DT to preserve price.
* User E stakes both DT & Ocean to pool.  1SS has no action
* User E unstakes both DT & OCEAN from the pool.  1SS has no action
* <at some point, 1SS runs out of DT. This is when enough people will add only Ocean

New phase: fully open market.
* User C stakes 100 OCEAN to pool. 1SS has no action. Instead, it auto-buys 50% of the OCEAN in DTs; user C gets BPTs; DT price goes up.
* User C unstakes 100 OCEAN. 1SS has no action. Instead, it auto-sells 50% of the DT for OCEAN; user C spends BPTs and gets OCEAN; DT price goes down.
* User D buys DT from pool (price of DT goes up). (Equivalent: user D sells OCEAN to the pool). 1SS has no action.
* User D sells DT to the pool (price of DT goes down). (Equivalent: user D buys OCEAN from the pool). 1SS has no action.

---


**Flow for publish:(in a single web3 transaction: DTFactory. createToken)**


1. DTFactory creates a Datatoken and sets the minter role to 1ss

2. DTFactory calls BFactory to create a pool, setting the 1ss as a controller 

3. DTFactory calls 1ss to mint all DT and set the rates and vesting




