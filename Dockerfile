FROM ubuntu:20.04
LABEL maintainer="Ocean Protocol <devops@oceanprotocol.com>"
#RUN apt-get update && apt-get -y install build-essential python3 git bash curl gcc g++ make
RUN apt-get update && apt-get -y install curl git bash
RUN curl -sL https://deb.nodesource.com/setup_18.x -o /tmp/nodesource_setup.sh
RUN bash /tmp/nodesource_setup.sh
RUN apt install nodejs
COPY . /ocean-contracts
WORKDIR /ocean-contracts
RUN rm package-lock.json
RUN rm -rf ./node-modules/
RUN npm i
RUN mkdir -p /root/.cache/hardhat-nodejs/compilers/
RUN mkdir -p /root/.cache/hardhat-nodejs/compilers-v2/
RUN cp -r /ocean-contracts/cache_binaries/compilers/* /root/.cache/hardhat-nodejs/compilers/
RUN cp -r /ocean-contracts/cache_binaries/compilers/* /root/.cache/hardhat-nodejs/compilers-v2/ 
RUN rm -rf /ocean-contracts/cache_binaries/
RUN npx hardhat compile --force --verbose
ENV SLEEP_FOR_GANACHE=10
RUN cp hardhat.config.barge.js hardhat.config.js
ENV NETWORK=barge
ENV NETWORK_RPC_URL=127.0.0.1:8545

ENTRYPOINT ["/ocean-contracts/scripts/deploy_docker.sh"]
