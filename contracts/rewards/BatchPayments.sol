// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0


pragma solidity 0.8.12;


interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}


contract BatchPayments {
    function sendEther(address[] memory list, uint256[] memory amounts) external payable {
        require(list.length == amounts.length,"Arrays must have same length");
        for (uint256 i = 0; i < list.length; i++)
            payable(list[i]).transfer(amounts[i]);
        uint256 balance = address(this).balance;
        // make sure that we return any excess to the caller
        // Later TODO:  Check for gas
        if (balance > 0)
            payable(msg.sender).transfer(balance);
    }

    function sendToken(IERC20 token, address[] memory list, uint256[] memory amounts) external {
        require(list.length == amounts.length,"Arrays must have same length");
        uint256 total = 0;
        uint256 i;
        for (i = 0; i < list.length; i++)
            total += amounts[i];
        require(token.transferFrom(msg.sender, address(this), total));
        for (i = 0; i < list.length; i++)
            require(token.transfer(list[i], amounts[i]));
    }
}