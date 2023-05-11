#!/bin/bash

# default to false in case it is not set
DEPLOY_CONTRACTS="${DEPLOY_CONTRACTS:-false}"

echo "deploy contracts is ${DEPLOY_CONTRACTS}"

if [ "${DEPLOY_CONTRACTS}" = "true" ]
then
    rm -f /ocean-contracts/artifacts/ready
    #we have to sleep until ganache is ready
    sleep ${SLEEP_FOR_GANACHE}
    export NETWORK="${NETWORK_NAME:-barge}"
    npx hardhat clean
    npx hardhat compile
    #remove unneeded debug artifacts
    find /ocean-contracts/artifacts/* -name "*.dbg.json" -type f -delete
    #copy address.json
    if [ -e /ocean-contracts/addresses/address.json ]
        then cp -u /ocean-contracts/addresses/address.json /ocean-contracts/artifacts/
    fi
    echo "Starting deployment process..."
    node /ocean-contracts/scripts/deploy-contracts.js

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
