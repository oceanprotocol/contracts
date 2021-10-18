[![banner](https://raw.githubusercontent.com/oceanprotocol/art/master/github/repo-banner%402x.png)](https://oceanprotocol.com)

<h1 align="center">contracts-v4</h1>

> 🦑 Smart contracts for Ocean Protocol v4. https://oceanprotocol.com
<!-- 
[![npm](https://img.shields.io/npm/v/@oceanprotocol/lib.svg)](https://www.npmjs.com/package/@oceanprotocol/lib)
[![Build Status](https://github.com/oceanprotocol/ocean.js/workflows/CI/badge.svg)](https://github.com/oceanprotocol/ocean.js/actions)
[![Maintainability](https://api.codeclimate.com/v1/badges/6381c81b8ac568a53537/maintainability)](https://codeclimate.com/github/oceanprotocol/ocean.js/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/6381c81b8ac568a53537/test_coverage)](https://codeclimate.com/github/oceanprotocol/ocean.js/test_coverage)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-7b1173.svg?style=flat-square)](https://github.com/prettier/prettier)
[![js oceanprotocol](https://img.shields.io/badge/js-oceanprotocol-7b1173.svg)](https://github.com/oceanprotocol/eslint-config-oceanprotocol) -->

<!-- With ocean v4, you can:

- **Publish** data services: downloadable files or compute-to-data.
  Ocean creates a new [ERC20](https://github.com/ethereum/EIPs/blob/7f4f0377730f5fc266824084188cc17cf246932e/EIPS/eip-20.md)
  datatoken for each dataset / data service.
- **Mint** datatokens for the service
- **Sell** datatokens via an OCEAN-datatoken Balancer pool (for auto price discovery), or for a fixed price
- **Stake** OCEAN on datatoken pools
- **Consume** datatokens, to access the service
- **Transfer** datatokens to another owner, and **all other ERC20 actions**
  using [web3.js](https://web3js.readthedocs.io/en/v1.2.9/web3-eth-contract.html) etc. -->

ocean v4 is part of the [Ocean Protocol](https://oceanprotocol.com) toolset.

This is in alpha state and you can expect running into problems. If you run into them, please open up a [new issue](https://github.com/oceanprotocol/ocean.js/issues/new?assignees=&labels=bug&template=bug_report.md&title=).

- [📚 Prerequisites](#-prerequisites)
- [🏄 Quickstart](#-quickstart)
  - [Features](#features)
  - [Publisher Flow](#publisher-flow)
  - [Roles Diagram](#roles-diagram)
  - [Functions you will need](#functions-you-will-need)
  <!-- - [v3 Integration and support](#v3-integration-and-support) -->
  
- [🦑 Development](#-development)
- [👩‍🔬 Testing](#-testing)
  - [Unit Tests](#unit-tests)
  - [Integration Tests](#integration-tests)
- [🏛 License](#-license)

## 📚 Prerequisites

- node.js ([Install from here](https://nodejs.org/en/download/))
<!-- - A Unix based operating system (Mac or Linux) -->

<!-- ### Note

Any function that uses `getPastEvents()` will only work on Eth (see: <https://github.com/oceanprotocol/ocean.js/issues/741>). This includes:

- searchPoolforDT()
- getPoolsbyCreator()
- getPoolSharesByAddress()
- getAllPoolLogs()
- getPreviousValidOrders()
- searchforDT()
- getExchangesbyCreator()
- getExchangeSwaps()
- getAllExchangesSwaps() -->

<!-- ## 🏗 Installation

```bash
npm install @oceanprotocol/lib
``` -->

## 🏄 Quickstart



### Features

- NFT-ize base IP: a new way of representing baseIP, all newly ERC20 DTs are linked to the NFT contract

- Roles Administration: there are now multiple roles for a more flexible administation both at NFT and ERC20 levels.

- Safer Staking - Better IDOs: An automated DT staking and vesting contract which helps with initial DT distribution and price stability.

  It also provides a customizable vesting schedule for the publisher.

- Help Ocean community: if Ocean is not the basetoken, Ocean Community will receive 0.1% swap fee on pools or fixed price exchange 

- Flexible key-value store in the NFT contract : NFT contract can be used to store custom key-value pairs

- Metadata is also stored in the NFT contract store (even if it still supports Metadata.sol)

- Marketplace fees flexibility: now any marketplace runner can set more customized fees structure.

- Multiple NFT template support: the Factory can deploy different types of NFT templates. 

- Multiple ERC20 template support: the Factory can deploy different types of ERC20 templates





<!-- This introduction is aimed at developers who are completely new to blockchain, no coding experience is required.

[Go to beginners guide](docs/beginners_guide.md) -->

### Publisher Flow

Interaction flow from Publisher point of view.

[Go to publisher flow](docs/quickstart_pubFlow.md)

### Roles Diagram

This is a diagram which shows how roles are handled in the v4.

[Go to roles diagram](docs/quickstart_roles.md)

<!-- ### Marketplace Flow

This batteries-included flow includes metadata, multiple services for one datatoken, and compute-to-data.

[Go to marketplace flow](docs/quickstart_marketplace.md) -->

### Functions you will need

Selection of most common functions.

[Go to functions](docs/quickstart_functions.md)

<!-- ### v3 Integration and support

How to integrate v3 Datatokens into the new contracts.

[Go to v3 integration](docs/quickstart_v3.md) -->

<!-- ### 📖 Learn more

- [Get test OCEAN](docs/get-test-OCEAN.md) - from rinkeby
- [Understand config parameters](docs/parameters.md) - envvars vs files
- [Learn about off-chain services](docs/services.md) - Ocean Provider for data services, Aquarius metadata store
- [Learn about wallets](docs/wallets.md) - on generating, storing, and accessing private keys
- [Get an overview of ocean.js](docs/overview.md) - key modules and functions

If you have any difficulties with the quickstarts, or if you have further questions about how to use ocean.js please reach out to us on [Discord](https://discord.gg/TnXjkR5).

If you notice any bugs or issues with ocean.js please [open an issue on github](https://github.com/oceanprotocol/ocean.js/issues/new?assignees=&labels=bug&template=bug_report.md&title=). -->

## 🦑 Development


```bash
npm install
npx hardhat node
```

<!-- ## ✨ Code Style

For linting and auto-formatting you can use from the root of the project:

```bash
# lint all js with eslint
npm run lint

# auto format all js & css with prettier, taking all configs into account
npm run format
``` -->

## 👩‍🔬 Testing


You can execute all tests with:

```bash
# run hardhat node each time you want to test with the current settings
npx hardhat node

npm run test:full
# same thing, but with coverage reporting
npm run test:full:cover
```

<!-- Test suite for unit & integration tests is setup with [Mocha](https://mochajs.org) as test runner, and [nyc](https://github.com/istanbuljs/nyc) for coverage reporting. A combined coverage report is sent to CodeClimate via the `coverage` GitHub Actions job.

Running all tests requires running Ocean Protocol components beforehand with [Barge](https://github.com/oceanprotocol/barge), which also runs a `ganache-cli` instance:

```bash
git clone https://github.com/oceanprotocol/barge
cd barge

./start_ocean.sh --with-provider2 --no-dashboard
```

You can then proceed to run in another terminal.

Let ocean.js know where to pickup the smart contract addresses, which has been written out by Barge in this location:

```
export ADDRESS_FILE="${HOME}/.ocean/ocean-contracts/artifacts/address.json"
```

Build metadata:

```
npm run build:metadata
```

Executing linting, type checking, unit, and integration tests with coverage reporting all in one go:

```bash
npm test
``` -->

### Unit Tests

You can execute unit tests with:

```bash
# run hardhat node each time you want to test with the current settings
npx hardhat node

npm run test:unit

```

### Flow Tests

You can execute flow tests with:

```bash
# run hardhat node each time you want to test with the current settings
npx hardhat node

npm run test:flow

```

<!-- ## 🛳 Production

To create a production build, run from the root of the project:

```bash
npm run build
``` -->

<!-- ## ⬆️ Releases

Releases are managed semi-automatically. They are always manually triggered from a developer's machine with release scripts.

### Production

From a clean `main` branch you can run the release task bumping the version accordingly based on semantic versioning:

```bash
npm run release
```

The task does the following:

- bumps the project version in `package.json`, `package-lock.json`
- auto-generates and updates the CHANGELOG.md file from commit messages
- creates a Git tag
- commits and pushes everything
- creates a GitHub release with commit messages as description
- Git tag push will trigger a GitHub Action workflow to do a npm release

For the GitHub releases steps a GitHub personal access token, exported as `GITHUB_TOKEN` is required. [Setup](https://github.com/release-it/release-it#github-releases) -->

## 🏛 License

```
Copyright ((C)) 2021 Ocean Protocol Foundation

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
