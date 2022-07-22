FROM node:16-alpine
LABEL maintainer="Ocean Protocol <devops@oceanprotocol.com>"

RUN apk add --no-cache --update\
      bash\
      g++\
      gcc\
      git\
      krb5-dev\
      krb5-libs\
      krb5\
      make\
      python3

COPY . /ocean-contracts
WORKDIR /ocean-contracts

RUN npm install --no-optional && npm cache clean --force
ENV SLEEP_FOR_GANACHE=10
RUN cp hardhat.config.barge.js hardhat.config.js
RUN mkdir -p /root/.cache/hardhat-nodejs/compilers/
RUN ls -lh /root/.cache/hardhat-nodejs/compilers/
RUN cp -r ./compilers/* /root/.cache/hardhat-nodejs/compilers/
RUN ls -lhR /root/.cache/hardhat-nodejs/compilers/
ENV NETWORK=barge
ENV NETWORK_RPC_URL=127.0.0.1:8545
RUN npx hardhat compile --show-stack-traces --verbose 
ENTRYPOINT ["/ocean-contracts/scripts/deploy_docker.sh"]
