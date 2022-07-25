pragma solidity ^0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

contract veAllocate {
    mapping(address => mapping(string => uint256)) veAllocation;
    mapping(address => uint256) allocationCounter;
    mapping(address => mapping(uint256 => string)) allocationToId;
    mapping(address => mapping(string => uint256)) idToAllocation;
    mapping(address => uint256) _totalAllocation;

    event AllocationSet(
        address indexed sender,
        string indexed id,
        uint256 amount
    );
    event AllocationRemoved(address indexed sender, string indexed id);

    function getveAllocation(address _address, string calldata _id)
        public
        view
        returns (uint256)
    {
        // string is {DataNFT Address}-{chain id}
        // returns the allocation perc for given address
        return veAllocation[_address][_id];
    }

    function getTotalAllocation(address _address)
        public
        view
        returns (uint256)
    {
        // string is {DataNFT Address}-{chain id}
        // returns the allocation perc for given address
        return _totalAllocation[_address];
    }

    function setAllocation(uint256 amount, string calldata _id) external {
        require(bytes(_id).length < 50, "Id too long");
        require(amount <= 1000, "BM");

        if (veAllocation[msg.sender][_id] == 0) {
            require(amount > 0, "SM");
            allocationToId[msg.sender][allocationCounter[msg.sender]] = _id;
            idToAllocation[msg.sender][_id] = allocationCounter[msg.sender];
            allocationCounter[msg.sender]++;
        }

        _totalAllocation[msg.sender] =
            _totalAllocation[msg.sender] +
            amount -
            veAllocation[msg.sender][_id];

        if (amount == 0) {
            _removeAllocation(_id);
        } else {
            veAllocation[msg.sender][_id] = amount;
        }
        emit AllocationSet(msg.sender, _id, amount);
    }

    function _removeAllocation(string calldata _id) internal {
        require(veAllocation[msg.sender][_id] > 0, "SM");

        veAllocation[msg.sender][_id] = 0;

        uint256 no = idToAllocation[msg.sender][_id];

        allocationToId[msg.sender][no] = allocationToId[msg.sender][
            allocationCounter[msg.sender] - 1
        ]; // swap last with this one
        idToAllocation[msg.sender][allocationToId[msg.sender][no]] = no; // swap last with this one

        delete allocationToId[msg.sender][allocationCounter[msg.sender] - 1];
        delete idToAllocation[msg.sender][_id];

        allocationCounter[msg.sender]--;

        emit AllocationRemoved(msg.sender, _id);
    }

    function getTotalAllocation(
        address _address,
        uint256 limit,
        uint256 skip
    )
        external
        view
        returns (
            string[] memory allocationIds,
            uint256[] memory allocationAmounts
        )
    {
        // array of strings
        allocationIds = new string[](allocationCounter[_address]);

        allocationAmounts = new uint256[](allocationCounter[_address]);

        uint256 _limit = 0;
        if (allocationCounter[_address] > limit + skip) {
            _limit = limit;
        } else {
            _limit = allocationCounter[_address] - skip;
        }

        for (uint256 i = skip; i < skip + _limit; i++) {
            allocationIds[i] = allocationToId[_address][i];
            allocationAmounts[i] = veAllocation[_address][
                allocationToId[_address][i]
            ];
        }
    }
}
