[![banner](https://raw.githubusercontent.com/oceanprotocol/art/master/github/repo-banner%402x.png)](https://oceanprotocol.com)

<h1 align="center">Ocean Contracts</h1>

> 🐙 Smart contracts for Ocean Protocol v3. https://oceanprotocol.com

[![Build Status](https://travis-ci.com/oceanprotocol/contracts.svg?token=soMi2nNfCZq19zS1Rx4i&branch=master)](https://travis-ci.com/oceanprotocol/contracts)
 [![codecov](https://codecov.io/gh/oceanprotocol/contracts/branch/master/graph/badge.svg?token=31SZX1V4ZJ)](https://codecov.io/gh/oceanprotocol/contracts)

Overview:

![image](https://user-images.githubusercontent.com/5428661/92893688-31cbfa80-f41a-11ea-845c-2c94ecc978f1.png)



**Table of Contents**

- [🏗 Installation](#-installation)
- [⚙️ Usage](#-usage)
- [🏄 Quickstart](#-quickstart)
- [🛳 Network Deployments](#-network-deployments)
- [🦑 Local Development](#-local-development)
- [✨ Code Style](#-code-style)
- [👩‍🔬 Testing](#-testing)
- [⬆️ Releases](#️-releases)
- [🏛 License](#-license)

## 🏗 Installation

For quick installation of the contract `ABIs`:

### Javascript/Typescript
```bash
yarn add @oceanprotocol/contracts
```
### Python
```bash
pip3 install ocean-contracts
```
## ⚙️ Usage
By default, Python does not support importing `json` files directly, so it is recommended to use `json-sempai` package in order to automatically importing `ABIs/json` artifacts.
```
pip3 install json-sempai
# install the ocean-contracts package.
```
```python
from jsonsempai import magic
from artifacts import address
address.mainnet
{'DTFactory': '0x57317f97E9EA49eBd19f7c9bB7c180b8cDcbDeB9', 'BFactory': '0xbe0083053744ECb871510C88dC0f6b77Da162706', 'FixedRateExchange': '0x608d05214E42722B94a54cF6114d4840FCfF84e1', 'Metadata': '0x1a4b70d8c9DcA47cD6D0Fb3c52BB8634CA1C0Fdf', 'Ocean': '0x967da4048cD07aB37855c090aAF366e4ce1b9F48'}
```

## 🏄 Quickstart

The [ocean.js](https://github.com/oceanprotocol/ocean.js) and [ocean.py](https://github.com/oceanprotocol/ocean.py) libraries wrap `contracts` in JavaScript and Python respectively. They each have quickstart guides.


## 🛳 Network Deployments

You can use an existing deployment of Ocean contracts, deploy locally, or deploy to a remote network. Let's review each.

#### Use existing deployments

Ocean contracts are deployed to Rinkeby, Ethereum mainnet, and more. [Here are details](docs/README.md#deployments).

#### Deploy Locally (Ganache)

* In a separate terminal, start the testnet: `ganache-cli`
* In your main terminal, run: `yarn deploy`
* Confirm: are `"development"` entries updated in addresses file `./artifacts/address.json`?

#### Deploy to Remote (e.g. Rinkeby)

* In your main terminal:
```bash
export MNEMONIC='YOUR MNEMONIC SHOULD BE HERE'

# If you are using remote test or Etherejm mainnet using Infura
export INFURA_TOKEN='GET INFURA_TOKEN FROM INFURA PLATFORM'

yarn deploy:rinkeby
```

* Confirm: are `"rinkeby"` entries updated in addresses file `./artifacts/address.json`?


## 🦑 Local Development

For local development of `contracts`, set up the development environment on your machine as follows.

As a prerequisite, you need:

- Node.js v12+
- yarn

Clone the project and install all dependencies:

```bash
git clone git@github.com:oceanprotocol/contracts.git
cd contracts/

# install packages
yarn

# to compile contracts
yarn compile
```

## ✨ Code Style

Linting is setup for `JavaScript` with [ESLint](https://eslint.org) & Solidity with [Ethlint](https://github.com/duaraghav8/Ethlint).

```bash
# to check lint issues
yarn lint
```

## 👩‍🔬 Testing

In a separate console:
```console
ganache-cli
```

In main console:
```bash
# for unit tests
yarn test:unit

# for test coverage
yarn test:cover
```

Code style is enforced through the CI test process. Builds will fail if there are linting errors.

## ⬆️ Releases

[Submit contributions with this workflow](https://docs.oceanprotocol.com/concepts/contributing/#fix-or-improve-core-software).

[Finally, do a release using this process](docs/RELEASE_PROCESS.md).


## 🏛 License

```
Copyright 2021 Ocean Protocol Foundation

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
