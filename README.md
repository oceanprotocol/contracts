[![banner](https://raw.githubusercontent.com/oceanprotocol/art/master/github/repo-banner%402x.png)](https://oceanprotocol.com)

<h1 align="center">Ocean Protocol Contracts</h1>

> 🐙 Smart contracts for Ocean Protocol v3

[![Build Status](https://travis-ci.com/oceanprotocol/ocean-contracts.svg?token=soMi2nNfCZq19zS1Rx4i&branch=master)](https://travis-ci.com/oceanprotocol/ocean-contracts)
 [![codecov](https://codecov.io/gh/oceanprotocol/contracts/branch/master/graph/badge.svg?token=31SZX1V4ZJ)](https://codecov.io/gh/oceanprotocol/contracts)

---

**This is in alpha state and you can expect running into problems. If you run into them, please open up a [new issue](/issues).**

---

A high level overview of OceanProtocol contracts:

![image](https://user-images.githubusercontent.com/5428661/92893688-31cbfa80-f41a-11ea-845c-2c94ecc978f1.png)



**Table of Contents**

- [Get Started](#get-started)
- [Usage](#usage)
  - [Local development](#local-development)
- [Testing](#testing)
- [Code Linting](#code-linting)
- [Networks](#networks)
  - [Testnets](#testnets)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Prior Art](#prior-art)
- [License](#license)

## Get Started

For quick installation of the contract `ABIs`:

```bash
npm i @oceanprotocol/contracts
```

### Usage
For more details about how to use ocean contracts, please refer to the quick start section in [ocean-lib-js](https://github.com/oceanprotocol/ocean-lib-js#-quick-start) and [ocean-lib-py](https://github.com/oceanprotocol/ocean-lib-py#quickstart).

### Local development

For local development of the `contracts` setup the development environment on your machine as follows:

As a pre-requisite, you need:

- Node.js v12+
- npm

Clone the project and install all dependencies:

```bash
git clone git@github.com:oceanprotocol/ocean-contracts.git
cd ocean-contracts/

# install packages
npm i

# to compile contracts
npm run compile
```

## Testing

Run tests with 

```bash
# for unit tests
npm run test:unit

# for test coverage
npm run test:cover
```

## Code Linting

Linting is setup for `JavaScript` with [ESLint](https://eslint.org) & Solidity with [Ethlint](https://github.com/duaraghav8/Ethlint).

```bash
# to check lint issues
npm run lint
```

Code style is enforced through the CI test process, builds will fail if there're any linting errors.

## Networks

### Testnets

For local development, start a local testnet using `ganache-cli`, then run:

```bash
npm run deploy
```
Checkout the supported deployment(s) on these [networks](docs/README.md#deployments).

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
Copyright 2020 Ocean Protocol Foundation

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
