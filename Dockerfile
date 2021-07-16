FROM node:14-alpine
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
      python

COPY . /ocean-contracts
WORKDIR /ocean-contracts

RUN npm install --no-optional && npm cache clean --force

ENTRYPOINT ["/ocean-contracts/scripts/deploy_docker.sh"]