pragma solidity ^0.8.12;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

contract veAllocate {
    mapping(address => mapping(bytes32 => uint256)) private veAllocation;
    mapping(address => uint256) private _totalAllocation;

    event AllocationSet(
        address indexed sender,
        address indexed nft,
        uint256 chainId,
        uint256 amount,
        bytes32 id
    );

    function getveAllocation(address _address, bytes32 _id)
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

    function getId(address nft, uint256 chainId) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(nft, chainId));
    }

    function setAllocation(
        uint256 amount,
        address nft,
        uint256 chainId
    ) external {
        bytes32 _id = getId(nft, chainId);

        require(amount <= 1000, "BM");

        if (veAllocation[msg.sender][_id] == 0) {
            require(amount > 0, "SM");
        }

        _totalAllocation[msg.sender] =
            _totalAllocation[msg.sender] +
            amount -
            veAllocation[msg.sender][_id];

        veAllocation[msg.sender][_id] = amount;
        emit AllocationSet(msg.sender, nft, chainId, amount, _id);
    }
}