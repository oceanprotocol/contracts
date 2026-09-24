pragma solidity 0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

/**
 * @title MockShortReturnProvider
 * @dev A contract that HAS code (so it passes the escrow's `provider.code.length==0` guard) but whose
 *      `onSubsidyClaim` call returns only 32 bytes — fewer than the 64 needed to decode two uints.
 *      Used to verify the escrow's low-level quote treats short/non-conforming returndata as
 *      "contribute 0" instead of bricking the claim (a high-level try/catch would NOT catch the
 *      decode failure). Any call hits the fallback.
 */
contract MockShortReturnProvider {
    // slither-disable-next-line assembly
    fallback() external payable {
        assembly {
            mstore(0, 1)
            return(0, 32)
        }
    }
}
