pragma solidity >=0.6.0;

contract ERC721RolesAddress {
    

    mapping(address => Roles) internal permissions;

    address[] public auth;

    struct Roles {
        bool manager;
        bool deployERC20;
        bool updateMetadata;
        bool store;
    }

    modifier onlyManager() {
        Roles memory user = permissions[msg.sender];
        require(user.manager == true, "ERC721RolesAddress: NOT MANAGER");
        _;
    }

    function getPermissions(address user) external view returns (Roles memory) {
        return permissions[user];
    }

    function addTo725StoreList(address _allowedAddress) public onlyManager {
        Roles storage user = permissions[_allowedAddress];
        user.store = true;
        auth.push(_allowedAddress);
    }

    function removeFrom725StoreList(address _allowedAddress) public onlyManager {
        Roles storage user = permissions[_allowedAddress];
        user.store = false;
        
    }


    function addToCreateERC20List(address _allowedAddress) public onlyManager {
        Roles storage user = permissions[_allowedAddress];
        user.deployERC20 = true;
        auth.push(_allowedAddress);
        
    }

    function removeFromCreateERC20List(address _allowedAddress) public onlyManager {
        Roles storage user = permissions[_allowedAddress];
        user.deployERC20 = false;
        // TODO: remove it from createERC20List too.
   
    }
    function addToMetadataList(address _allowedAddress) public onlyManager {
        Roles storage user = permissions[_allowedAddress];
        user.updateMetadata = true;
        auth.push(_allowedAddress);
        
    }

    function removeFromMetadataList(address _allowedAddress) public onlyManager {
        Roles storage user = permissions[_allowedAddress];
        user.updateMetadata = false;
    
         // TODO: remove it from createERC20List too.
    }


    function _addManager(address _managerAddress) internal {
        Roles storage user = permissions[_managerAddress];
        user.manager = true;
        auth.push(_managerAddress);
    }

    function _removeManager(address _managerAddress) internal {
        Roles storage user = permissions[_managerAddress];
        user.manager = false;
        // TODO: Remove it from the managerList too
        
    }

    
    function _cleanPermissions() internal {
        
        for (uint256 i = 0; i < auth.length; i++) {
            Roles storage user = permissions[auth[i]];
            user.manager = false;
            user.deployERC20 = false;
            user.updateMetadata = false;
            user.store = false;

        }
        
        delete auth;
        
    }
}
