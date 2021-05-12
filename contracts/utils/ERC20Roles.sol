pragma solidity >=0.6.0;

contract ERC20Roles {
    
    address[] public managerList;

    mapping(address => bool) public isManager; // used for cleaning lists, if _cleanLists() is not necessary can be removed

    address[] public createERC20List; // used for cleaning lists, if _cleanLists() is not necessary can be removed

    mapping(address => bool) public isAllowedToCreateERC20;

    address[] public metadataList; // used for cleaning lists, if _cleanLists() is not necessary can be removed

    mapping(address => bool) public isAllowedToUpdateMetadata;

    modifier onlyManager() {
        require(isManager[msg.sender] == true, "ERC721Template: NOT MANAGER");
        _;
    }

    function addToCreateERC20List(address _allowedAddress) public onlyManager {
        require(isAllowedToCreateERC20[_allowedAddress] == false, 'ERC721Roles: ALREADY A MINTER'); // NOT STRICTLY NECESSARY
        createERC20List.push(_allowedAddress);
        isAllowedToCreateERC20[_allowedAddress] = true;
    }

    function removeFromCreateERC20List(address _allowedAddress) public onlyManager {
        require(isAllowedToCreateERC20[_allowedAddress] == true, 'ERC721Roles: MINTER DOES NOT EXIST'); // NOT STRICTLY NECESSARY
        // TODO: remove it from createERC20List too.
         isAllowedToCreateERC20[_allowedAddress] = false;
    }
    function addToMetadataList(address _allowedAddress) public onlyManager {
        require(isAllowedToUpdateMetadata[_allowedAddress] == false, 'ERC721Roles: ALREADY HAS METADATA ROLE'); // NOT STRICTLY NECESSARY
        metadataList.push(_allowedAddress);
        isAllowedToUpdateMetadata[_allowedAddress] = true;
    }

    function removeFromMetadataList(address _allowedAddress) public onlyManager {
        require(isAllowedToUpdateMetadata[_allowedAddress] == true, 'ERC721Roles: MINTER DOES NOT EXIST'); // NOT STRICTLY NECESSARY
        // TODO: remove it from metadataList too.
         isAllowedToCreateERC20[_allowedAddress] = false;
    }


    function _addManager(address _managerAddress) internal {
        managerList.push(_managerAddress);
        isManager[_managerAddress] = true;
    }

    function _removeManager(address _managerAddress) internal {
        // TODO: Remove it from the managerList too
        isManager[_managerAddress] = false;
    }

    
    function _cleanLists() internal {
        for (uint256 i = 0; i < managerList.length; i++) {
            isManager[managerList[i]] = false;
        }

        for (uint256 i = 0; i < metadataList.length; i++) {
            isAllowedToUpdateMetadata[metadataList[i]] = false;
        }

        for (uint256 i = 0; i < createERC20List.length; i++) {
            isAllowedToCreateERC20[createERC20List[i]] = false;
        }
        delete managerList;
        delete metadataList;
        delete createERC20List;
    }
}
