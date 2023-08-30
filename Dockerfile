FROM ubuntu:20.04
LABEL maintainer="Ocean Protocol <devops@oceanprotocol.com>"
#RUN apt-get update && apt-get -y install build-essential python3 git bash curl gcc g++ make
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
COPY . /ocean-contracts
WORKDIR /ocean-contracts
RUN npm ci
RUN npx hardhat compile --force
ENV SLEEP_FOR_GANACHE=10
RUN cp hardhat.config.barge.js hardhat.config.js
ENV NETWORK=barge
ENV NETWORK_RPC_URL=127.0.0.1:8545
ENTRYPOINT ["/ocean-contracts/scripts/deploy_docker.sh"]
