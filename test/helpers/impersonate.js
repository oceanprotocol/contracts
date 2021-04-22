const { network } = require('hardhat');

const impersonate = async address => {
  return network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address]
  });
};

const stopImpersonate = async address => {
  return network.provider.request({
    method: 'hardhat_stopImpersonatingAccount',
    params: [address]
  });
};

module.exports = {
  impersonate,
  stopImpersonate,
};
