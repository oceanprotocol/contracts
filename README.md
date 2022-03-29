[![banner](https://raw.githubusercontent.com/oceanprotocol/art/master/github/repo-banner%402x.png)](https://oceanprotocol.com)

<h1 align="center">contracts-v4</h1>

> 🦑 Smart contracts for Ocean Protocol v4. https://oceanprotocol.com
Ocean v4 is part of the [Ocean Protocol](https://oceanprotocol.com) toolset.

This is in beta state and you can expect running into problems. If you run into them, please open up a [new issue](https://github.com/oceanprotocol/contracts/issues/new?assignees=&labels=bug&template=bug_report.md&title=).

- [📚 Installation](#-installation)
- [🏄 Quickstart](#-quickstart)
  - [Features](#features)
  - [Publisher Flow](#publisher-flow)
  - [Roles Diagram](#roles-diagram)
  - [Functions you will need](#functions-you-will-need)
  - [Bundle functions](#bundle-functions)
- [🦑 Development and testing](#-development-testing)
- [Known issues](#known-issues)
- [🏛 License](#-license)

## 📚 Installation

For quick installation of the contract `ABIs`:

### Javascript/Typescript
```bash
npm install @oceanprotocol/contracts
```
### Python
```bash
pip3 install ocean-contracts
```
#### ⚙️ Usage
By default, Python does not support importing `json` files directly, so it is recommended to use `json-sempai` package in order to automatically importing `ABIs/json` artifacts.
```
pip3 install json-sempai
# install the ocean-contracts package.
```
```python
from jsonsempai import magic
from artifacts import address
```


## Overview

![image](docs/images/smart-contracts.png)

## 🏄 Quickstart

### Features 

- Base IP is now represented by an NFT, from which a datapublisher can create multiple ERC20s representing different type of access for the same dataset. (Link to NFT blog)

- An automated Datatoken Staking and Vesting contract helps with the initial DTs distribution and price stability. Goodbye rug pulls! More info on how it works: (Link to SideStaking blog)

- Help Ocean Community Monetize: there's a swap fee for the Ocean Community, if Ocean or allied tokens are the basetoken in a pool, Ocean Community will receive 0.1% swap fee, otherwhise it will be 0.2%. More details here: (Link to blog post on Ocean community monetization)


#### Flexibility

- Introduce an advanced Fee Structure both for Market and Provider runners. (add link to fee post/docs when available)

- Roles Administration: there are now multiple roles for a more flexible administation both at NFT and ERC20 levels

- Key-value store in the NFT contract : NFT contract can be used to store custom key-value pairs (ERC725Y standard)

- Multiple NFT template support: the Factory can deploy different types of NFT templates

- Multiple datatoken template support: the Factory can deploy different types of Datatoken templates





### Publisher Flow

Interaction flow from DataPublisher point of view.

[Go to publisher flow](docs/quickstart_pubFlow.md)

### Roles Diagram

How roles are handled in the v4.

[Go to roles diagram](docs/quickstart_roles.md)


### Functions you will need

Selection of most common functions.

[Go to functions](docs/quickstart_functions.md)


### Bundle functions

Helper functions which can perform multiple steps in 1 call.

[Go to helpers](docs/quickstart_bundle.md)



If you have any difficulties with the quickstarts, or if you have further questions about how to use the contracts please reach out to us on [Discord](https://discord.gg/TnXjkR5).

If you notice any bugs or issues with this repo please [open an issue on github](https://github.com/oceanprotocol/contracts/issues/new?assignees=&labels=bug&template=bug_report.md&title=). -->



The [ocean.js](https://github.com/oceanprotocol/ocean.js) and [ocean.py](https://github.com/oceanprotocol/ocean.py) libraries wrap `contracts` in JavaScript and Python respectively. They each have quickstart guides.


## 🦑 Development and Testing

Run hardhat in a new terminal:
```bash
export ALCHEMY_URL="https://eth-mainnet.alchemyapi.io/v2/XXXXXXXX"
npm install
npx hardhat node
```

Open a new terminal to run the tests:

```bash
export ALCHEMY_URL="https://eth-mainnet.alchemyapi.io/v2/XXXXXXXX"

npm run test:full
# same thing, but with coverage reporting
npm run test:full:cover
```

### Unit Tests

You can execute just unit tests with:

```bash
npm run test:unit

```

### Flow Tests

You can execute just flow tests with:

```bash
npm run test:flow

```

## Known issues
 Vesting:
  - when (vestingAmount/vestedBlocks) is a Periodic number, there’s a rounding issue of 1 wei. So if a publisher will call it once per day, over a period of 2 years, you may have a rounding error combined of 730 Weis. That is a neglectable amount.



## 🏛 License

```
Copyright ((C)) 2022 Ocean Protocol Foundation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
