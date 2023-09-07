
FROM ubuntu:20.04 as base
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get -y install curl git bash ca-certificates gnupg
# nvm env vars
RUN mkdir -p /usr/local/nvm
ENV NVM_DIR /usr/local/nvm
# IMPORTANT: set the exact version
ENV NODE_VERSION v16.20.2
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
RUN /bin/bash -c "source $NVM_DIR/nvm.sh && nvm install $NODE_VERSION && nvm use --delete-prefix $NODE_VERSION"
# add node and npm to the PATH
ENV NODE_PATH $NVM_DIR/versions/node/$NODE_VERSION/bin
ENV PATH $NODE_PATH:$PATH



FROM base as builder
RUN apt-get update && apt-get -y install wget
COPY . /ocean-contracts
WORKDIR /ocean-contracts
ENV NODE_ENV=production
RUN npm ci
RUN wget https://gobinaries.com/tj/node-prune --output-document - | /bin/sh && node-prune




FROM base as runner
ENV NODE_ENV=production
RUN mkdir -p /ocean-contracts
RUN mkdir -p /ocean-contracts/test/
COPY ./addresses /ocean-contracts/addresses/
COPY ./contracts /ocean-contracts/contracts/
COPY ./hardhat.config* /ocean-contracts/
COPY ./package* /ocean-contracts/
COPY ./scripts /ocean-contracts/scripts/
COPY ./test /ocean-contracts/test/
WORKDIR /ocean-contracts
COPY --from=builder /ocean-contracts/node_modules/ /ocean-contracts/node_modules/
ENV SLEEP_FOR_GANACHE=10
RUN cp hardhat.config.barge.js hardhat.config.js
ENV NETWORK=barge
ENV NETWORK_RPC_URL=127.0.0.1:8545
RUN npx hardhat clean
RUN npx hardhat compile --force
#remove artifacts, will compile at startup
RUN rm -rf /ocean-contracts/artifacts/*
ENTRYPOINT ["/ocean-contracts/scripts/deploy_docker.sh"]