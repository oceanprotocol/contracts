
FROM ubuntu:20.04 as base
RUN apt-get update && apt-get -y install bash curl
RUN curl -sL https://deb.nodesource.com/setup_18.x -o /tmp/nodesource_setup.sh
RUN bash /tmp/nodesource_setup.sh
RUN apt install nodejs



FROM base as builder
RUN apt-get update && apt-get -y install wget
COPY . /ocean-contracts
WORKDIR /ocean-contracts
ENV NODE_ENV=production
RUN npm install
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
RUN npx hardhat compile --force
ENTRYPOINT ["/ocean-contracts/scripts/deploy_docker.sh"]
