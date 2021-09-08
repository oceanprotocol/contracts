module.exports = {
    mocha: {
      grep: "@skip-on-coverage", // Find everything with this tag
      invert: true               // Run the grep's inverse set.
    },
   // skipFiles: ['v3/Dispenser.sol','v3/V3DataTokenTemplate.sol','v3/V3DTFactory.sol','v3/V3MetaData.sol']
    
  }