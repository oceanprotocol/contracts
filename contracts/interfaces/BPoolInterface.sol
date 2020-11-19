pragma solidity >=0.5.0;
//interface that all ssXXXX compatible contracts should expose
interface BPoolInterface {
    function getDataTokenAddress() external view returns (address);
    function getBaseTokenAddress() external view returns (address);
    function getController() external view returns (address);

}
