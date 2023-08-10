#!/bin/bash

# default to false in case it is not set
DEPLOY_CONTRACTS="${DEPLOY_CONTRACTS:-false}"

echo "deploy contracts is ${DEPLOY_CONTRACTS}"

if [ "${DEPLOY_CONTRACTS}" = "true" ]
then
    #we have to sleep until ganache is ready
    sleep ${SLEEP_FOR_GANACHE}
    cp hardhat.config.barge.js hardhat.config.js
    export NETWORK="${NETWORK_NAME:-barge}"
    npx hardhat clean
    npx hardhat compile --force
    #copy address.json
    if [ -e /ocean-contracts/addresses/address.json ]
        then cp -u /ocean-contracts/addresses/address.json /ocean-contracts/artifacts/
    fi
    node scripts/deploy-contracts.js
    
    # set flag to indicate contracts are ready
    touch /ocean-contracts/artifacts/ready
fi

# Fix file permissions
EXECUTION_UID=$(id -u)
EXECUTION_GID=$(id -g)
USER_ID=${LOCAL_USER_ID:-$EXECUTION_UID}
GROUP_ID=${LOCAL_GROUP_ID:-$EXECUTION_GID}
chown -R $USER_ID:$GROUP_ID /ocean-contracts/artifacts

tail -f /dev/null
