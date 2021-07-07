pragma solidity >=0.6.0;

contract ERC20Roles {
    
   
    mapping(address => RolesERC20) public permissions;

    address[] public authERC20;

    struct RolesERC20 {
        bool minter;
        bool feeManager; //is it needed right now?
        // TODO
        // role for fee manager or collector
    }

    

    function _addMinter(address _minter) internal {
        RolesERC20 storage user = permissions[_minter];
        require(user.minter == false, "ERC20Roles:  ALREADY A MINTER");
        user.minter = true;
        authERC20.push(_minter);
    }

    function _removeMinter(address _minter) internal {
        RolesERC20 storage user = permissions[_minter];
        user.minter = false;
       
    }

    function _addFeeManager(address _feeManager) internal {
        RolesERC20 storage user = permissions[_feeManager];
        require(user.feeManager == false, "ERC20Roles:  ALREADY A FEE MANAGER");
        user.feeManager = true;
        authERC20.push(_feeManager);
    }

    function _removeFeeManager(address _feeManager) internal {
        RolesERC20 storage user = permissions[_feeManager];
        user.feeManager = false;
       
    }


    

   


    
    function _cleanPermissions() internal {
        
        for (uint256 i = 0; i < authERC20.length; i++) {
            RolesERC20 storage user = permissions[authERC20[i]];
            user.minter = false;
            user.feeManager = false;

        }
        
        delete authERC20;
        
    }
}
