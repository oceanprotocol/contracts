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

    event NewPool(
        address poolAddress,
        address ssContract,
        address basetokenAddress
    );

    event NewFixedRate(bytes32 exchangeId, address owner, address basetoken);

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

    modifier onlyERC20Deployer() {
        require(
            IERC721Template(_erc721Address)
                .getPermissions(msg.sender)
                .deployERC20 == true,
            "ERC20Template: NOT DEPLOYER ROLE"
        );
        _;
    }

    /**
     * @dev initialize
     *      Called prior contract initialization (e.g creating new DataToken instance)
     *      Calls private _initialize function. Only if contract is not initialized.
     * @param name_ refers to a new DataToken name
     * @param symbol_ refers to a nea DataToken symbol
     * @param erc721Address refers to the erc721 address 
     * @param cap_ the total ERC20 cap
     * @param communityFeeCollector it is the community fee collector address
       @param minter account who can mint datatokens (can have multiple minters)
       @param router_ router address
       @param feeManager initial feeManager for this DT
     */
    function initialize(
        string calldata name_,
        string calldata symbol_,
        address erc721Address,
        uint256 cap_,
        address communityFeeCollector,
        address minter,
        address router_,
        address feeManager
    ) external onlyNotInitialized returns (bool) {
        return
            _initialize(
                name_,
                symbol_,
                erc721Address,
                cap_,
                communityFeeCollector,
                minter,
                router_,
                feeManager
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
       @param minter account who can mint datatokens (can have multiple minters)
       @param router_ router address
       @param feeManager initial feeManager for this DT
     */
    function _initialize(
        string memory name_,
        string memory symbol_,
        address erc721Address,
        uint256 cap_,
        address communityFeeCollector,
        address minter,
        address router_,
        address feeManager
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
        _addFeeManager(feeManager);
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

    /**
     * @dev deployPool
     *      Function to deploy new Pool with 1SS. It also has a vesting schedule.
            This function can only be called ONCE and ONLY if no token have been minted yet.
     * @param controller ssContract address
     * @param basetokenAddress baseToken for pool (OCEAN or other)
     * @param ssParams params for the ssContract. 
     * @param basetokenSender user which will provide the baseToken amount for initial liquidity 
     * @param swapFees swapFees (swapFee, swapMarketFee), swapOceanFee will be set automatically later
       @param marketFeeCollector marketFeeCollector address
       @param publisherAddress user which will be assigned the vested amount.
     */

    function deployPool(
        address controller,
        address basetokenAddress,
        uint256[] memory ssParams,
        address basetokenSender,
        uint256[2] memory swapFees,
        address marketFeeCollector,
        address publisherAddress
    ) external onlyERC20Deployer {
        require(totalSupply() == 0, "ERC20Template: tokens already minted");
        _addMinter(controller);
        // TODO: chech this
        require(ssParams[3] > 2426000, 'ERC20Template: minimum blocks not reached');

        address[2] memory tokens = [address(this), basetokenAddress];
        address pool = IFactoryRouter(router).deployPool(
            controller,
            tokens,
            publisherAddress, // publisherAddress, refers to the erc721 contract
            ssParams,
            basetokenSender,
            swapFees,
            marketFeeCollector
        );

        emit NewPool(pool, controller, basetokenAddress);
    }

    /**
     * @dev createFixedRate
     *      Creates a new FixedRateExchange setup.
     * @param basetokenAddress baseToken for exchange (OCEAN or other)
     * @param basetokenDecimals baseToken decimals
     * @param fixedRate rate
     * @param owner exchangeOwner
       @param marketFee market Fee 
       @param marketFeeCollector market fee collector address

       @return exchangeId
     */

    function createFixedRate(
        address basetokenAddress,
        uint8 basetokenDecimals,
        uint256 fixedRate,
        address owner,
        uint256 marketFee,
        address marketFeeCollector
    ) external onlyERC20Deployer returns (bytes32 exchangeId) {
        exchangeId = IFactoryRouter(router).deployFixedRate(
            basetokenAddress,
            basetokenDecimals,
            fixedRate,
            owner,
            marketFee,
            marketFeeCollector
        );

        emit NewFixedRate(exchangeId, owner, basetokenAddress);
    }

    /**
     * @dev mint
     *      Only the minter address can call it.
     *      msg.value should be higher than zero and gt or eq minting fee
     * @param account refers to an address that token is going to be minted to.
     * @param value refers to amount of tokens that is going to be minted.
     */
    function mint(address account, uint256 value) external {
        require(
            permissions[msg.sender].minter == true,
            "ERC20Template: NOT MINTER"
        );
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
     * @param marketFeeCollector marketplace fee collector
       @param feeToken // address of the token marketplace wants to add fee on top
       @param feeAmount // fee amount on top (in feeToken)
     */
    function startOrder(
        address consumer,
        uint256 amount,
        uint256 serviceId,
        address marketFeeCollector,
        address feeToken, // address of the token marketplace wants to add fee on top
        uint256 feeAmount // amount to be transfered to marketFeeCollector
    ) external {
        // Requires approval for the specific feeToken
        if (feeAmount > 0) {
            IERC20(feeToken).transferFrom(
                msg.sender,
                marketFeeCollector,
                feeAmount
            );
        }

        uint256 marketFee = 0;

        uint256 communityFee = calculateFee(
            amount,
            BASE_COMMUNITY_FEE_PERCENTAGE
        );
        transfer(_communityFeeCollector, communityFee);
        if (marketFeeCollector != address(0)) {
            marketFee = calculateFee(amount, BASE_MARKET_FEE_PERCENTAGE);
            transfer(marketFeeCollector, marketFee);
        }
        uint256 totalFee = communityFee.add(marketFee);
        transfer(getFeeCollector(), amount.sub(totalFee));

        emit OrderStarted(
            consumer,
            msg.sender,
            amount,
            serviceId,
            block.timestamp,
            marketFeeCollector,
            marketFee
        );
    }

    /**
     * @dev startMultipleOrder
     *      called by payer or consumer prior ordering multiple service consumes on a marketplace.
     * @param consumers consumers address array (payer could be different address)
     * @param amounts array of token amounts that are going to be transfered.
     * @param serviceIds service indexes array in the metadata
     * @param mrktFeeCollectors marketplace fee collectors array
       @param feeTokens // feeTokens array
       @param feeAmounts // fee amounts on top (in feeToken) array
     */

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

    /**
     * @dev finishOrder
     *      called by provider prior completing service delivery only
     *      if there is a partial or full refund.
     * @param orderTxIds refers to the transaction Ids  of startOrder acts
     *                  as a payment reference.
     * @param consumers refers to addresses that has consumed that service.
     * @param amounts refers to amounts of tokens that is going to be transfered.
     * @param serviceIds service indexes in the metadata.
     */

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

    /**
     * @dev addMinter
     *      Only ERC20Deployer (at 721 level) can update.
     *      There can be multiple minters
     * @param _minter new minter address
     */

    function addMinter(address _minter) external onlyERC20Deployer {
        _addMinter(_minter);
    }

    /**
     * @dev removeMinter
     *      Only ERC20Deployer (at 721 level) can update.
     *      There can be multiple minters
     * @param _minter minter address to remove
     */

    function removeMinter(address _minter) external onlyERC20Deployer {
        _removeMinter(_minter);
    }

    /**
     * @dev addFeeManager (can set who's going to collect fee when consuming orders)
     *      Only ERC20Deployer (at 721 level) can update.
     *      There can be multiple feeManagers
     * @param _feeManager new minter address
     */

    function addFeeManager(address _feeManager) external onlyERC20Deployer {
        _addFeeManager(_feeManager);
    }

    /**
     * @dev removeFeeManager
     *      Only ERC20Deployer (at 721 level) can update.
     *      There can be multiple feeManagers
     * @param _feeManager feeManager address to remove
     */

    function removeFeeManager(address _feeManager) external onlyERC20Deployer {
        _removeFeeManager(_feeManager);
    }

    /**
     * @dev setData
     *      Only ERC20Deployer (at 721 level) can call it.
     *      This function allows to store data with a preset key (keccak256(ERC20Address)) into NFT 725 Store
     * @param _value data to be set with this key
     */

    function setData(bytes calldata _value) external onlyERC20Deployer {
        bytes32 key = keccak256(abi.encodePacked(address(this)));
        IERC721Template(_erc721Address).setDataERC20(key, _value);
    }

    /**
     * @dev cleanPermissions()
     *      Only NFT Owner (at 721 level) can call it.
     *      This function allows to remove all minters, feeManagers and reset the feeCollector
     *
     */

    function cleanPermissions() external onlyNFTOwner {
        _cleanPermissions();
        feeCollector = address(0);
    }

    /**
     * @dev cleanFrom721() 
     *      OnlyNFT(721) Contract can call it.
     *      This function allows to remove all minters, feeManagers and reset the feeCollector
            This function is used when transferring an NFT to a new owner, so that permissions at ERC20level (minter,feeManager,feeCollector) can be reset.
     *      
     */
    function cleanFrom721() external {
        require(
            msg.sender == _erc721Address,
            "ERC20Template: NOT 721 Contract"
        );
        _cleanPermissions();
        feeCollector = address(0);
    }

    /**
     * @dev setFeeCollector
     *      Only feeManager can call it
     *      This function allows to set a newFeeCollector (receives DT when consuming)
            If not set the feeCollector is the NFT Owner
     * @param _newFeeCollector new fee collector 
     */

    function setFeeCollector(address _newFeeCollector) external {
        require(
            permissions[msg.sender].feeManager == true,
            "ERC20Template: NOT FEE MANAGER"
        );
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

    /**
     * @dev permit
     *      used for signed approvals, see ERC20Template test for more details
     * @param owner user who signed the message
     * @param spender spender
     * @param value token amount
     * @param deadline deadline after which signed message is no more valid
     * @param v parameters from signed message
     * @param r parameters from signed message
     * @param s parameters from signed message
     */

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

    /**
     * @dev getAddressLength
     *      It returns the array lentgh
            @param array address array we want to get length
     * @return length
     */

    function getAddressLength(address[] memory array)
        private
        pure
        returns (uint256)
    {
        return array.length;
    }

    /**
     * @dev getUintLength
     *      It returns the array lentgh
            @param array uint array we want to get length
     * @return length
     */

    function getUintLength(uint256[] memory array)
        private
        pure
        returns (uint256)
    {
        return array.length;
    }

    /**
     * @dev getBytesLength
     *      It returns the array lentgh
            @param array bytes32 array we want to get length
     * @return length
     */

    function getBytesLength(bytes32[] memory array)
        private
        pure
        returns (uint256)
    {
        return array.length;
    }

    /**
     * @dev getFeeCollector
     *      It returns the current feeCollector
     * @return feeCollector address
     */

    function getFeeCollector() public view returns (address) {
        if (feeCollector == address(0)) {
            return IERC721Template(_erc721Address).ownerOf(1);
        } else {
            return feeCollector;
        }
    }
}
