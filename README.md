[![banner](https://raw.githubusercontent.com/oceanprotocol/art/master/github/repo-banner%402x.png)](https://oceanprotocol.com)

[![Build Status](https://travis-ci.com/oceanprotocol/ocean-contracts.svg?token=soMi2nNfCZq19zS1Rx4i&branch=master)](https://travis-ci.com/oceanprotocol/ocean-contracts)
 [![codecov](https://codecov.io/gh/oceanprotocol/contracts/branch/master/graph/badge.svg?token=31SZX1V4ZJ)](https://codecov.io/gh/oceanprotocol/contracts)

# Ocean Protocol Contracts

This is in alpha state and you can expect running into problems. If you run into them, please open up a [new issue](/issues).

A high level overview of OceanProtocol contracts:

![image](https://user-images.githubusercontent.com/5428661/89401154-2b5cab80-d715-11ea-8a6f-413d6a03a283.png)


## Table of Contents

  - [Get Started](#get-started)
      - [Installation](#installation)
      - [Usage](#usage)
      - [Local development](#local-development)
  - [Testing](#testing)
      - [Code Linting](#code-linting)
  - [Networks](#networks)
  - [Packages](#packages)
  - [Documentation](#documentation)
  - [Contributing](#contributing)
  - [Prior Art](#prior-art)
  - [License](#license)

# Get Started

### Installation

For quick installation of the contracts `ABIs`:

```bash
npm i @oceanprotocol/contracts
```
### Usage

To import a contract ABI:

```javascript
const dtFactoryABI = require('@oceanprotocol/contracts/artifacts/development/DTFactory.json')

const dtFactoryAddress = '0x123456789.....'

const dtFactory = new web3.eth.Contract(
                  dtFactoryABI, 
                  dtFactoryAddress,
                  {
                     from: accounts[0]
                  }
               )

// create new datatoken
const tx = await dtFactory.methods
               .createToken('https://123example.com', "my datatoken", "DT", web3.utils.toWei('1000000'))
               .send()
let tokenAddress = null
try {
   tokenAddress = tx.events.TokenCreated.returnValue[0]
} catch (e) {
   console.error(e)
}
```

### Local development

For local development of the `contracts` setup the development environment on your machine as follows:

As a pre-requisite, you need:

- Node.js
- npm

Note: For MacOS, make sure to have `node@10` installed.

Clone the project and install all dependencies:

```bash
git clone git@github.com:oceanprotocol/contracts.git
cd contracts/

# install packages
npm i

# to compile contracts
npm run compile
```

# Testing

Run tests with 

```bash
# for unit tests
npm run test:unit

# for test coverage
npm run test:cover
```

### Code Linting

Linting is setup for `JavaScript` with [ESLint](https://eslint.org) & Solidity with [Ethlint](https://github.com/duaraghav8/Ethlint).

```bash
# to check lint issues
npm run lint
```
Code style is enforced through the CI test process, builds will fail if there're any linting errors.

# Networks

### Testnets

For local development, start a local testnet using `ganache-cli`, then run:

```
npm run deploy
```
Checkout the supported deployment(s) on test [networks](docs/deployments.md).

## Documentation

To use generate documentation via `solidity-docgen` please run:
```bash
npm run doc:generate
```


* [Release Process](docs/RELEASE_PROCESS.md)
* [Core Documentation](docs/contracts)

## Contributing

See the page titled "[Ways to Contribute](https://docs.oceanprotocol.com/concepts/contributing/)" in the Ocean Protocol documentation.



## Prior Art

This project builds on top of the work done in open source projects:
- [OpenZeppelin/openzeppelin-contracts](https://github.com/OpenZeppelin/openzeppelin-contracts)

## License

```
Copyright 2018 Ocean Protocol Foundation

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
