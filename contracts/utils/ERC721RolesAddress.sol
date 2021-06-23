pragma solidity >=0.6.0;

contract ERC721RolesAddress {
    

    mapping(address => Roles) internal permissions;

    address[] public auth;

    struct Roles {
        bool manager;
        bool deployERC20;
        bool updateMetadata;
        bool store;
        bool v3Minter;
    }

    
    function _checkManager(address manager) view internal{
        Roles memory user = _getPermissions(manager);
        require(user.manager == true, "ERC721RolesAddress: NOT MANAGER");
    }

    function _getPermissions(address account) view public returns (Roles memory){
        return permissions[account];
    }
    // function getPermissions(address user) external view returns (Roles memory) {
    //     return permissions[user];
    // }

    function addTo725StoreList(address _allowedAddress) public {
        _checkManager(msg.sender);
        Roles storage user = permissions[_allowedAddress];
        user.store = true;
        auth.push(_allowedAddress);
    }

    function removeFrom725StoreList(address _allowedAddress) public  {
        _checkManager(msg.sender);
        Roles storage user = permissions[_allowedAddress];
        user.store = false;
        
    }


    function addToCreateERC20List(address _allowedAddress) public {
        _checkManager(msg.sender);
        Roles storage user = permissions[_allowedAddress];
        user.deployERC20 = true;
        auth.push(_allowedAddress);
        
    }

    function removeFromCreateERC20List(address _allowedAddress) public {
        _checkManager(msg.sender);
        Roles storage user = permissions[_allowedAddress];
        user.deployERC20 = false;
        
   
    }
    function addToMetadataList(address _allowedAddress) public {
        _checkManager(msg.sender);
        Roles storage user = permissions[_allowedAddress];
        user.updateMetadata = true;
        auth.push(_allowedAddress);
        
    }

    function removeFromMetadataList(address _allowedAddress) public {
        _checkManager(msg.sender);
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

    function _addV3Minter(address _minter) internal {
        Roles storage user = permissions[_minter];
        user.v3Minter = true;
        auth.push(_minter);
    }

    function _removeV3Minter(address _minter) internal {
        Roles storage user = permissions[_minter];
        user.v3Minter = false;
    }
    
    function _cleanPermissions() internal {
        
        for (uint256 i = 0; i < auth.length; i++) {
            Roles storage user = permissions[auth[i]];
            user.manager = false;
            user.deployERC20 = false;
            user.updateMetadata = false;
            user.store = false;
            user.v3Minter = false;

        }
        
        delete auth;
        
    }
}
