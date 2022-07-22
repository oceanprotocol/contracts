FROM ubuntu:20.04
LABEL maintainer="Ocean Protocol <devops@oceanprotocol.com>"
RUN apt-get update && \
      apt-get -y install build-essential python3 git bash curl
RUN curl -sL https://deb.nodesource.com/setup_16.x -o /tmp/nodesource_setup.sh
RUN bash /tmp/nodesource_setup.sh
RUN apt install nodejs
COPY . /ocean-contracts
WORKDIR /ocean-contracts

RUN npm install --no-optional && npm cache clean --force
ENV SLEEP_FOR_GANACHE=10
RUN cp hardhat.config.barge.js hardhat.config.js
#RUN mkdir -p /root/.cache/hardhat-nodejs/compilers/
#RUN cp -r ./compilers/* /root/.cache/hardhat-nodejs/compilers/
#RUN chmod +x /root/.cache/hardhat-nodejs/compilers/vyper/linux/0.3.1
ENV NETWORK=barge
ENV NETWORK_RPC_URL=127.0.0.1:8545
RUN npx hardhat compile
ENTRYPOINT ["/ocean-contracts/scripts/deploy_docker.sh"]
