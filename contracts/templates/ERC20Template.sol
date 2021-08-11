pragma solidity >=0.6.0;
// Copyright BigchainDB GmbH and Ocean Protocol contributors
// SPDX-License-Identifier: (Apache-2.0 AND CC-BY-4.0)
// Code is Apache-2.0 and docs are CC-BY-4.0

import "../interfaces/IERC20Template.sol";
import "../interfaces/IERC721Template.sol";
import "../interfaces/IFactoryRouter.sol";
import "../utils/ERC725/ERC725Ocean.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../utils/ERC20Roles.sol";
import "hardhat/console.sol";
/**
 * @title DataTokenTemplate
 *
 * @dev DataTokenTemplate is an ERC20 compliant token template
 *      Used by the factory contract as a bytecode reference to
 *      deploy new DataTokens.
 */
contract ERC20Template is ERC20("test", "testSymbol"), ERC20Roles {
    using SafeMath for uint256;

    string private _name;
    string private _symbol;
    uint256 private _cap;
    uint8 private constant _decimals = 18;
    address private _communityFeeCollector;
    bool private initialized = false;
    address private _erc721Address;
    address private feeCollector;
    uint8 private constant templateId = 1;
    //  address private _minter;
    //  address private _proposedMinter;
    uint256 public constant BASE = 10**18;
    uint256 public constant BASE_COMMUNITY_FEE_PERCENTAGE = BASE / 1000;
    uint256 public constant BASE_MARKET_FEE_PERCENTAGE = BASE / 1000;

    // EIP 2612 SUPPORT
    bytes32 public DOMAIN_SEPARATOR;
    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 public constant PERMIT_TYPEHASH =
        0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;
    mapping(address => uint256) public nonces;

    address public router;
    //bool public stopMint;

    event OrderStarted(
        address indexed consumer,
        address indexed payer,
        uint256 amount,
        uint256 serviceId,
        uint256 timestamp,
        address indexed mrktFeeCollector,
        uint256 marketFee
    );

    event OrderFinished(
        bytes32 orderTxId,
        address indexed consumer,
        uint256 amount,
        uint256 serviceId,
        address indexed provider,
        uint256 timestamp
    );

    event MinterProposed(address currentMinter, address newMinter);

    event MinterApproved(address currentMinter, address newMinter);

    modifier onlyNotInitialized() {
        require(
            !initialized,
            "ERC20Template: token instance already initialized"
        );
        _;
    }
    modifier onlyNFTOwner() {
        require(
            msg.sender == IERC721Template(_erc721Address).ownerOf(1),
            "ERC20Template: not NFTOwner"
        );
        _;
    }

    // modifier onlyMinter() {
    //     require(msg.sender == _minter, "DataTokenTemplate: invalid minter");
    //     _;
    // }

    modifier onlyERC20Deployer() {
        IERC721Template.Roles memory user = IERC721Template(_erc721Address)
            ._getPermissions(msg.sender);
        require(user.deployERC20 == true, "ERC20Template: NOT DEPLOYER ROLE");
        _;
    }

  
    /**
     * @dev initialize
     *      Called prior contract initialization (e.g creating new DataToken instance)
     *      Calls private _initialize function. Only if contract is not initialized.
     * @param name_ refers to a new DataToken name
     * @param symbol_ refers to a nea DataToken symbol
     * @param erc721Address refers to the erc721 address (used for onlyNFTOwner modifier)
     * @param cap_ the total ERC20 cap
     * @param communityFeeCollector it is the community fee collector address
       @param minter account who can mint datatokens (can have multiple minters)
     */
    function initialize(
        string calldata name_,
        string calldata symbol_,
        address erc721Address,
        uint256 cap_,
        address communityFeeCollector,
        address minter,
        address router_
    ) external onlyNotInitialized returns (bool) {
        return
            _initialize(
                name_,
                symbol_,
                erc721Address,
                cap_,
                communityFeeCollector,
                minter,
                router_
            );
    }

    /**
     * @dev _initialize
     *      Private function called on contract initialization.
     * @param name_ refers to a new DataToken name
     * @param symbol_ refers to a nea DataToken symbol
     * @param erc721Address refers to an address that has minter rights
     * @param cap_ the total ERC20 cap
     * @param communityFeeCollector it is the community fee collector address
     */
    function _initialize(
        string memory name_,
        string memory symbol_,
        address erc721Address,
        uint256 cap_,
        address communityFeeCollector,
        address minter,
        address router_
    ) private returns (bool) {
        require(
            erc721Address != address(0),
            "ERC20Template: Invalid minter,  zero address"
        );

        require(
            communityFeeCollector != address(0),
            "ERC20Template: Invalid community fee collector, zero address"
        );

        require(cap_ != 0, "DataTokenTemplate: Invalid cap value");
        _cap = cap_;
        _name = name_;
        _symbol = symbol_;
        _erc721Address = erc721Address;
        router = router_;
        _communityFeeCollector = communityFeeCollector;
        initialized = true;
        // add a default minter, similar to what happens with manager in the 721 contract
        _addMinter(minter);
        // TODO: add option to add a fee manager when initializing?
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes(_name)),
                keccak256(bytes("1")), // version, could be any other value
                chainId,
                address(this)
            )
        );

       

        return initialized;
    }


    function deployPool(address controller, address basetokenAddress, uint burnInEndBlock, uint[] memory ssParams) external onlyERC20Deployer {
         // TODO: how we want to handle the minters? If someone calls this functions, all other minters should be removed
         // stopMint could be an option but eventually when we call the ssFixed it will mint the overall supply so that's probably not an issue
         //stopMint = true;
        require(totalSupply() == 0,'ERC20Template: tokens already minted');
        _addMinter(controller);
        console.log(router,'router address');
         IFactoryRouter(router).deployPool(
            controller,
            address(this),
            basetokenAddress,
            _erc721Address, // publisherAddress, refers to the erc721 contract
            burnInEndBlock,
            ssParams
        );
    }
    /**
     * @dev mint
     *      Only the minter address can call it.
     *      msg.value should be higher than zero and gt or eq minting fee
     * @param account refers to an address that token is going to be minted to.
     * @param value refers to amount of tokens that is going to be minted.
     */
    function mint(address account, uint256 value) external {
        //require(stopMint == false, 'ERC20Template: minting is stopped');
        RolesERC20 memory user = permissions[msg.sender];
        require(user.minter == true, "ERC20Template: NOT MINTER");
        require(
            totalSupply().add(value) <= _cap,
            "DataTokenTemplate: cap exceeded"
        );
        _mint(account, value);
    }

    /**
     * @dev startOrder
     *      called by payer or consumer prior ordering a service consume on a marketplace.
     * @param consumer is the consumer address (payer could be different address)
     * @param amount refers to amount of tokens that is going to be transfered.
     * @param serviceId service index in the metadata
     * @param mrktFeeCollector marketplace fee collector
     */
    function startOrder(
        address consumer,
        uint256 amount,
        uint256 serviceId,
        address mrktFeeCollector,
        address feeToken, // address of the token marketplace wants to add fee on top
        uint256 feeAmount // amount to be transfered by
    ) external {
        // TODO: TO WHO WE SEND THIS FEE? Marketplace address? now set to mrktFeeCollector
        // Requires approval for the specific feeToken
        if (feeAmount > 0) {
            IERC20(feeToken).transferFrom(
                msg.sender,
                mrktFeeCollector,
                feeAmount
            );
        }

        uint256 marketFee = 0;

        uint256 communityFee = calculateFee(
            amount,
            BASE_COMMUNITY_FEE_PERCENTAGE
        );
        transfer(_communityFeeCollector, communityFee);
        if (mrktFeeCollector != address(0)) {
            marketFee = calculateFee(amount, BASE_MARKET_FEE_PERCENTAGE);
            transfer(mrktFeeCollector, marketFee);
        }
        uint256 totalFee = communityFee.add(marketFee);
        transfer(getFeeCollector(), amount.sub(totalFee));

        emit OrderStarted(
            consumer,
            msg.sender,
            amount,
            serviceId,
            block.timestamp,
            mrktFeeCollector,
            marketFee
        );
    }

    function startMultipleOrder(
        address[] memory consumers,
        uint256[] memory amounts,
        uint256[] memory serviceIds,
        address[] memory mrktFeeCollectors,
        address[] memory feeTokens,
        uint256[] memory feeAmounts
    ) external {
        uint256 ids = serviceIds.length;

        require(getAddressLength(consumers) == ids, "WRONG ARRAYS FORMAT");
        require(getUintLength(amounts) == ids, "WRONG ARRAYS FORMAT");
        require(
            getAddressLength(mrktFeeCollectors) == ids,
            "WRONG ARRAYS FORMAT"
        );
        require(getUintLength(feeAmounts) == ids, "WRONG ARRAYS FORMAT");
        require(getAddressLength(feeTokens) == ids, "WRONG ARRAYS FORMAT");

        for (uint256 i = 0; i < ids; i++) {
            if (feeAmounts[i] > 0) {
                IERC20(feeTokens[i]).transferFrom(
                    msg.sender,
                    mrktFeeCollectors[i],
                    feeAmounts[i]
                );
            }

            uint256 marketFee = 0;
            uint256 communityFee = calculateFee(
                amounts[i],
                BASE_COMMUNITY_FEE_PERCENTAGE
            );
            transfer(_communityFeeCollector, communityFee);
            if (mrktFeeCollectors[i] != address(0)) {
                marketFee = calculateFee(
                    amounts[i],
                    BASE_MARKET_FEE_PERCENTAGE
                );
                transfer(mrktFeeCollectors[i], marketFee);
            }
            uint256 totalFee = communityFee.add(marketFee);
            transfer(getFeeCollector(), amounts[i].sub(totalFee));

            emit OrderStarted(
                consumers[i],
                msg.sender,
                amounts[i],
                serviceIds[i],
                block.timestamp,
                mrktFeeCollectors[i],
                marketFee
            );
        }
    }

    /**
     * @dev finishOrder
     *      called by provider prior completing service delivery only
     *      if there is a partial or full refund.
     * @param orderTxId refers to the transaction Id  of startOrder acts
     *                  as a payment reference.
     * @param consumer refers to an address that has consumed that service.
     * @param amount refers to amount of tokens that is going to be transfered.
     * @param serviceId service index in the metadata.
     */
    function finishOrder(
        bytes32 orderTxId,
        address consumer,
        uint256 amount,
        uint256 serviceId
    ) external {
        if (amount != 0)
            require(
                transfer(consumer, amount),
                "DataTokenTemplate: failed to finish order"
            );

        emit OrderFinished(
            orderTxId,
            consumer,
            amount,
            serviceId,
            msg.sender,
            block.timestamp
        );
    }

    function finishMultipleOrder(
        bytes32[] calldata orderTxIds,
        address[] calldata consumers,
        uint256[] calldata amounts,
        uint256[] calldata serviceIds
    ) external {
        uint256 ids = serviceIds.length;

        require(getAddressLength(consumers) == ids, "WRONG ARRAYS FORMAT");
        require(getUintLength(amounts) == ids, "WRONG ARRAYS FORMAT");
        require(getBytesLength(orderTxIds) == ids, "WRONG ARRAYS FORMAT");

        for (uint256 i = 0; i < ids; i++) {
            if (amounts[i] != 0)
                require(
                    transfer(consumers[i], amounts[i]),
                    "DataTokenTemplate: failed to finish order"
                );

            emit OrderFinished(
                orderTxIds[i],
                consumers[i],
                amounts[i],
                serviceIds[i],
                msg.sender,
                block.timestamp
            );
        }
    }

    // function addMinter(address _minter) external onlyERC20Deployer {
    //     _addMinter(_minter);
    // }

    // function removeMinter(address _minter) external onlyERC20Deployer {
    //     _removeMinter(_minter);
    // }

    function addFeeManager(address _feeManager) external onlyERC20Deployer {
        _addFeeManager(_feeManager);
    }

    function removeFeeManager(address _feeManager) external onlyERC20Deployer {
        _removeFeeManager(_feeManager);
    }

    function setData(bytes calldata _value) external onlyERC20Deployer {
        bytes32 key = keccak256(abi.encodePacked(address(this))); // could be any other key, used a simple configuration
        IERC721Template(_erc721Address).setDataERC20(key, _value);
    }

    function cleanPermissions() external onlyNFTOwner {
        _cleanPermissions();
        feeCollector = address(0);
    }

    function cleanFrom721() external {
        require(
            msg.sender == _erc721Address,
            "ERC20Template: NOT 721 Contract"
        );
        _cleanPermissions();
        feeCollector = address(0);
    }

    function setFeeCollector(address _newFeeCollector) external {
        RolesERC20 memory user = permissions[msg.sender];
        require(user.feeManager == true, "ERC20Template: NOT FEE MANAGER");
        feeCollector = _newFeeCollector;
    }

    function getId() external pure returns (uint8) {
        return templateId;
    }

    /**
     * @dev name
     *      It returns the token name.
     * @return DataToken name.
     */
    function name() public view override returns (string memory) {
        return _name;
    }

    /**
     * @dev symbol
     *      It returns the token symbol.
     * @return DataToken symbol.
     */
    function symbol() public view override returns (string memory) {
        return _symbol;
    }

    /**
     * @dev decimals
     *      It returns the token decimals.
     *      how many supported decimal points
     * @return DataToken decimals.
     */
    function decimals() public pure override returns (uint8) {
        return _decimals;
    }

    /**
     * @dev cap
     *      it returns the capital.
     * @return DataToken cap.
     */
    function cap() external view returns (uint256) {
        return _cap;
    }

    /**
     * @dev isInitialized
     *      It checks whether the contract is initialized.
     * @return true if the contract is initialized.
     */

    function isInitialized() external view returns (bool) {
        return initialized;
    }

    /**
     * @dev calculateFee
     *      giving a fee percentage, and amount it calculates the actual fee
     * @param amount the amount of token
     * @param feePercentage the fee percentage
     * @return the token fee.
     */

    function calculateFee(uint256 amount, uint256 feePercentage)
        private
        pure
        returns (uint256)
    {
        if (amount == 0) return 0;
        if (feePercentage == 0) return 0;
        return amount.mul(feePercentage).div(BASE);
    }

    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(deadline >= block.timestamp, "ERC20DT: EXPIRED");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        PERMIT_TYPEHASH,
                        owner,
                        spender,
                        value,
                        nonces[owner]++,
                        deadline
                    )
                )
            )
        );
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(
            recoveredAddress != address(0) && recoveredAddress == owner,
            "ERC20DT: INVALID_SIGNATURE"
        );
        _approve(owner, spender, value);
    }

    function getAddressLength(address[] memory array)
        private
        pure
        returns (uint256)
    {
        return array.length;
    }

    function getUintLength(uint256[] memory array)
        private
        pure
        returns (uint256)
    {
        return array.length;
    }

    function getBytesLength(bytes32[] memory array)
        private
        pure
        returns (uint256)
    {
        return array.length;
    }

    function getFeeCollector() public view returns (address) {
        if (feeCollector == address(0)) {
            return IERC721Template(_erc721Address).ownerOf(1);
        } else {
            return feeCollector;
        }
    }
}
