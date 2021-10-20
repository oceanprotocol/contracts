pragma solidity >=0.5.7;

interface IDispenser {
    

    function getDT(bytes32 exchangeId, uint256 dataTokenAmount) external;
    
     function getExchange(bytes32 exchangeId)
        external
        view
        returns (
            address exchangeOwner,
            address dataToken,
            uint256 dtDecimals,
            bool active,
            uint256 dtSupply
        );
}
