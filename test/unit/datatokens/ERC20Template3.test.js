/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent, BN } = require("@openzeppelin/test-helpers");
const { getEventFromTx } = require("../../helpers/utils")
const { impersonate } = require("../../helpers/impersonate");
const constants = require("../../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const ethers = hre.ethers;
const { ecsign, zeroAddress } = require("ethereumjs-util");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { BigNumber } = require("ethers");


const blocktimestamp = async () => {
    return (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
}

const fastForward = async (seconds) => {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
}

const sPerEpoch = 300;
const sPerSubscription = 24 * 60 * 60;
const trueValueSubmitTimeout = 24 * 60 * 60 * 3;

const provider = new ethers.providers.JsonRpcProvider();

async function signMessage(message, address) {
    let signedMessage = await web3.eth.sign(message, address)
    signedMessage = signedMessage.substr(2) // remove 0x
    const r = '0x' + signedMessage.slice(0, 64)
    const s = '0x' + signedMessage.slice(64, 128)
    const v = '0x' + signedMessage.slice(128, 130)
    const vDecimal = web3.utils.hexToNumber(v)
    return { v, r, s };
    /*const { v, r, s } = ecsign(
      Buffer.from(message.slice(2), "hex"),
      Buffer.from(privateKey, "hex")
    );
    return { v, r, s };
    */
}

async function authorize(address, validity = 86400) {
    const validUntil = Math.round(await blocktimestamp()) + validity
    const message = ethers.utils.solidityKeccak256(
        ["address", "uint256"],
        [
            address,
            validUntil
        ]
    );
    const signedMessage = await signMessage(message, address);
    return {
        userAddress: address,
        v: signedMessage.v,
        r: signedMessage.r,
        s: signedMessage.s,
        validUntil: validUntil
    }
}

describe("ERC20Template3", () => {
    let name,
        symbol,
        owner,
        reciever,
        metadata,
        tokenERC721,
        tokenAddress,
        data,
        flags,
        factoryERC721,
        factoryERC20,
        templateERC721,
        templateERC20,
        erc20Address,
        erc20Token,
        erc20AddressWithPublishFee,
        erc20TokenWithPublishFee,
        publishMarketFeeAddress,
        mockErc20,
        mockErc20Decimals,
        publishMarketFeeToken,
        freMarketFeeCollector

    cap = web3.utils.toWei("100000");
    const fakeUSDAmount = cap
    const addressZero = '0x0000000000000000000000000000000000000000';
    const freRate = web3.utils.toWei("2"); // 2 tokens per dt
    const freMarketFee = 1e15 // 0.1%


    const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";
    const publishMarketFeeAmount = "5"

    const noLimit = web3.utils.toWei('100000000000000000000');

    async function buyDTFromFixedRate(datatokenAddress, user, amount) {
        amount = String(amount)
        const datatokenContract = await ethers.getContractAt("ERC20Template3", datatokenAddress)
        const fixedRates = await datatokenContract.connect(owner).getFixedRates()
        if (fixedRates.length > 0) {
            fixedRateExchange = await ethers.getContractAt("FixedRateExchange", fixedRates[0].contractAddress);
            fixedRateId = fixedRates[0].id
            //get details
            const details = await fixedRateExchange.connect(owner).getExchange(fixedRateId)
            const needed = await fixedRateExchange.connect(owner).calcBaseInGivenOutDT(fixedRateId, web3.utils.toWei(amount), 0);
            erc20Contract = await ethers.getContractAt("MockERC20", details.baseToken)
            await erc20Contract.connect(owner).approve(fixedRateExchange.address, needed.baseTokenAmount)
            await fixedRateExchange.connect(owner).buyDT(fixedRateId, web3.utils.toWei(amount), needed.baseTokenAmount, ZERO_ADDRESS, 0)
            await datatokenContract.connect(owner).transfer(user, web3.utils.toWei(amount))
        }
    }

    beforeEach("init contracts for each test", async () => {
        const ERC721Template = await ethers.getContractFactory("ERC721Template");
        const ERC20Template3 = await ethers.getContractFactory("ERC20Template3");
        const ERC721Factory = await ethers.getContractFactory("ERC721Factory");

        const Router = await ethers.getContractFactory("FactoryRouter");
        const FixedRateExchange = await ethers.getContractFactory(
            "FixedRateExchange"
        );

        const MockErc20 = await ethers.getContractFactory('MockERC20');
        const MockErc20Decimals = await ethers.getContractFactory('MockERC20Decimals');

        [owner, reciever, user2, user3, user4, user5, user6, opcCollector, freMarketFeeCollector, marketFeeCollector, publishMarketAccount] = await ethers.getSigners();
        publishMarketFeeAddress = publishMarketAccount.address
        data = web3.utils.asciiToHex(constants.blob[0]);
        flags = web3.utils.asciiToHex(constants.blob[0]);

        // DEPLOY ROUTER, SETTING OWNER



        mockErc20 = await MockErc20.deploy(owner.address, "MockERC20", 'MockERC20');
        mockErc20Decimals = await MockErc20Decimals.deploy("Mock6Digits", 'Mock6Digits', 6);
        publishMarketFeeToken = mockErc20Decimals.address

        router = await Router.deploy(
            owner.address,
            '0x000000000000000000000000000000000000dead', // approved tokens list, unused in this test
            '0x000000000000000000000000000000000000dead', // pooltemplate field, unused in this test
            opcCollector.address,
            []
        );



        fixedRateExchange = await FixedRateExchange.deploy(
            router.address
        );

        templateERC20 = await ERC20Template3.deploy();


        // SETUP ERC721 Factory with template
        templateERC721 = await ERC721Template.deploy();
        factoryERC721 = await ERC721Factory.deploy(
            templateERC721.address,
            templateERC20.address,
            router.address
        );

        // SET REQUIRED ADDRESS


        await router.addFactory(factoryERC721.address);

        await router.addFixedRateContract(fixedRateExchange.address); // DEPLOY ROUTER, SETTING OWNER




        // by default connect() in ethers goes with the first address (owner in this case)
        const tx = await factoryERC721.deployERC721Contract(
            "NFT",
            "NFTSYMBOL",
            1,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "https://oceanprotocol.com/nft/",
            true,
            owner.address
        );
        const txReceipt = await tx.wait();
        let event = getEventFromTx(txReceipt, 'NFTCreated')
        assert(event, "Cannot find NFTCreated event")
        tokenAddress = event.args[0];
        tokenERC721 = await ethers.getContractAt("ERC721Template", tokenAddress);

        assert((await tokenERC721.balanceOf(owner.address)) == 1);

        await tokenERC721.addManager(user2.address);
        await tokenERC721.connect(user2).addTo725StoreList(user3.address);
        await tokenERC721.connect(user2).addToCreateERC20List(user3.address);
        await tokenERC721.connect(user2).addToMetadataList(user3.address);

        assert((await tokenERC721.getPermissions(user3.address)).store == true);
        assert(
            (await tokenERC721.getPermissions(user3.address)).deployERC20 == true
        );
        assert(
            (await tokenERC721.getPermissions(user3.address)).updateMetadata == true
        );


        // [user3.address, user6.address, user3.address, addressZero, mockErc20.address],
        const trxERC20 = await tokenERC721.connect(user3).createERC20(1,
            ["ERC20DT3", "ERC20DT3Symbol"],
            [user3.address, user6.address, user3.address, addressZero, mockErc20.address],
            [cap, 0, sPerEpoch, sPerSubscription, trueValueSubmitTimeout],
            []
        );

        const trxReceiptERC20 = await trxERC20.wait();
        event = getEventFromTx(trxReceiptERC20, 'TokenCreated')
        assert(event, "Cannot find TokenCreated event")
        erc20Address = event.args[0];

        erc20Token = await ethers.getContractAt("ERC20Template3", erc20Address);
        assert((await erc20Token.permissions(user3.address)).minter == false); //nobody external can mint

        //test that we cannot create a fixedrate with another baseToken != stakeToken
        await expectRevert(
            erc20Token.connect(owner).createFixedRate(
                fixedRateExchange.address,
                [mockErc20Decimals.address, owner.address, freMarketFeeCollector.address, addressZero],
                [18, 18, freRate, freMarketFee, 1]),
            "Cannot create FRE with baseToken!=stakeToken"
        );
        await erc20Token.connect(owner).createFixedRate(
            fixedRateExchange.address,
            [mockErc20.address, owner.address, freMarketFeeCollector.address, addressZero],
            [18, 18, freRate, freMarketFee, 1])

        // create an ERC20 with publish Fee ( 5 USDC, going to publishMarketAddress)
        const trxERC20WithPublishFee = await tokenERC721.connect(user3).createERC20(1,
            ["ERC20DT3P", "ERC20DT3SymbolP"],
            [user3.address, user6.address, publishMarketFeeAddress, publishMarketFeeToken, mockErc20.address],
            [cap, web3.utils.toWei(publishMarketFeeAmount), 24, 288, 24 * 60 * 60, 24 * 60 * 60 * 3],
            []

        );
        const trxReceiptERC20WithPublishFee = await trxERC20WithPublishFee.wait();
        event = getEventFromTx(trxReceiptERC20WithPublishFee, 'TokenCreated')
        assert(event, "Cannot find TokenCreated event")
        erc20AddressWithPublishFee = event.args[0];

        erc20TokenWithPublishFee = await ethers.getContractAt("ERC20Template3", erc20AddressWithPublishFee);
        assert((await erc20TokenWithPublishFee.permissions(user3.address)).minter == false);

        await erc20TokenWithPublishFee.connect(owner).createFixedRate(
            fixedRateExchange.address,
            [mockErc20.address, owner.address, freMarketFeeCollector.address, addressZero],
            [18, 18, freMarketFee, freMarketFee, 1])

        await fastForward(sPerEpoch * 2)
        const remainder = await blocktimestamp() % await erc20TokenWithPublishFee.secondsPerEpoch();
        await fastForward(sPerEpoch - remainder);
    });


    it("#isInitialized - should check that the erc20Token contract is initialized", async () => {
        expect(await erc20Token.isInitialized()).to.equal(true);
    });

    it("#initialize - should fail to re-initialize the contracts", async () => {
        await expectRevert(
            erc20Token.initialize(
                ["ERC20DT3", "ERC20DT3Symbol"],
                [owner.address, marketFeeCollector.address, owner.address, addressZero],
                [tokenERC721.address, communityFeeCollector, router.address, erc20Token.address],
                [web3.utils.toWei("10"), 0, 24, 300, 24 * 60 * 60],
                []
            ),
            "ERC20Template: token instance already initialized"
        );
    });

    it("#mint - should fail to mint 1 ERC20Token to user2 if NOT MINTER", async () => {
        await expectRevert(
            erc20Token.connect(user2).mint(user2.address, web3.utils.toWei("1")),
            "ERC20Template: NOT MINTER"
        );
    });
    it("#mint - should fail to create another fixed rate", async () => {
        await expectRevert(
            erc20Token.connect(owner).createFixedRate(
                fixedRateExchange.address,
                [mockErc20Decimals.address, owner.address, freMarketFeeCollector.address, addressZero],
                [18, 18, freRate, freMarketFee, 1]
            ),
            "Fixed rate already present"
        )
    });
    it("#setPaymentCollector - should not modify paymentCollector address", async () => {
        await erc20Token.connect(user3).setPaymentCollector(owner.address);
        assert((await erc20Token.getPaymentCollector()) == erc20Token.address, 'PaymentCollector is not erc20Token');
        await erc20Token.connect(user3).setPaymentCollector(user2.address);
        assert((await erc20Token.getPaymentCollector()) == erc20Token.address, 'PaymentCollector is not erc20Token');

    });

    it("#getERC721Address - should succeed to get the parent ERC721 address", async () => {
        const address = await erc20Token.connect(user3).getERC721Address();
        assert(address, "Not able to get the parent ERC721 address")
    });

    it("#cleanPermissions - should fail to call cleanPermissions if NOT NFTOwner", async () => {
        await expectRevert(
            erc20Token.connect(user2).cleanPermissions(),
            "ERC20Template: not NFTOwner"
        );
    });

    it("#cleanPermissions - should succeed to call cleanPermissions if NFTOwner", async () => {
        // NFT Owner cleans
        await erc20Token.cleanPermissions();

        // check permission were removed
        assert((await erc20Token.permissions(owner.address)).minter == false);
        assert((await erc20Token.permissions(owner.address)).paymentManager == false);
        assert((await erc20Token.permissions(user2.address)).minter == false);
        assert((await erc20Token.permissions(user3.address)).minter == false);
        assert((await erc20Token.permissions(user4.address)).minter == false);
        assert((await erc20Token.getPaymentCollector()) == erc20Token.address);
    });

    it("#startOrder - user should succeed to call startOrder on a ERC20 without publishFee", async () => {
        const fixedRates = await erc20Token.connect(owner).getFixedRates()
        fixedRateExchange = await ethers.getContractAt("FixedRateExchange", fixedRates[0].contractAddress);
        fixedRateId = fixedRates[0].id
        //get details
        const details = await fixedRateExchange.connect(owner).getExchange(fixedRateId)
        const needed = await fixedRateExchange.connect(owner).calcBaseInGivenOutDT(fixedRateId, web3.utils.toWei("1"), 0);
        erc20Contract = await ethers.getContractAt("MockERC20", details.baseToken)
        await erc20Contract
            .connect(owner)
            .transfer(user2.address, needed.baseTokenAmount);
        await erc20Contract.connect(user2).approve(erc20Token.address, needed.baseTokenAmount)

        const consumer = user2.address; // could be different user
        const dtAmount = web3.utils.toWei("1");
        const serviceIndex = 1; // dummy index
        const providerFeeAddress = user5.address; // marketplace fee Collector
        const providerFeeAmount = 0; // fee to be collected on top, requires approval
        const providerFeeToken = mockErc20.address; // token address for the feeAmount,
        const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
        const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
        const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
        const providerValidUntil = 0;

        //sign provider data
        const providerData = JSON.stringify({ "timeout": 0 })
        const message = ethers.utils.solidityKeccak256(
            ["bytes", "address", "address", "uint256", "uint256"],
            [
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                providerFeeAddress,
                providerFeeToken,
                providerFeeAmount,
                providerValidUntil
            ]
        );
        const signedMessage = await signMessage(message, providerFeeAddress);
        const tx = await erc20Token
            .connect(user2).buyFromFreAndOrder(
                {
                    "consumer": user2.address,
                    "amount": web3.utils.toWei("1"),
                    "serviceIndex": 1,
                    "_providerFee": {
                        providerFeeAddress: providerFeeAddress,
                        providerFeeToken: providerFeeToken,
                        providerFeeAmount: providerFeeAmount,
                        v: signedMessage.v,
                        r: signedMessage.r,
                        s: signedMessage.s,
                        providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                        validUntil: providerValidUntil
                    },
                    "_consumeMarketFee": {
                        consumeMarketFeeAddress: consumeMarketFeeAddress,
                        consumeMarketFeeToken: consumeMarketFeeToken,
                        consumeMarketFeeAmount: consumeMarketFeeAmount,
                    }
                },
                {
                    "exchangeContract": fixedRateExchange.address,
                    "exchangeId": fixedRateId,
                    "maxBaseTokenAmount": needed.baseTokenAmount,
                    "swapMarketFee": 0,
                    "marketFeeAddress": user5.address
                }
            )
        const txReceipt = await tx.wait();
        let event = getEventFromTx(txReceipt, 'OrderStarted')
        assert(event, "Cannot find OrderStarted event")
        //make sure that we don't have 'PublishMarketFee') event
        event = getEventFromTx(txReceipt, 'PublishMarketFee')
        assert.typeOf(event, 'undefined', "PublishMarketFee event found")
        //make sure that we have NewSubscription event
        event = getEventFromTx(txReceipt, 'NewSubscription')
        assert(event, "Cannot find NewSubscription event")
        //make sure that we have NewSubscription event
        event = getEventFromTx(txReceipt, 'RevenueAdded')
        assert(event, "Cannot find RevenueAdded event")

        assert(
            (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("0"), 'Invalid user balance, DT was not substracted'
        );

        assert(
            (await erc20Token.balanceOf(opcCollector.address)) ==
            web3.utils.toWei("0.0"), 'Invalid OPF balance, we should get 0.03 DTs'
        );
        assert(
            (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
        );
        assert(
            (await erc20Token.balanceOf(await erc20Token.getPaymentCollector())) ==
            web3.utils.toWei("0.0"), 'Invalid publisher reward, we should have 0.0 DT'
        );
    });


    it("#startOrder - user should succeed to call startOrder on a ERC20 without publishFee and provider Fee", async () => {

        const fixedRates = await erc20Token.connect(owner).getFixedRates()
        fixedRateExchange = await ethers.getContractAt("FixedRateExchange", fixedRates[0].contractAddress);
        fixedRateId = fixedRates[0].id
        //get details
        const details = await fixedRateExchange.connect(owner).getExchange(fixedRateId)
        const needed = await fixedRateExchange.connect(owner).calcBaseInGivenOutDT(fixedRateId, web3.utils.toWei("1"), 0);
        erc20Contract = await ethers.getContractAt("MockERC20", details.baseToken)
        await erc20Contract
            .connect(owner)
            .transfer(user2.address, needed.baseTokenAmount);
        await erc20Contract.connect(user2).increaseAllowance(erc20Token.address, needed.baseTokenAmount)

        const consumer = user2.address; // could be different user
        const dtAmount = web3.utils.toWei("1");
        const serviceIndex = 1; // dummy index
        const providerFeeAddress = user5.address; // marketplace fee Collector
        const providerFeeAmount = '1'; // fee to be collected on top, requires approval
        const providerFeeToken = mockErc20.address; // token address for the feeAmount, in this case DAI
        const providerValidUntil = 0;
        const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
        const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
        const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,

        // GET SOME consumeFeeToken
        const Mock20Contract = await ethers.getContractAt(
            "MockERC20",
            mockErc20.address
        );
        await Mock20Contract
            .connect(owner)
            .transfer(user2.address, ethers.utils.parseEther(providerFeeAmount));

        // we approve the erc20Token contract to pull feeAmount (3 DAI)

        await Mock20Contract
            .connect(user2)
            .increaseAllowance(erc20Token.address, web3.utils.toWei(providerFeeAmount));

        //sign provider data
        const providerData = JSON.stringify({ "timeout": 0 });
        const message = ethers.utils.solidityKeccak256(
            ["bytes", "address", "address", "uint256", "uint256"],
            [
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                providerFeeAddress,
                providerFeeToken,
                providerFeeAmount,
                providerValidUntil
            ]
        );
        const signedMessage = await signMessage(message, providerFeeAddress);
        const tx = await erc20Token
            .connect(user2).
            buyFromFreAndOrder(
                {
                    "consumer": user2.address,
                    "amount": web3.utils.toWei("1"),
                    "serviceIndex": 1,
                    "_providerFee": {
                        providerFeeAddress: providerFeeAddress,
                        providerFeeToken: providerFeeToken,
                        providerFeeAmount: providerFeeAmount,
                        v: signedMessage.v,
                        r: signedMessage.r,
                        s: signedMessage.s,
                        providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                        validUntil: providerValidUntil
                    },
                    "_consumeMarketFee": {
                        consumeMarketFeeAddress: consumeMarketFeeAddress,
                        consumeMarketFeeToken: consumeMarketFeeToken,
                        consumeMarketFeeAmount: consumeMarketFeeAmount,
                    }
                },
                {
                    "exchangeContract": fixedRateExchange.address,
                    "exchangeId": fixedRateId,
                    "maxBaseTokenAmount": needed.baseTokenAmount,
                    "swapMarketFee": 0,
                    "marketFeeAddress": user5.address
                }
            )
        const txReceipt = await tx.wait();
        let event = getEventFromTx(txReceipt, 'OrderStarted')
        assert(event, "Cannot find OrderStarted event")
        //make sure that we don't have 'PublishMarketFee') event
        event = getEventFromTx(txReceipt, 'PublishMarketFee')
        assert.typeOf(event, 'undefined', "PublishMarketFee event found")
        //make sure that we have ProviderFee event
        event = getEventFromTx(txReceipt, 'ProviderFee')
        assert(
            (await erc20Token.balanceOf(user2.address)) == web3.utils.toWei("0"), 'Invalid user balance, DT was not substracted'
        );

        assert(
            (await erc20Token.balanceOf(opcCollector.address)) ==
            web3.utils.toWei("0.0"), 'Invalid OPF balance, we should get 0.03 DTs'
        );
        assert(
            (await erc20Token.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
        );
        assert(
            (await erc20Token.balanceOf(await erc20Token.getPaymentCollector())) ==
            web3.utils.toWei("0.0"), 'Invalid publisher reward, we should have 0.97 DT'
        );
    });


    it("#startOrder - user should be able to get getPublishingMarketFee", async () => {
        const publishFee = await erc20TokenWithPublishFee
            .connect(user2)
            .getPublishingMarketFee();
        assert(publishFee[0] = publishMarketFeeAddress)
        assert(publishFee[1] = publishMarketFeeToken)
        assert(publishFee[2] = web3.utils.toWei(publishMarketFeeAmount))

    });


    //////////
    it("#startOrder - user should succeed to call startOrder on a ERC20 with 5 USDC publishFee, providerFee is ZERO and 5 USDC consumeFee", async () => {

        const publishFee = await erc20TokenWithPublishFee
            .connect(user2)
            .getPublishingMarketFee();
        const Mock20DecimalContract = await ethers.getContractAt(
            "contracts/interfaces/IERC20.sol:IERC20",
            publishFee[1]
        );

        const fixedRates = await erc20TokenWithPublishFee.connect(owner).getFixedRates()
        fixedRateExchange = await ethers.getContractAt("FixedRateExchange", fixedRates[0].contractAddress);
        fixedRateId = fixedRates[0].id
        //get details
        const details = await fixedRateExchange.connect(owner).getExchange(fixedRateId)
        const needed = await fixedRateExchange.connect(owner).calcBaseInGivenOutDT(fixedRateId, web3.utils.toWei("1"), 0);
        erc20Contract = await ethers.getContractAt("MockERC20", details.baseToken)
        await erc20Contract
            .connect(owner)
            .transfer(user2.address, needed.baseTokenAmount);
        await erc20Contract.connect(user2).approve(erc20TokenWithPublishFee.address, needed.baseTokenAmount)

        const consumer = user2.address; // could be different user
        const dtAmount = web3.utils.toWei("1");
        const serviceIndex = 1; // dummy index
        const providerFeeAddress = user5.address; // marketplace fee Collector
        const providerFeeAmount = 0; // fee to be collected on top, requires approval
        const providerFeeToken = mockErc20.address; // token address for the feeAmount, in this case DAI
        const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
        const consumeMarketFeeAmount = publishFee[2]; // fee to be collected on top, requires approval
        const consumeMarketFeeToken = Mock20DecimalContract.address; // token address for the feeAmount,
        const providerValidUntil = 0;
        //sign provider data
        const providerData = JSON.stringify({ "timeout": 0 })
        const message = ethers.utils.solidityKeccak256(
            ["bytes", "address", "address", "uint256", "uint256"],
            [
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                providerFeeAddress,
                providerFeeToken,
                providerFeeAmount,
                providerValidUntil
            ]
        );
        const signedMessage = await signMessage(message, providerFeeAddress);
        // GET SOME consumeFeeToken
        await Mock20DecimalContract
            .connect(owner)
            .transfer(user2.address, publishFee[2].add(consumeMarketFeeAmount));

        // we approve the erc20Token contract to pull feeAmount
        await Mock20DecimalContract
            .connect(user2)
            .approve(erc20TokenWithPublishFee.address, publishFee[2].add(consumeMarketFeeAmount));

        tx = await erc20TokenWithPublishFee
            .connect(user2).buyFromFreAndOrder(
                {
                    "consumer": user2.address,
                    "amount": web3.utils.toWei("1"),
                    "serviceIndex": 1,
                    "_providerFee": {
                        providerFeeAddress: providerFeeAddress,
                        providerFeeToken: providerFeeToken,
                        providerFeeAmount: providerFeeAmount,
                        v: signedMessage.v,
                        r: signedMessage.r,
                        s: signedMessage.s,
                        providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                        validUntil: providerValidUntil
                    },
                    "_consumeMarketFee": {
                        consumeMarketFeeAddress: consumeMarketFeeAddress,
                        consumeMarketFeeToken: consumeMarketFeeToken,
                        consumeMarketFeeAmount: consumeMarketFeeAmount,
                    }
                },
                {
                    "exchangeContract": fixedRateExchange.address,
                    "exchangeId": fixedRateId,
                    "maxBaseTokenAmount": needed.baseTokenAmount,
                    "swapMarketFee": 0,
                    "marketFeeAddress": user5.address
                }
            )


        const txReceipt = await tx.wait();
        let event = getEventFromTx(txReceipt, 'OrderStarted')
        assert(event, "Cannot find OrderStarted event")
        event = getEventFromTx(txReceipt, 'PublishMarketFee')
        assert(event, "Cannot find PublishMarketFee event")
        event = getEventFromTx(txReceipt, 'ConsumeMarketFee')
        assert(event, "Cannot find ConsumeMarketFee event")
        //make sure that we have ProviderFee event
        event = getEventFromTx(txReceipt, 'ProviderFee')
        assert(
            (await erc20TokenWithPublishFee.balanceOf(user2.address)) == web3.utils.toWei("0"), 'Invalid user balance, DT was not substracted'
        );

        assert(
            (await erc20TokenWithPublishFee.balanceOf(opcCollector.address)) ==
            web3.utils.toWei("0.0"), 'Invalid OPF balance, we should get 0.03 DTs'
        );
        assert(
            (await erc20TokenWithPublishFee.balanceOf(user3.address)) == web3.utils.toWei("0"), 'Invalid consumeFee, we should have DT as fee'
        );
        assert(
            (await erc20TokenWithPublishFee.balanceOf(await erc20TokenWithPublishFee.getPaymentCollector())) ==
            web3.utils.toWei("0.0"), 'Invalid publisher reward, we should have 0.97 DT'
        );
    });

    it("#setPublishingMarketFee - user should not be able to set new publish fee", async () => {
        await expectRevert(
            erc20TokenWithPublishFee.connect(user2).setPublishingMarketFee(user2.address, erc20Token.address, web3.utils.toWei('10')),
            "ERC20Template: not publishMarketFeeAddress"
        );
        const publishFee = await erc20TokenWithPublishFee
            .connect(user2)
            .getPublishingMarketFee();
        assert(publishFee[0] = publishMarketFeeAddress)
        assert(publishFee[1] = publishMarketFeeToken)
        assert(publishFee[2] = web3.utils.toWei(publishMarketFeeAmount))
    });
    it("#setPublishingMarketFee - publishMarketAccount should not be able to set new publish fee", async () => {

        await erc20TokenWithPublishFee.connect(publishMarketAccount).setPublishingMarketFee(user2.address, erc20Token.address, web3.utils.toWei('10'))
        const publishFee = await erc20TokenWithPublishFee
            .connect(user2)
            .getPublishingMarketFee();
        assert(publishFee[0] = user2.address)
        assert(publishFee[1] = erc20Token.address)
        assert(publishFee[2] = web3.utils.toWei('10'))
    });
    it("#setFeeCollector - user should not be able to set new fee collector", async () => {
        await expectRevert(
            erc20TokenWithPublishFee.connect(user2).setFeeCollector(user2.address),
            "ERC20Template: NOT DEPLOYER ROLE"
        );
    });
    it("#getId - should return templateId", async () => {
        const templateId = 3;
        assert((await erc20Token.getId()) == templateId);
    });

    // PREDICTOOR
    it("#secondsPerEpoch - secondsPerEpoch should be set", async () => {
        const secondsPerEpoch = await erc20Token.secondsPerEpoch();
        assert(secondsPerEpoch > 0, 'Invalid secondsPerEpoch');
    });
    it("#stakeTokens - stake token should be set", async () => {
        const stakeToken = await erc20Token.stakeToken();
        assert(stakeToken == mockErc20.address, 'Invalid stakeToken');
    });
    it("#secondsPerSubscription - secondsPerSubscription should be set", async () => {
        const secondsPerSubscription = await erc20Token.secondsPerSubscription();
        assert(secondsPerSubscription > 0, 'Invalid secondsPerSubscription');
    });
    it("#epoch, curEpoch - should return currenct epoch", async () => {
        const blockTimestamp = await blocktimestamp()
        const secondsPerEpoch = (await erc20Token.secondsPerEpoch())
        const epoch = parseInt(blockTimestamp / secondsPerEpoch) * secondsPerEpoch;
        assert((await erc20Token.toEpochStart(blockTimestamp))) == epoch;
        assert((await erc20Token.curEpoch())) == epoch;
    });
    it("#soonestEpochToPredict - should return soonest epoch to predict", async () => {
        const blockTimestamp = await blocktimestamp();
        const soonestEpochToPredict = await erc20Token.soonestEpochToPredict(blockTimestamp);
        const secondsPerEpoch = (await erc20Token.secondsPerEpoch())
        const railed = parseInt(blockTimestamp / secondsPerEpoch) * secondsPerEpoch
        const expected = railed + 2 * secondsPerEpoch;
        assert(soonestEpochToPredict == expected, 'Invalid soonest block to predict');
    });
    it("#getAggPredval - without subscription, should revert", async () => {
        const blockTimestamp = await blocktimestamp()
        const secondsPerEpoch = (await erc20Token.secondsPerEpoch())
        const railed = parseInt(blockTimestamp / secondsPerEpoch) * secondsPerEpoch
        const userAuth = await authorize(owner.address)
        await expectRevert(
            erc20Token.getAggPredval(railed, userAuth),
            "No subscription"
        );
    });
    it("#getAggPredval - invalid signature, should revert", async () => {
        const blockTimestamp = await blocktimestamp()
        const secondsPerEpoch = (await erc20Token.secondsPerEpoch())
        const railed = parseInt(blockTimestamp / secondsPerEpoch) * secondsPerEpoch
        const userAuth = await authorize(owner.address)
        userAuth.userAddress = user2.address
        await expectRevert(
            erc20Token.getAggPredval(railed, userAuth),
            "Invalid auth"
        );
    });
    it("#getAggPredval - expired signature, should revert", async () => {
        const blockTimestamp = await blocktimestamp()
        const railed = await erc20Token.soonestEpochToPredict(blockTimestamp);
        const userAuth = await authorize(owner.address, 100)
        await fastForward(200)
        await expectRevert(
            erc20Token.getAggPredval(railed, userAuth),
            "Expired"
        );
    });
    it("#getAggPredval - without subscription, should revert", async () => {
        const blockTimestamp = await blocktimestamp()
        const secondsPerEpoch = (await erc20Token.secondsPerEpoch())
        const railed = parseInt(blockTimestamp / secondsPerEpoch) * secondsPerEpoch
        const userAuth = await authorize(owner.address)
        await expectRevert(
            erc20Token.getAggPredval(railed, userAuth),
            "No subscription"
        );
    });
    it("#isValidSubscription - without subscription, should return false", async () => {
        const isValidSubscription = await erc20Token.isValidSubscription(erc20Token.address);
        assert(isValidSubscription == false, "Subscription must be invalid");
    });
    it("#submitPredval - predictoor submits predictedValue", async () => {
        const predictedValue = true;
        const stake = 100;
        await mockErc20.approve(erc20Token.address, stake);
        const soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());

        const tx = await erc20Token.submitPredval(predictedValue, stake, soonestEpochToPredict);
        const txReceipt = await tx.wait();
        const event = getEventFromTx(txReceipt, 'PredictionSubmitted')
        assert(event, "Cannot find PredictionSubmitted event")
        expect(event.event).to.equal("PredictionSubmitted");
        expect(event.args[0]).to.equal(owner.address);
        expect(event.args[1]).to.equal(soonestEpochToPredict);
        expect(event.args[2]).to.equal(stake);
    });
    it("#submitPredval - predictoor can read their submitted predictedValue", async () => {
        const userAuth = await authorize(owner.address)

        const predictedValue = true;
        const stake = 100;
        tx = await mockErc20.approve(erc20Token.address, stake);
        await tx.wait()
        const soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());
        tx = await erc20Token.submitPredval(predictedValue, stake, soonestEpochToPredict);
        await tx.wait()
        const prediction = await erc20Token.getPrediction(soonestEpochToPredict, owner.address, userAuth);
        expect(prediction.predictedValue).to.be.eq(predictedValue);
        expect(prediction.stake).to.be.eq(stake);
        expect(prediction.predictoor).to.be.eq(owner.address);
        expect(prediction.paid).to.be.eq(false);
    });
    it("#submitPredval - others cannot read submitted predictions", async () => {
        const predictedValue = true;
        const stake = 100;
        tx = await mockErc20.approve(erc20Token.address, stake);
        await tx.wait()
        const soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());
        await erc20Token.submitPredval(predictedValue, stake, soonestEpochToPredict);
        let userAuth = await authorize(user2.address)
        await expectRevert(erc20Token.connect(user2).getPrediction(soonestEpochToPredict, owner.address, userAuth), "Not auth");
        // fast forward blocks until next epoch
        await fastForward(sPerEpoch * 2 + 1)
        // user2 should be able to read the predictedValue now
        const prediction = await erc20Token.connect(user2).getPrediction(soonestEpochToPredict, owner.address, userAuth);
        expect(prediction.predictedValue).to.be.eq(predictedValue);
    });
    it("#submitPredval - should revert when predictoor submits too early", async () => {
        const predictedValue = true;
        const stake = 100;
        const block = await ethers.provider.getBlockNumber();
        const railed = await erc20Token.toEpochStart(block - 100);
        await mockErc20.approve(erc20Token.address, stake);

        await expectRevert(
            erc20Token.submitPredval(predictedValue, stake, railed),
            "too late to submit"
        );
    });
    it("#submitPredval - should update when predictoor submits duplicate prediction", async () => {
        const userAuth = await authorize(owner.address)
        const predictedValue = true;
        const stake = 100;
        await mockErc20.approve(erc20Token.address, stake * 2);
        const soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());

        await erc20Token.submitPredval(predictedValue, stake, soonestEpochToPredict);
        let prediction = await erc20Token.getPrediction(soonestEpochToPredict, owner.address, userAuth);
        expect(prediction.predictedValue).to.be.eq(predictedValue);

        await erc20Token.submitPredval(!predictedValue, stake, soonestEpochToPredict);
        prediction = await erc20Token.getPrediction(soonestEpochToPredict, owner.address, userAuth);
        expect(prediction.predictedValue).to.be.eq(!predictedValue);

        await mockErc20.approve(erc20Token.address, 1);
        let mockErc20BalanceBefore = await mockErc20.balanceOf(owner.address);
        await erc20Token.submitPredval(predictedValue, stake + 1, soonestEpochToPredict);
        let mockErc20BalanceAfter = await mockErc20.balanceOf(owner.address);
        expect(mockErc20BalanceBefore).to.equal(mockErc20BalanceAfter.add(1))

        mockErc20BalanceBefore = await mockErc20.balanceOf(owner.address);
        await erc20Token.submitPredval(predictedValue, stake - 1, soonestEpochToPredict),
        mockErc20BalanceAfter = await mockErc20.balanceOf(owner.address);
        expect(mockErc20BalanceAfter).to.equal(mockErc20BalanceBefore.add(2))
    });
    it("#pausePredictions - should pause and resume predictions", async () => {
        await erc20Token.pausePredictions();
        const isPaused = await erc20Token.paused();
        assert(isPaused == true, "Predictions should be paused");

        // submit predictedValue should revert
        const predictedValue = true;
        const stake = 100;
        await mockErc20.approve(erc20Token.address, stake);
        const soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());
        await expectRevert(
            erc20Token.submitPredval(predictedValue, stake, soonestEpochToPredict),
            "paused"
        );

        await erc20Token.pausePredictions();
        const isResumed = await erc20Token.paused();
        assert(isResumed == false, "Predictions should be resumed");
    });

    it("#submitTrueVal - should revert submitting for a future block", async () => {
        const soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());
        await expectRevert(erc20Token.submitTrueVal(soonestEpochToPredict, true, web3.utils.toWei("230.43"), false), "too early to submit");
    });

    it("#submitTrueVal - should submit for a block in the past", async () => {
        const soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());
        const submissionBlock = soonestEpochToPredict - 2 * sPerEpoch;
        const tx = await erc20Token.submitTrueVal(submissionBlock, true, web3.utils.toWei("230.43"), false);
        const tx_receipt = await tx.wait();
        const event = getEventFromTx(tx_receipt, "TruevalSubmitted");
        expect(event.args[0]).to.equal(submissionBlock);
        expect(event.args[1]).to.equal(true);
        expect(event.args[2]).to.equal(web3.utils.toWei("230.43"));
        expect(event.args[3]).to.equal(1);

        const trueValue = await erc20Token.trueValues(submissionBlock);
        expect(trueValue).to.be.true;
    });

    it("#subscriptions - user2 must be subscribed after buying access", async () => {
        const fixedRates = await erc20Token.connect(owner).getFixedRates()
        fixedRateExchange = await ethers.getContractAt("FixedRateExchange", fixedRates[0].contractAddress);
        fixedRateId = fixedRates[0].id
        //get details
        const details = await fixedRateExchange.connect(owner).getExchange(fixedRateId)
        const needed = await fixedRateExchange.connect(owner).calcBaseInGivenOutDT(fixedRateId, web3.utils.toWei("1"), 0);
        erc20Contract = await ethers.getContractAt("MockERC20", details.baseToken)
        await erc20Contract
            .connect(owner)
            .transfer(user2.address, needed.baseTokenAmount);
        await erc20Contract.connect(user2).approve(erc20Token.address, needed.baseTokenAmount)
        const consumer = user2.address; // could be different user
        const serviceIndex = 1; // dummy index
        const providerFeeAddress = user5.address; // marketplace fee Collector
        const providerFeeAmount = 0; // fee to be collected on top, requires approval
        const providerFeeToken = mockErc20.address; // token address for the feeAmount,
        const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
        const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
        const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
        const providerValidUntil = 0;
        //sign provider data
        const providerData = JSON.stringify({ "timeout": 0 })
        const message = ethers.utils.solidityKeccak256(
            ["bytes", "address", "address", "uint256", "uint256"],
            [
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                providerFeeAddress,
                providerFeeToken,
                providerFeeAmount,
                providerValidUntil
            ]
        );
        const signedMessage = await signMessage(message, providerFeeAddress);
        const tx = await erc20Token
            .connect(user2).buyFromFreAndOrder(
                {
                    "consumer": user2.address,
                    "amount": web3.utils.toWei("1"),
                    "serviceIndex": 1,
                    "_providerFee": {
                        providerFeeAddress: providerFeeAddress,
                        providerFeeToken: providerFeeToken,
                        providerFeeAmount: providerFeeAmount,
                        v: signedMessage.v,
                        r: signedMessage.r,
                        s: signedMessage.s,
                        providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                        validUntil: providerValidUntil
                    },
                    "_consumeMarketFee": {
                        consumeMarketFeeAddress: consumeMarketFeeAddress,
                        consumeMarketFeeToken: consumeMarketFeeToken,
                        consumeMarketFeeAmount: consumeMarketFeeAmount,
                    }
                },
                {
                    "exchangeContract": fixedRateExchange.address,
                    "exchangeId": fixedRateId,
                    "maxBaseTokenAmount": needed.baseTokenAmount,
                    "swapMarketFee": 0,
                    "marketFeeAddress": user5.address
                }
            )


        const subscription = await erc20Token.subscriptions(user2.address);
        // check if subscription is valid
        const currentTime = await blocktimestamp();
        const secondsPerEpoch = await erc20Token.secondsPerEpoch();
        const expirationEpoch = parseInt(currentTime / secondsPerEpoch) * secondsPerEpoch;
        expect(subscription.expires).to.be.gt(expirationEpoch);
        expect(subscription.user).to.be.eq(user2.address);

        const valid = await erc20Token.isValidSubscription(user2.address);
        expect(valid).to.be.true;
    });

    it("#subscriptions - user2 subscription should expire", async () => {
        const fixedRates = await erc20Token.connect(owner).getFixedRates()
        fixedRateExchange = await ethers.getContractAt("FixedRateExchange", fixedRates[0].contractAddress);
        fixedRateId = fixedRates[0].id
        //get details
        const details = await fixedRateExchange.connect(owner).getExchange(fixedRateId)
        const needed = await fixedRateExchange.connect(owner).calcBaseInGivenOutDT(fixedRateId, web3.utils.toWei("1"), 0);
        erc20Contract = await ethers.getContractAt("MockERC20", details.baseToken)
        await erc20Contract
            .connect(owner)
            .transfer(user2.address, needed.baseTokenAmount);
        await erc20Contract.connect(user2).approve(erc20Token.address, needed.baseTokenAmount)

        const consumer = user2.address; // could be different user
        const serviceIndex = 1; // dummy index
        const providerFeeAddress = user5.address; // marketplace fee Collector
        const providerFeeAmount = 0; // fee to be collected on top, requires approval
        const providerFeeToken = mockErc20.address; // token address for the feeAmount,
        const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
        const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
        const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
        const providerValidUntil = 0;
        //sign provider data
        const providerData = JSON.stringify({ "timeout": 0 })
        const message = ethers.utils.solidityKeccak256(
            ["bytes", "address", "address", "uint256", "uint256"],
            [
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                providerFeeAddress,
                providerFeeToken,
                providerFeeAmount,
                providerValidUntil
            ]
        );
        const signedMessage = await signMessage(message, providerFeeAddress);

        // set back to normal
        const tx = await erc20Token
            .connect(user2).buyFromFreAndOrder(
                {
                    "consumer": user2.address,
                    "amount": web3.utils.toWei("1"),
                    "serviceIndex": 1,
                    "_providerFee": {
                        providerFeeAddress: providerFeeAddress,
                        providerFeeToken: providerFeeToken,
                        providerFeeAmount: providerFeeAmount,
                        v: signedMessage.v,
                        r: signedMessage.r,
                        s: signedMessage.s,
                        providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                        validUntil: providerValidUntil
                    },
                    "_consumeMarketFee": {
                        consumeMarketFeeAddress: consumeMarketFeeAddress,
                        consumeMarketFeeToken: consumeMarketFeeToken,
                        consumeMarketFeeAmount: consumeMarketFeeAmount,
                    }
                },
                {
                    "exchangeContract": fixedRateExchange.address,
                    "exchangeId": fixedRateId,
                    "maxBaseTokenAmount": needed.baseTokenAmount,
                    "swapMarketFee": 0,
                    "marketFeeAddress": user5.address
                }
            )

        await fastForward(sPerSubscription);
        const valid = await erc20Token.isValidSubscription(user2.address);
        expect(valid).to.be.false;
    });

    it("#subscriptions - user3 must be able to subscribe by calling buyFromFreAndOrder", async () => {
        const fixedRates = await erc20Token.connect(owner).getFixedRates()
        fixedRateExchange = await ethers.getContractAt("FixedRateExchange", fixedRates[0].contractAddress);
        fixedRateId = fixedRates[0].id
        //get details
        const details = await fixedRateExchange.connect(owner).getExchange(fixedRateId)
        const needed = await fixedRateExchange.connect(owner).calcBaseInGivenOutDT(fixedRateId, web3.utils.toWei("1"), 0);
        erc20Contract = await ethers.getContractAt("MockERC20", details.baseToken)
        await erc20Contract
            .connect(owner)
            .transfer(user2.address, needed.baseTokenAmount);
        await erc20Contract.connect(user2).approve(erc20Token.address, needed.baseTokenAmount)
        const consumer = user2.address; // could be different user
        const serviceIndex = 1; // dummy index
        const providerFeeAddress = user5.address; // marketplace fee Collector
        const providerFeeAmount = 0; // fee to be collected on top, requires approval
        const providerFeeToken = mockErc20.address; // token address for the feeAmount,
        const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
        const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
        const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
        const providerValidUntil = 0;
        //sign provider data
        const providerData = JSON.stringify({ "timeout": 0 })
        const message = ethers.utils.solidityKeccak256(
            ["bytes", "address", "address", "uint256", "uint256"],
            [
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                providerFeeAddress,
                providerFeeToken,
                providerFeeAmount,
                providerValidUntil
            ]
        );
        const signedMessage = await signMessage(message, providerFeeAddress);
        tx = await erc20Token
            .connect(user2).buyFromFreAndOrder(
                {
                    "consumer": user2.address,
                    "amount": web3.utils.toWei("1"),
                    "serviceIndex": 1,
                    "_providerFee": {
                        providerFeeAddress: providerFeeAddress,
                        providerFeeToken: providerFeeToken,
                        providerFeeAmount: providerFeeAmount,
                        v: signedMessage.v,
                        r: signedMessage.r,
                        s: signedMessage.s,
                        providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                        validUntil: providerValidUntil
                    },
                    "_consumeMarketFee": {
                        consumeMarketFeeAddress: consumeMarketFeeAddress,
                        consumeMarketFeeToken: consumeMarketFeeToken,
                        consumeMarketFeeAmount: consumeMarketFeeAmount,
                    }
                },
                {
                    "exchangeContract": fixedRateExchange.address,
                    "exchangeId": fixedRateId,
                    "maxBaseTokenAmount": needed.baseTokenAmount,
                    "swapMarketFee": 0,
                    "marketFeeAddress": user5.address
                }
            )
        const subscription = await erc20Token.subscriptions(user2.address);
        // check if subscription is valid
        const currentTime = await blocktimestamp();
        const secondsPerEpoch = await erc20Token.secondsPerEpoch();
        const expirationEpoch = parseInt(currentTime / secondsPerEpoch) * secondsPerEpoch;
        expect(subscription.expires).to.be.gt(expirationEpoch);
        expect(subscription.user).to.be.eq(user2.address);

        const valid = await erc20Token.isValidSubscription(user2.address);
        expect(valid).to.be.true;
    });
    // can read getAggPredval with a valid subscription
    it("#getAggPredval - should return agg_predictedValue if caller has a valid subscription", async () => {
        const fixedRates = await erc20Token.connect(owner).getFixedRates()
        fixedRateExchange = await ethers.getContractAt("FixedRateExchange", fixedRates[0].contractAddress);
        fixedRateId = fixedRates[0].id
        //get details
        const details = await fixedRateExchange.connect(owner).getExchange(fixedRateId)
        const needed = await fixedRateExchange.connect(owner).calcBaseInGivenOutDT(fixedRateId, web3.utils.toWei("1"), 0);
        erc20Contract = await ethers.getContractAt("MockERC20", details.baseToken)
        await erc20Contract
            .connect(owner)
            .transfer(user2.address, needed.baseTokenAmount);
        await erc20Contract.connect(user2).approve(erc20Token.address, needed.baseTokenAmount)

        const consumer = user2.address; // could be different user
        const serviceIndex = 1; // dummy index
        const providerFeeAddress = user5.address; // marketplace fee Collector
        const providerFeeAmount = 0; // fee to be collected on top, requires approval
        const providerFeeToken = mockErc20.address; // token address for the feeAmount,
        const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
        const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
        const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
        const providerValidUntil = 0;
        //sign provider data
        const providerData = JSON.stringify({ "timeout": 0 })
        const message = ethers.utils.solidityKeccak256(
            ["bytes", "address", "address", "uint256", "uint256"],
            [
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                providerFeeAddress,
                providerFeeToken,
                providerFeeAmount,
                providerValidUntil
            ]
        );
        const signedMessage = await signMessage(message, providerFeeAddress);
        const tx = await erc20Token
            .connect(user2).buyFromFreAndOrder(
                {
                    "consumer": user2.address,
                    "amount": web3.utils.toWei("1"),
                    "serviceIndex": 1,
                    "_providerFee": {
                        providerFeeAddress: providerFeeAddress,
                        providerFeeToken: providerFeeToken,
                        providerFeeAmount: providerFeeAmount,
                        v: signedMessage.v,
                        r: signedMessage.r,
                        s: signedMessage.s,
                        providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                        validUntil: providerValidUntil
                    },
                    "_consumeMarketFee": {
                        consumeMarketFeeAddress: consumeMarketFeeAddress,
                        consumeMarketFeeToken: consumeMarketFeeToken,
                        consumeMarketFeeAmount: consumeMarketFeeAmount,
                    }
                },
                {
                    "exchangeContract": fixedRateExchange.address,
                    "exchangeId": fixedRateId,
                    "maxBaseTokenAmount": needed.baseTokenAmount,
                    "swapMarketFee": 0,
                    "marketFeeAddress": user5.address
                }
            )


        let soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());
        const userAuth = await authorize(user2.address)
        await expectRevert(erc20Token.connect(user2).getAggPredval(soonestEpochToPredict, userAuth), "predictions not closed");
        await expectRevert(erc20Token.getTotalStake(soonestEpochToPredict), "predictions not closed");
        
        let curEpoch = await erc20Token.curEpoch();
        const [numer, denom] = await erc20Token.connect(user2).getAggPredval(curEpoch, userAuth);
        const totalStake = await erc20Token.getTotalStake(curEpoch);
        expect(numer).to.be.eq(0);
        expect(denom).to.be.eq(0);
        expect(totalStake).to.be.eq(0);

        // user2 makes a prediction
        const predictedValue = true;
        const stake = web3.utils.toWei("1");
        await mockErc20.transfer(user3.address, stake);
        await mockErc20.connect(user3).approve(erc20Token.address, stake);
        await erc20Token.connect(user3).submitPredval(predictedValue, stake, soonestEpochToPredict);
        
        const secondsPerEpoch = await erc20Token.secondsPerEpoch();
        await fastForward(secondsPerEpoch.toNumber())
        curEpoch = await erc20Token.curEpoch();
        const [numer2, denom2] = await erc20Token.connect(user2).getAggPredval(curEpoch + secondsPerEpoch, userAuth);
        const totalStake2 = await erc20Token.getTotalStake(curEpoch);
        expect(numer2).to.be.eq(web3.utils.toWei("1"));
        expect(denom2).to.be.eq(web3.utils.toWei("1"));
        expect(totalStake2).to.be.eq(web3.utils.toWei("1"));

        // check subscription revenue
        const revenue = await erc20Token.getsubscriptionRevenueAtEpoch(soonestEpochToPredict);
        expect(revenue).to.be.gt(0);
    });

    // can read getAggPredval with a valid subscription
    it("#payout - predictoor should get paid", async () => {
        const fixedRates = await erc20Token.connect(owner).getFixedRates()
        fixedRateExchange = await ethers.getContractAt("FixedRateExchange", fixedRates[0].contractAddress);
        fixedRateId = fixedRates[0].id
        //get details
        const details = await fixedRateExchange.connect(owner).getExchange(fixedRateId)
        const needed = await fixedRateExchange.connect(owner).calcBaseInGivenOutDT(fixedRateId, web3.utils.toWei("1"), 0);
        erc20Contract = await ethers.getContractAt("MockERC20", details.baseToken)
        await erc20Contract
            .connect(owner)
            .transfer(user2.address, needed.baseTokenAmount);
        await erc20Contract.connect(user2).approve(erc20Token.address, needed.baseTokenAmount)

        const consumer = user2.address; // could be different user
        const serviceIndex = 1; // dummy index
        const providerFeeAddress = user5.address; // marketplace fee Collector
        const providerFeeAmount = 0; // fee to be collected on top, requires approval
        const providerFeeToken = mockErc20.address; // token address for the feeAmount,
        const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
        const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
        const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
        const providerValidUntil = 0;
        const amountDT = web3.utils.toWei("1");

        //sign provider data
        const providerData = JSON.stringify({ "timeout": 0 })
        const message = ethers.utils.solidityKeccak256(
            ["bytes", "address", "address", "uint256", "uint256"],
            [
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                providerFeeAddress,
                providerFeeToken,
                providerFeeAmount,
                providerValidUntil
            ]
        );
        const signedMessage = await signMessage(message, providerFeeAddress);
        let soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());
        let revenue_at_block = await erc20Token.connect(user2).getsubscriptionRevenueAtEpoch(soonestEpochToPredict)
        expect(revenue_at_block).to.be.eq(0);

        let tx = await erc20Token
            .connect(user2).buyFromFreAndOrder(
                {
                    "consumer": user2.address,
                    "amount": web3.utils.toWei("1"),
                    "serviceIndex": 1,
                    "_providerFee": {
                        providerFeeAddress: providerFeeAddress,
                        providerFeeToken: providerFeeToken,
                        providerFeeAmount: providerFeeAmount,
                        v: signedMessage.v,
                        r: signedMessage.r,
                        s: signedMessage.s,
                        providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                        validUntil: providerValidUntil
                    },
                    "_consumeMarketFee": {
                        consumeMarketFeeAddress: consumeMarketFeeAddress,
                        consumeMarketFeeToken: consumeMarketFeeToken,
                        consumeMarketFeeAmount: consumeMarketFeeAmount,
                    }
                },
                {
                    "exchangeContract": fixedRateExchange.address,
                    "exchangeId": fixedRateId,
                    "maxBaseTokenAmount": needed.baseTokenAmount,
                    "swapMarketFee": 0,
                    "marketFeeAddress": user5.address
                }
            )

        revenue_at_block = await erc20Token.connect(user2).getsubscriptionRevenueAtEpoch(soonestEpochToPredict)
        expect(revenue_at_block).to.be.gt(0);

        // predictoor makes a prediction
        const predictedValue = true;
        const stake = web3.utils.toWei("1");
        await mockErc20.transfer(user3.address, stake);
        await mockErc20.connect(user3).approve(erc20Token.address, stake);

        await erc20Token.connect(user3).submitPredval(predictedValue, stake, soonestEpochToPredict);
        let mockErc20Balance = await mockErc20.balanceOf(user3.address)
        tx = await erc20Token.connect(user3).payout(soonestEpochToPredict, user3.address)
        txReceipt = await tx.wait();
        let event = getEventFromTx(txReceipt, 'PredictionPayout')
        assert(event == null, "PredictionPayout event found")
        //we are not getting anything, round is stil in progress
        expect(await mockErc20.balanceOf(user3.address)).to.be.eq(mockErc20Balance);
        const oceanBalance = await mockErc20.balanceOf(user2.address)
        await fastForward(sPerEpoch * 2);

        mockErc20Balance = await mockErc20.balanceOf(user3.address)
        tx = await erc20Token.connect(user3).payout(soonestEpochToPredict, user3.address)
        txReceipt = await tx.wait();
        //we are not getting anything, round is stil in progress
        event = getEventFromTx(txReceipt, 'PredictionPayout')
        assert(event == null, "PredictionPayout event found")
        expect(await mockErc20.balanceOf(user3.address)).to.be.eq(mockErc20Balance);


        // opf submits truval
        tx = await erc20Token.submitTrueVal(soonestEpochToPredict, predictedValue, web3.utils.toWei("230.43"), false);
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'TruevalSubmitted')
        assert(event, "TruevalSubmitted event not found")
        assert(event.args.status == 1, 'Status missmatch') // round status should be 1 == Status.Paying


        const balBefore = await mockErc20.balanceOf(user3.address);
        tx = await erc20Token.connect(user3).payout(soonestEpochToPredict, user3.address);
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'PredictionPayout')
        assert(event, "PredictionPayout event not found")
        assert(event.args.status == 1, 'Status missmatch') // round status should be 1 == Status.Paying
        const balAfter = await mockErc20.balanceOf(user3.address);
        expect(balAfter).to.be.gt(balBefore);
        const profit = balAfter.sub(balBefore);
        const expectedProfit = 1 + (2 / parseInt(3600 / parseInt(300 / 24)))
        expect(parseFloat(web3.utils.fromWei(profit.toString()))).to.be.eq(expectedProfit);

        // user tries to call payout for the same slot
        mockErc20Balance = await mockErc20.balanceOf(user3.address)
        tx = await erc20Token.connect(user3).payout(soonestEpochToPredict, user3.address)
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'PredictionPayout')
        //we are not getting anything, we have been paid already
        assert(event == null, "PredictionPayout event found")
        expect(await mockErc20.balanceOf(user3.address)).to.be.eq(mockErc20Balance);

    });

    it("#payoutMultiple - predictoor should get paid", async () => {
        const fixedRates = await erc20Token.connect(owner).getFixedRates()
        fixedRateExchange = await ethers.getContractAt("FixedRateExchange", fixedRates[0].contractAddress);
        fixedRateId = fixedRates[0].id
        //get details
        const details = await fixedRateExchange.connect(owner).getExchange(fixedRateId)
        const needed = await fixedRateExchange.connect(owner).calcBaseInGivenOutDT(fixedRateId, web3.utils.toWei("1"), 0);
        erc20Contract = await ethers.getContractAt("MockERC20", details.baseToken)
        await erc20Contract
            .connect(owner)
            .transfer(user2.address, needed.baseTokenAmount);
        await erc20Contract.connect(user2).approve(erc20Token.address, needed.baseTokenAmount)

        const consumer = user2.address; // could be different user
        const serviceIndex = 1; // dummy index
        const providerFeeAddress = user5.address; // marketplace fee Collector
        const providerFeeAmount = 0; // fee to be collected on top, requires approval
        const providerFeeToken = mockErc20.address; // token address for the feeAmount,
        const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
        const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
        const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
        const providerValidUntil = 0;

        //sign provider data
        const providerData = JSON.stringify({ "timeout": 0 })
        const message = ethers.utils.solidityKeccak256(
            ["bytes", "address", "address", "uint256", "uint256"],
            [
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                providerFeeAddress,
                providerFeeToken,
                providerFeeAmount,
                providerValidUntil
            ]
        );
        const signedMessage = await signMessage(message, providerFeeAddress);
        let soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());//because we also have startOrder
        let revenue_at_block = await erc20Token.connect(user2).getsubscriptionRevenueAtEpoch(soonestEpochToPredict)
        expect(revenue_at_block).to.be.eq(0);

        let tx = await erc20Token
            .connect(user2).buyFromFreAndOrder(
                {
                    "consumer": user2.address,
                    "amount": web3.utils.toWei("1"),
                    "serviceIndex": 1,
                    "_providerFee": {
                        providerFeeAddress: providerFeeAddress,
                        providerFeeToken: providerFeeToken,
                        providerFeeAmount: providerFeeAmount,
                        v: signedMessage.v,
                        r: signedMessage.r,
                        s: signedMessage.s,
                        providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                        validUntil: providerValidUntil
                    },
                    "_consumeMarketFee": {
                        consumeMarketFeeAddress: consumeMarketFeeAddress,
                        consumeMarketFeeToken: consumeMarketFeeToken,
                        consumeMarketFeeAmount: consumeMarketFeeAmount,
                    }
                },
                {
                    "exchangeContract": fixedRateExchange.address,
                    "exchangeId": fixedRateId,
                    "maxBaseTokenAmount": needed.baseTokenAmount,
                    "swapMarketFee": 0,
                    "marketFeeAddress": user5.address
                }
            )

        revenue_at_block = await erc20Token.connect(user2).getsubscriptionRevenueAtEpoch(soonestEpochToPredict)
        expect(revenue_at_block).to.be.gt(0);

        // predictoor makes a prediction
        const predictedValue = true;
        const stake = web3.utils.toWei("1");
        await mockErc20.transfer(user3.address, stake);
        await mockErc20.connect(user3).approve(erc20Token.address, stake);
        await erc20Token.connect(user3).submitPredval(predictedValue, stake, soonestEpochToPredict);

        let mockErc20Balance = await mockErc20.balanceOf(user3.address)
        tx = await erc20Token.connect(user3).payoutMultiple([soonestEpochToPredict], user3.address)
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'PredictionPayout')
        //we are not getting anything, round is still in progress
        assert(event == null, "PredictionPayout event found")
        expect(await mockErc20.balanceOf(user3.address)).to.be.eq(mockErc20Balance);
        await fastForward(sPerEpoch * 2);
        mockErc20Balance = await mockErc20.balanceOf(user3.address)
        tx = await erc20Token.connect(user3).payoutMultiple([soonestEpochToPredict], user3.address)
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'PredictionPayout')
        //we are not getting anything, round is still in progress
        assert(event == null, "PredictionPayout event found")
        expect(await mockErc20.balanceOf(user3.address)).to.be.eq(mockErc20Balance);

        // opf submits truval
        tx = await erc20Token.submitTrueVal(soonestEpochToPredict, predictedValue, web3.utils.toWei("230.43"), false);
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'TruevalSubmitted')
        assert(event, "TruevalSubmitted event not found")
        assert(event.args.status == 1, 'Status missmatch') // round status should be 1 == Status.Paying


        const balBefore = await mockErc20.balanceOf(user3.address);
        tx = await erc20Token.connect(user3).payoutMultiple([soonestEpochToPredict], user3.address);
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'PredictionPayout')
        assert(event, "PredictionPayout event not found")
        assert(event.args.status == 1, 'Status missmatch') // round status should be 1 == Status.Paying
        const balAfter = await mockErc20.balanceOf(user3.address);
        expect(balAfter).to.be.gt(balBefore);

        const profit = balAfter.sub(balBefore);
        const expectedProfit = 1 + (2 / parseInt(3600 / parseInt(300 / 24)))
        expect(parseFloat(web3.utils.fromWei(profit.toString()))).to.be.eq(expectedProfit);

        mockErc20Balance = await mockErc20.balanceOf(user3.address)
        tx = await erc20Token.connect(user3).payoutMultiple([soonestEpochToPredict], user3.address)
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'PredictionPayout')
        //we are not getting anything, we got the payment already
        assert(event == null, "PredictionPayout event found")
        expect(await mockErc20.balanceOf(user3.address)).to.be.eq(mockErc20Balance);

    });

    it("multiple predictoor compete and some gets paid", async () => {
        // predictoor makes a predictions
        let predictoors = [reciever, user2, user3, user4, user5, user6];
        let predictions = [];
        let stakes = [];
        let tx, txReceipt, event
        for (const predictoor of predictoors) {
            const amt = web3.utils.toWei("200");
            await mockErc20.transfer(predictoor.address, amt);
            await mockErc20.connect(predictoor).approve(erc20Token.address, amt);
        }

        const secondsPerEpoch = await erc20Token.secondsPerEpoch();
        const currentBlock = await blocktimestamp();
        const soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());
        await fastForward(secondsPerEpoch * 2)
        const predictionBlock = await erc20Token.soonestEpochToPredict(await blocktimestamp());

        for (const predictoor of predictoors) {
            const stake = 10 + Math.random() * 100;
            const stakeWei = web3.utils.toWei(stake.toString());
            const p = Math.random() > 0.5;
            predictions.push(p);
            stakes.push(stake);
            await erc20Token.connect(predictoor).submitPredval(p, stakeWei, predictionBlock)
        }

        await fastForward(sPerEpoch * 2);
        const truval = Math.random() > 0.5;
        const winners = predictions.map((x, i) => x == truval ? i : null).filter(x => x != null);
        const totalStake = stakes.reduce((a, b) => a + b, 0);
        const winnersStake = winners.map(x => stakes[x]).reduce((a, b) => a + b, 0);

        // opf submits truval
        tx = await erc20Token.submitTrueVal(predictionBlock, truval, web3.utils.toWei("230.43"), false);
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'Transfer')
        if (winners.length > 0)
            assert(event == null, "We should not have any transfer event, winners are present")
        else
            assert(event, "We should have a transfer event, because everyone was slashed")
        // each predictoor calls payout function
        for (let i = 0; i < predictoors.length; i++) {
            let predictoor = predictoors[i];
            if (winners.includes(i)) {
                const balBefore = await mockErc20.balanceOf(predictoor.address);
                await erc20Token.connect(predictoor).payout(predictionBlock, predictoor.address);
                const balAfter = await mockErc20.balanceOf(predictoor.address);
                expect(balAfter).to.be.gt(balBefore);
                const profit = balAfter.sub(balBefore);
                const expectedProfit = stakes[i] / winnersStake * totalStake
                expect(parseFloat(web3.utils.fromWei(profit.toString()))).to.be.closeTo(expectedProfit, 0.2);
            } else {
                tx = await erc20Token.connect(predictoor).payout(predictionBlock, predictoor.address);
                txReceipt = await tx.wait();
                event = getEventFromTx(txReceipt, 'PredictionPayout')
                assert(event, "PredictionPayout event not found")
                expect(event.args.payout).to.be.eq(0)

            }
        }
    });

    it("#redeemUnusedSlotRevenue - admin should be able to redeem unused sub revenue for epoch", async () => {
        const fixedRates = await erc20Token.connect(owner).getFixedRates()
        fixedRateExchange = await ethers.getContractAt("FixedRateExchange", fixedRates[0].contractAddress);
        fixedRateId = fixedRates[0].id
        //get details
        const details = await fixedRateExchange.connect(owner).getExchange(fixedRateId)
        const needed = await fixedRateExchange.connect(owner).calcBaseInGivenOutDT(fixedRateId, web3.utils.toWei("1"), 0);
        erc20Contract = await ethers.getContractAt("MockERC20", details.baseToken)
        await erc20Contract
            .connect(owner)
            .transfer(user2.address, needed.baseTokenAmount);
        await erc20Contract.connect(user2).approve(erc20Token.address, needed.baseTokenAmount)

        const consumer = user2.address; // could be different user
        const serviceIndex = 1; // dummy index
        const providerFeeAddress = user5.address; // marketplace fee Collector
        const providerFeeAmount = 0; // fee to be collected on top, requires approval
        const providerFeeToken = mockErc20.address; // token address for the feeAmount,
        const consumeMarketFeeAddress = user5.address; // marketplace fee Collector
        const consumeMarketFeeAmount = 0; // fee to be collected on top, requires approval
        const consumeMarketFeeToken = mockErc20.address; // token address for the feeAmount,
        const providerValidUntil = 0;

        //sign provider data
        const providerData = JSON.stringify({ "timeout": 0 })
        const message = ethers.utils.solidityKeccak256(
            ["bytes", "address", "address", "uint256", "uint256"],
            [
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                providerFeeAddress,
                providerFeeToken,
                providerFeeAmount,
                providerValidUntil
            ]
        );
        const signedMessage = await signMessage(message, providerFeeAddress);
        let soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());
        let revenue_at_block = await erc20Token.connect(user2).getsubscriptionRevenueAtEpoch(soonestEpochToPredict)
        expect(revenue_at_block).to.be.eq(0);

        const tx = await erc20Token
            .connect(user2).buyFromFreAndOrder(
                {
                    "consumer": user2.address,
                    "amount": web3.utils.toWei("1"),
                    "serviceIndex": 1,
                    "_providerFee": {
                        providerFeeAddress: providerFeeAddress,
                        providerFeeToken: providerFeeToken,
                        providerFeeAmount: providerFeeAmount,
                        v: signedMessage.v,
                        r: signedMessage.r,
                        s: signedMessage.s,
                        providerData: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(providerData)),
                        validUntil: providerValidUntil
                    },
                    "_consumeMarketFee": {
                        consumeMarketFeeAddress: consumeMarketFeeAddress,
                        consumeMarketFeeToken: consumeMarketFeeToken,
                        consumeMarketFeeAmount: consumeMarketFeeAmount,
                    }
                },
                {
                    "exchangeContract": fixedRateExchange.address,
                    "exchangeId": fixedRateId,
                    "maxBaseTokenAmount": needed.baseTokenAmount,
                    "swapMarketFee": 0,
                    "marketFeeAddress": user5.address
                }
            )

        revenue_at_block = await erc20Token.connect(user2).getsubscriptionRevenueAtEpoch(soonestEpochToPredict)
        await fastForward(sPerEpoch * 2)
        const currentBlock = await blocktimestamp();
        const epoch = await erc20Token.toEpochStart(currentBlock);
        const tx_2 = await erc20Token.redeemUnusedSlotRevenue(epoch);
        const txReceipt_2 = await tx_2.wait();
        let event_2 = getEventFromTx(txReceipt_2, 'Transfer')
        expect(event_2.args.from).to.be.eq(erc20Token.address);
        expect(event_2.args.to).to.be.eq(freMarketFeeCollector.address);
        expect(event_2.args.value).to.be.eq(6666666666666666);
    })
    it("#redeemUnusedSlotRevenue - admin should not be able to redeem for future epoch", async () => {
        const secondsPerEpoch = await erc20Token.secondsPerEpoch();
        const currentBlock = await blocktimestamp();
        const railedBlock = await erc20Token.toEpochStart(currentBlock) + 1;
        await expectRevert.unspecified(erc20Token.redeemUnusedSlotRevenue(railedBlock));
    })
    it("predictoor can redeem stake if OPF does not submit", async () => {
        const stake = 100;
        await mockErc20.transfer(user2.address, stake);
        await mockErc20.connect(user2).approve(erc20Token.address, stake);
        const prediction = true;
        const soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());
        const blockNum = await ethers.provider.getBlockNumber();
        const slot = await erc20Token.toEpochStart(soonestEpochToPredict);

        await erc20Token.connect(user2).submitPredval(prediction, stake, soonestEpochToPredict);
        const secondsPerEpoch = await erc20Token.secondsPerEpoch();

        let mockErc20Balance = await mockErc20.balanceOf(user2.address)
        let tx = await erc20Token.connect(user2).payout(soonestEpochToPredict, user2.address)
        let txReceipt = await tx.wait();
        let event = getEventFromTx(txReceipt, 'PredictionPayout')
        //we are not getting anything, round is still in progress
        assert(event == null, "PredictionPayout event found")
        expect(await mockErc20.balanceOf(user2.address)).to.be.eq(mockErc20Balance);

        await fastForward(sPerEpoch * 2)

        mockErc20Balance = await mockErc20.balanceOf(user2.address)
        tx = await erc20Token.connect(user2).payout(soonestEpochToPredict, user2.address)
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'PredictionPayout')
        //we are not getting anything, round is still in progress
        assert(event == null, "PredictionPayout event found")
        expect(await mockErc20.balanceOf(user2.address)).to.be.eq(mockErc20Balance);


        // opf is late
        await fastForward(trueValueSubmitTimeout + sPerEpoch)
        tx = await erc20Token.connect(user2).payout(soonestEpochToPredict, user2.address);
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'Transfer')
        expect(event.args.from).to.be.eq(erc20Token.address);
        expect(event.args.to).to.be.eq(user2.address);
        expect(event.args.value).to.be.eq(stake);
        event = getEventFromTx(txReceipt, 'PredictionPayout')
        assert(event, "PredictionPayout event not found")
        assert(event.args.status == 2, "Status should be 2 = Canceled")
        expect(event.args.payout).to.be.eq(event.args.stake)
        expect(event.args.payout).to.be.eq(stake)
    })

    it("predictoor can redeem stake if OPF cancels the round", async () => {
        const stake = 100;
        await mockErc20.transfer(user2.address, stake);
        await mockErc20.connect(user2).approve(erc20Token.address, stake);
        const prediction = true;
        const soonestEpochToPredict = await erc20Token.soonestEpochToPredict(await blocktimestamp());

        await erc20Token.connect(user2).submitPredval(prediction, stake, soonestEpochToPredict);
        const secondsPerEpoch = await erc20Token.secondsPerEpoch();

        let mockErc20Balance = await mockErc20.balanceOf(user2.address)
        let tx = await erc20Token.connect(user2).payout(soonestEpochToPredict, user2.address)
        let txReceipt = await tx.wait();
        let event = getEventFromTx(txReceipt, 'PredictionPayout')
        //we are not getting anything, round is still in progress
        assert(event == null, "PredictionPayout event found")
        expect(await mockErc20.balanceOf(user2.address)).to.be.eq(mockErc20Balance);

        await fastForward(sPerEpoch * 2)

        mockErc20Balance = await mockErc20.balanceOf(user2.address)
        tx = await erc20Token.connect(user2).payout(soonestEpochToPredict, user2.address)
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'PredictionPayout')
        //we are not getting anything, round is still in progress
        assert(event == null, "PredictionPayout event found")
        expect(await mockErc20.balanceOf(user2.address)).to.be.eq(mockErc20Balance);

        await fastForward(sPerEpoch * 2)
        // opf cancels the round
        tx = await erc20Token.connect(owner).submitTrueVal(soonestEpochToPredict, true, web3.utils.toWei("230.43"), true);
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'TruevalSubmitted')
        assert(event, "TruevalSubmitted event not found")
        assert(event.args.status == 2, 'Status missmatch') // round status should be 2 == Status.Cancel

        tx = await erc20Token.connect(user2).payout(soonestEpochToPredict, user2.address);
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'Transfer')
        expect(event.args.from).to.be.eq(erc20Token.address);
        expect(event.args.to).to.be.eq(user2.address);
        expect(event.args.value).to.be.eq(stake);
        event = getEventFromTx(txReceipt, 'PredictionPayout')
        assert(event, "PredictionPayout event not found")
        assert(event.args.status == 2, "Status should be 2 = Canceled")
        expect(event.args.payout).to.be.eq(event.args.stake)
        expect(event.args.payout).to.be.eq(stake)
    })

    it("all predictoors are slashed, feeCollector gets the stakes", async () => {
        // predictoor makes a predictions
        let predictoors = [reciever, user2, user3, user4, user5, user6];
        let predictions = [];
        let stakes = [];
        let tx, txReceipt, event
        for (const predictoor of predictoors) {
            const amt = web3.utils.toWei("200");
            await mockErc20.transfer(predictoor.address, amt);
            await mockErc20.connect(predictoor).approve(erc20Token.address, amt);
        }

        const secondsPerEpoch = await erc20Token.secondsPerEpoch();
        const currentBlock = await ethers.provider.getBlockNumber();
        const soonestEpochToPredict = await erc20Token.soonestEpochToPredict((await ethers.provider.getBlockNumber()) + 1);
        await fastForward(sPerEpoch * 2)
        const predictionBlock = await erc20Token.soonestEpochToPredict(await blocktimestamp());
        let totalStake = new BigNumber.from(0)
        for (const predictoor of predictoors) {
            const stake = 10 + Math.random() * 100;
            const stakeWei = web3.utils.toWei(stake.toString());
            //all predictoors are predicting False
            const p = false
            predictions.push(p);
            stakes.push(stake);
            totalStake = totalStake.add(stakeWei)
            await erc20Token.connect(predictoor).submitPredval(p, stakeWei, predictionBlock)
        }

        await fastForward(sPerEpoch * 2)
        const truval = true //
        // opf submits truval
        tx = await erc20Token.submitTrueVal(predictionBlock, truval, web3.utils.toWei("230.43"), false);
        txReceipt = await tx.wait();
        event = getEventFromTx(txReceipt, 'Transfer')
        expect(event.args.from).to.be.eq(erc20Token.address);
        expect(event.args.to).to.be.eq(freMarketFeeCollector.address);
        expect(event.args.value).to.be.eq(totalStake);
        // each predictoor calls payout function, they should get nothing
        for (let i = 0; i < predictoors.length; i++) {
            let predictoor = predictoors[i];
            tx = await erc20Token.connect(predictoor).payout(predictionBlock, predictoor.address);
            txReceipt = await tx.wait();
            event = getEventFromTx(txReceipt, 'PredictionPayout')
            assert(event, "PredictionPayout event not found")
            expect(event.args.payout).to.be.eq(0)
        }
    });

    it("owner can withdraw ETH sent to contract by mistake", async () => {
        const balance = await provider.getBalance(owner.address);
        const contractBalance = await provider.getBalance(erc20Token.address)
        tx = {
            to: erc20Token.address,
            value: ethers.utils.parseEther('2', 'ether')
        };
        const transaction = await owner.sendTransaction(tx);
        // reclaim eth
        await erc20Token.connect(user2).withdrawETH()
        const balanceAfter = await provider.getBalance(owner.address);
        const contractBalanceAfter = await provider.getBalance(erc20Token.address)
        assert(balance.eq(balanceAfter), "Owner eth balance missmatch")
        assert(contractBalance.eq(contractBalanceAfter), "Owner eth balance missmatch")
    });
    it("isERC20Deployer works as expected", async () => {
        const isDeployer = await erc20Token.connect(user2).isERC20Deployer(owner.address)
        assert(isDeployer, "isERC20Deployer failed")
    });
    it("getDispensers should be empty", async () => {
        const dispensers = await erc20Token.connect(user2).getDispensers()
        assert(dispensers.length === 0, "getDispenser should be empty")
    });
    it("getters should work as expected", async () => {
        assert((await erc20Token.connect(user2).name()) === "ERC20DT3", 'name() failed')
        assert((await erc20Token.connect(user2).symbol()) === "ERC20DT3Symbol", 'symbol() failed')
        assert((await erc20Token.connect(user2).decimals()) === 18, 'decimals() failed')
        assert((await erc20Token.connect(user2).getERC721Address() === tokenERC721.address, 'getERC721Address() failed'))
    });

});
