/* eslint-env mocha */
/* global artifacts, contract, web3, it, beforeEach */
const hre = require("hardhat");
const { assert, expect } = require("chai");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

const { impersonate } = require("../helpers/impersonate");
const constants = require("../helpers/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { keccak256 } = require("@ethersproject/keccak256");
const ethers = hre.ethers;

describe("FixedRateExchange", () => {
  let cap,
    factory,
    template,
    tokenAddress,
    alice,
    exchangeOwner,
    bob,
    blob,
    basetoken,
    datatoken,
    fixedRateExchange,
    rate,
    ExchangeCreatedEventArgs,
    approvedDataTokens,
    approvedBaseTokens,
    mockToken,
    eventsExchange1,
    eventsExchange2;

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";

  before("init contracts for each test", async () => {
    const ERC721Template = await ethers.getContractFactory("ERC721Template");
    const ERC20Template = await ethers.getContractFactory("ERC20Template");
    const ERC721Factory = await ethers.getContractFactory("ERC721Factory");
    const ERC20Factory = await ethers.getContractFactory("ERC20Factory");

    const Metadata = await ethers.getContractFactory("Metadata");
    const MockERC20 = await ethers.getContractFactory("MockERC20Decimals");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );

    [alice, bob, charles] = await ethers.getSigners();

    exchangeOwner = alice;

    rate = web3.utils.toWei("1");

    fixedRateExchange = await FixedRateExchange.deploy();

    mockDT18 = await MockERC20.deploy("MockDT18", "DT18", 18);
    mockDT6 = await MockERC20.deploy("MockDT6", "DT6", 6);
    mockBase18 = await MockERC20.connect(bob).deploy(
      "MockBase18",
      "Mock18",
      18
    );
    mockBase6 = await MockERC20.connect(bob).deploy("MockBase6", "Mock6", 6);

    receipt = await (
      await fixedRateExchange.create(mockBase6.address, mockDT18.address, rate)
    ).wait(); // from exchangeOwner (alice)

    eventsExchange1 = receipt.events.filter(
      (e) => e.event === "ExchangeCreated"
    );
    //  console.log(events[0].args)

    assert(eventsExchange1[0].args.baseToken == mockBase6.address);
    assert(eventsExchange1[0].args.dataToken == mockDT18.address);

    receipt = await (
      await fixedRateExchange.create(mockBase18.address, mockDT6.address, rate)
    ).wait(); // from exchangeOwner (alice)

    eventsExchange2 = receipt.events.filter(
      (e) => e.event === "ExchangeCreated"
    );
    //  console.log(events[0].args)

    assert(eventsExchange2[0].args.baseToken == mockBase18.address);
    assert(eventsExchange2[0].args.dataToken == mockDT6.address);
  });

  it("#1 - exchange is active", async () => {
    const isActive = await fixedRateExchange.isActive(
      eventsExchange1[0].args.exchangeId
    );
    assert(isActive === true, "Exchange was not activated correctly!");
  });

  it("#2 - should check that the exchange has no supply yet", async () => {
    const exchangeDetails = await fixedRateExchange.getExchange(
      eventsExchange1[0].args.exchangeId
    );
    const supply = web3.utils.fromWei(exchangeDetails.supply.toString());
    assert(supply === "0", "Exchange has supply !=0");
  });

  it("#3 - alice and bob approve contracts to spend tokens", async () => {
    await mockDT18.approve(
      fixedRateExchange.address,
      web3.utils.toWei("10000")
    );
    await mockBase6
      .connect(bob)
      .approve(fixedRateExchange.address, web3.utils.toWei("10000"));
  });
  it("#4 - should check that the exchange has supply", async () => {
    const exchangeDetails = await fixedRateExchange.getExchange(
      eventsExchange1[0].args.exchangeId
    );
    const supply = web3.utils.fromWei(exchangeDetails.supply.toString());
    assert(supply !== "0", "Exchange has supply no supply");
  });
  it("#5 - should get the exchange rate", async () => {
    assert(
      web3.utils.toWei(
        web3.utils.fromWei(
          (
            await fixedRateExchange.getRate(eventsExchange1[0].args.exchangeId)
          ).toString()
        )
      ) === rate
    );
  });

  it("Bob should buy DataTokens using the fixed rate exchange contract", async () => {
    console.log((await mockDT18.balanceOf(bob.address)).toString());
    const receipt = await (
      await fixedRateExchange
        .connect(bob)
        .swap(eventsExchange1[0].args.exchangeId, web3.utils.toWei("100"))
    ).wait();

    // console.log(receipt)
    const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
    const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
    const btAliceAfterSwap = await mockBase6.balanceOf(alice.address);
    console.log(btAliceAfterSwap.toString());
    console.log(ethers.utils.formatEther(dtBobBalanceAfterSwap));
  });

  it("#1 - alice and bob approve contracts to spend tokens", async () => {
    await mockDT6.approve(
      fixedRateExchange.address,
      web3.utils.toWei("10000")
    );
    await mockBase18
      .connect(bob)
      .approve(fixedRateExchange.address, web3.utils.toWei("10000"));
  });

  it("#2 - should check that the exchange has supply", async () => {
    const exchangeDetails = await fixedRateExchange.getExchange(
      eventsExchange2[0].args.exchangeId
    );
    const supply = web3.utils.fromWei(exchangeDetails.supply.toString());
    assert(supply !== "0", "Exchange has supply no supply");
  });

  it("Bob should buy DataTokens using the fixed rate exchange contract", async () => {
    console.log((await mockDT6.balanceOf(bob.address)).toString());
    const receipt = await (
      await fixedRateExchange
        .connect(bob)
        .swap(eventsExchange2[0].args.exchangeId, 1000000) // dt has 6 decimals so we are asking for 1 dt
    ).wait();

    // console.log(receipt)
    const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
    const dtBobBalanceAfterSwap = await mockDT6.balanceOf(bob.address);
    const btAliceAfterSwap = await mockBase18.balanceOf(alice.address);
    console.log(dtBobBalanceAfterSwap.toString()); // bob gets 1 dtToken (6 decimals)
    //console.log(btAliceAfterSwap.toString())
    console.log(ethers.utils.formatEther(btAliceAfterSwap)); //alice gets 1 baseToken (18 decimals)
    assert(dtBobBalanceAfterSwap/1000000 == ethers.utils.formatEther(btAliceAfterSwap))
  });

});
