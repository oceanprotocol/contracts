pragma solidity >=0.5.7;

interface IFactory {
    function initialize(
        string calldata _name,
        string calldata _symbol,
        address _minter,
        uint256 _cap,
        string calldata blob,
        address collector
    ) external returns (bool);



    function isInitialized() external view returns (bool);


    function createToken(
        string calldata name,
        string calldata symbol,
        uint256 cap,
        //  address erc721address,
        uint256 _templateIndex,
        address minter,
        address feeManager
    ) external returns (address token);

    function addToERC721Registry(address ERC721address) external;

    function erc721List(address ERC721address) external returns (address);

    function erc20List(address erc20dt) external view returns(bool);


}
