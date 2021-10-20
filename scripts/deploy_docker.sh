#!/bin/bash

# default to false in case it is not set
DEPLOY_CONTRACTS="${DEPLOY_CONTRACTS:-false}"

echo "deploy contracts is ${DEPLOY_CONTRACTS}"

if [ "${DEPLOY_CONTRACTS}" = "true" ]
then
    # remove ready flag if we deploy contracts
    rm -f /ocean-contracts/artifacts/ready

    export NETWORK="${NETWORK_NAME:-development}"
    npx hardhat compile
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