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
  let alice, // DT Owner and exchange Owner
    exchangeOwner,
    bob, // BaseToken Holder
    fixedRateExchange,
    rate,
    MockERC20,
    eventsExchange;

  const communityFeeCollector = "0xeE9300b7961e0a01d9f0adb863C7A227A07AaD75";

  before("init contracts for each test", async () => {
    MockERC20 = await ethers.getContractFactory("MockERC20Decimals");
    const FixedRateExchange = await ethers.getContractFactory(
      "FixedRateExchange"
    );

    [alice, bob] = await ethers.getSigners();

    exchangeOwner = alice;

    rate = web3.utils.toWei("1");

    fixedRateExchange = await FixedRateExchange.deploy();
  });
  describe("Exchange with baseToken 6 Decimals and dataToken 18 Decimals", async () => {
    it("#1 - mock tokens", async () => {
      mockDT18 = await MockERC20.deploy("MockDT18", "DT18", 18);

      mockBase6 = await MockERC20.connect(bob).deploy("MockBase6", "Mock6", 6);
    });

    it("#2 - create exchange", async () => {
      receipt = await (
        await fixedRateExchange.createWithDecimals(
          mockBase6.address,
          mockDT18.address,
          await mockBase6.decimals(),
          await mockDT18.decimals(),
          rate
        )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter(
        (e) => e.event === "ExchangeCreated"
      );
      //  console.log(events[0].args)

      assert(eventsExchange[0].args.baseToken == mockBase6.address);
      assert(eventsExchange[0].args.dataToken == mockDT18.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      const supply = web3.utils.fromWei(exchangeDetails.supply.toString());
      assert(supply === "0", "Exchange has supply !=0");
    });

    it("#5 - alice and bob approve contracts to spend tokens", async () => {
      await mockDT18.approve(
        fixedRateExchange.address,
        web3.utils.toWei("10000")
      );
      await mockBase6
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("10000"));
    });
    it("#6 - should check that the exchange has supply ", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      const supply = web3.utils.fromWei(exchangeDetails.supply.toString());
      assert(supply !== "0", "Exchange has supply no supply");
    });
    it("#7 - should get the exchange rate", async () => {
      assert(
        web3.utils.toWei(
          web3.utils.fromWei(
            (
              await fixedRateExchange.getRate(eventsExchange[0].args.exchangeId)
            ).toString()
          )
        ) === rate
      );
    });

    it("#8 - Bob should buy DataTokens using the fixed rate exchange contract", async () => {
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .swap(eventsExchange[0].args.exchangeId, web3.utils.toWei("100"))
      ).wait();

      // console.log(receipt)
      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      // we check that proper amount is being swapped (rate=1)
      assert(
        SwappedEvent[0].args.baseTokenSwappedAmount * 1e12 ==
          SwappedEvent[0].args.dataTokenSwappedAmount
      );

      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);
      const btAliceAfterSwap = await mockBase6.balanceOf(alice.address);

      // We check that both users have received the correct amount (rate = 1)
      assert(
        btAliceAfterSwap / 1000000 ==
          ethers.utils.formatEther(dtBobBalanceAfterSwap)
      );
    });
  });

  describe("Exchange with baseToken 18Decimals and dataToken 6Decimals", async () => {
    it("#1 - mock tokens", async () => {
      mockDT6 = await MockERC20.deploy("MockDT6", "DT6", 6);

      mockBase18 = await MockERC20.connect(bob).deploy(
        "MockBase18",
        "Mock18",
        18
      );
    });

    it("#2 - create exchange", async () => {
      receipt = await (
        await fixedRateExchange.createWithDecimals(
          mockBase18.address,
          mockDT6.address,
          await mockBase18.decimals(),
          await mockDT6.decimals(),
          rate
        )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter(
        (e) => e.event === "ExchangeCreated"
      );
      //  console.log(events[0].args)

      assert(eventsExchange[0].args.baseToken == mockBase18.address);
      assert(eventsExchange[0].args.dataToken == mockDT6.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      const supply = web3.utils.fromWei(exchangeDetails.supply.toString());
      assert(supply === "0", "Exchange has supply !=0");
    });

    it("#5 - alice and bob approve contracts to spend tokens", async () => {
      await mockDT6.approve(
        fixedRateExchange.address,
        web3.utils.toWei("10000")
      );
      await mockBase18
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("10000"));
    });

    it("#6 - should check that the exchange has supply", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      const supply = web3.utils.fromWei(exchangeDetails.supply.toString());
      assert(supply !== "0", "Exchange has supply no supply");
    });

    it("#7 - should get the exchange rate", async () => {
      assert(
        web3.utils.toWei(
          web3.utils.fromWei(
            (
              await fixedRateExchange.getRate(eventsExchange[0].args.exchangeId)
            ).toString()
          )
        ) === rate
      );
    });

    it("#8 - Bob should buy DataTokens using the fixed rate exchange contract", async () => {
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .swap(eventsExchange[0].args.exchangeId, 1000000)
      ) // dt has 6 decimals so we are asking for 1 dt
        .wait();

      // console.log(receipt)
      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      assert(
        SwappedEvent[0].args.baseTokenSwappedAmount ==
          SwappedEvent[0].args.dataTokenSwappedAmount * 1e12
      );

      const dtBobBalanceAfterSwap = await mockDT6.balanceOf(bob.address);
      const btAliceAfterSwap = await mockBase18.balanceOf(alice.address);

      assert(
        dtBobBalanceAfterSwap / 1000000 ==
          ethers.utils.formatEther(btAliceAfterSwap)
      );
    });
  });

  describe("Exchange with baseToken 6 Decimals and dataToken 6 Decimals", async () => {
    it("#1 - mock tokens", async () => {
      mockDT6 = await MockERC20.deploy("MockDT6", "DT6", 6);

      mockBase6 = await MockERC20.connect(bob).deploy("MockBase6", "Mock6", 6);
    });

    it("#2 - create exchange", async () => {
      receipt = await (
        await fixedRateExchange.createWithDecimals(
          mockBase6.address,
          mockDT6.address,
          mockBase6.decimals(),
          mockDT6.decimals(),
          rate
        )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter(
        (e) => e.event === "ExchangeCreated"
      );
      //  console.log(events[0].args)

      assert(eventsExchange[0].args.baseToken == mockBase6.address);
      assert(eventsExchange[0].args.dataToken == mockDT6.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      const supply = web3.utils.fromWei(exchangeDetails.supply.toString());

      assert(supply === "0", "Exchange has supply !=0");
    });

    it("#5 - alice and bob approve contracts to spend tokens", async () => {
      await mockDT6.approve(
        fixedRateExchange.address,
        web3.utils.toWei("10000")
      );
      await mockBase6
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("10000"));
    });
    it("#6 - should check that the exchange has supply", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      const supply = web3.utils.fromWei(exchangeDetails.supply.toString());
      assert(supply !== "0", "Exchange has supply no supply");
    });
    it("#7 - should get the exchange rate", async () => {
      assert(
        web3.utils.toWei(
          web3.utils.fromWei(
            (
              await fixedRateExchange.getRate(eventsExchange[0].args.exchangeId)
            ).toString()
          )
        ) === rate
      );
    });

    it("#8 - Bob should buy DataTokens using the fixed rate exchange contract", async () => {
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .swap(eventsExchange[0].args.exchangeId, 1000000)
      ).wait();

      // console.log(receipt)
      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      assert(
        SwappedEvent[0].args.baseTokenSwappedAmount.toString() ==
          SwappedEvent[0].args.dataTokenSwappedAmount.toString()
      );
      const dtBobBalanceAfterSwap = await mockDT6.balanceOf(bob.address);
      const btAliceAfterSwap = await mockBase6.balanceOf(alice.address);

      assert(dtBobBalanceAfterSwap.toString() == btAliceAfterSwap.toString());
    });
  });

  describe("Exchange with baseToken 18Decimals and dataToken 18Decimals using createWithDecimals", async () => {
    it("#1 - mock tokens", async () => {
      mockDT18 = await MockERC20.deploy("MockDT6", "DT18", 18);

      mockBase18 = await MockERC20.connect(bob).deploy(
        "MockBase6",
        "Mock6",
        18
      );
    });

    it("#2 - create exchange", async () => {
      receipt = await (
        await fixedRateExchange.createWithDecimals(
          mockBase18.address,
          mockDT18.address,
          await mockBase18.decimals(),
          await mockDT18.decimals(),
          rate
        )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter(
        (e) => e.event === "ExchangeCreated"
      );
      //  console.log(events[0].args)

      assert(eventsExchange[0].args.baseToken == mockBase18.address);
      assert(eventsExchange[0].args.dataToken == mockDT18.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      const supply = web3.utils.fromWei(exchangeDetails.supply.toString());
      assert(supply === "0", "Exchange has supply !=0");
    });

    it("#5 - alice and bob approve contracts to spend tokens", async () => {
      await mockDT18.approve(
        fixedRateExchange.address,
        web3.utils.toWei("10000")
      );
      await mockBase18
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("10000"));
    });

    it("#6 - should check that the exchange has supply", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      const supply = web3.utils.fromWei(exchangeDetails.supply.toString());
      assert(supply !== "0", "Exchange has supply no supply");
    });

    it("#7 - should get the exchange rate", async () => {
      assert(
        web3.utils.toWei(
          web3.utils.fromWei(
            (
              await fixedRateExchange.getRate(eventsExchange[0].args.exchangeId)
            ).toString()
          )
        ) === rate
      );
    });

    it("#8 - Bob should buy DataTokens using the fixed rate exchange contract", async () => {
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .swap(eventsExchange[0].args.exchangeId, web3.utils.toWei("10"))
      ).wait();

      // console.log(receipt)
      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");
      assert(
        SwappedEvent[0].args.baseTokenSwappedAmount.toString() ==
          SwappedEvent[0].args.dataTokenSwappedAmount.toString()
      );
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);

      const btAliceAfterSwap = await mockBase18.balanceOf(alice.address);

      assert(dtBobBalanceAfterSwap.toString() == btAliceAfterSwap.toString());
    });
  });

  describe("Exchange with baseToken 18Decimals and dataToken 18Decimals using create", async () => {
    it("#1 - mock tokens", async () => {
      mockDT18 = await MockERC20.deploy("MockDT18", "DT18", 18);

      mockBase18 = await MockERC20.connect(bob).deploy(
        "MockBase18",
        "Mock18",
        18
      );
    });

    it("#2 - create exchange", async () => {
      receipt = await (
        await fixedRateExchange.create(
          mockBase18.address,
          mockDT18.address,
          rate
        )
      ).wait(); // from exchangeOwner (alice)

      eventsExchange = receipt.events.filter(
        (e) => e.event === "ExchangeCreated"
      );
      //  console.log(events[0].args)

      assert(eventsExchange[0].args.baseToken == mockBase18.address);
      assert(eventsExchange[0].args.dataToken == mockDT18.address);
    });

    it("#3 - exchange is active", async () => {
      const isActive = await fixedRateExchange.isActive(
        eventsExchange[0].args.exchangeId
      );
      assert(isActive === true, "Exchange was not activated correctly!");
    });

    it("#4 - should check that the exchange has no supply yet", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      const supply = web3.utils.fromWei(exchangeDetails.supply.toString());
      assert(supply === "0", "Exchange has supply !=0");
    });

    it("#5 - alice and bob approve contracts to spend tokens", async () => {
      await mockDT18.approve(
        fixedRateExchange.address,
        web3.utils.toWei("10000")
      );
      await mockBase18
        .connect(bob)
        .approve(fixedRateExchange.address, web3.utils.toWei("10000"));
    });

    it("#6 - should check that the exchange has supply", async () => {
      const exchangeDetails = await fixedRateExchange.getExchange(
        eventsExchange[0].args.exchangeId
      );
      const supply = web3.utils.fromWei(exchangeDetails.supply.toString());
      assert(supply !== "0", "Exchange has supply no supply");
    });

    it("#7 - should get the exchange rate", async () => {
      assert(
        web3.utils.toWei(
          web3.utils.fromWei(
            (
              await fixedRateExchange.getRate(eventsExchange[0].args.exchangeId)
            ).toString()
          )
        ) === rate
      );
    });

    it("#8 - Bob should buy DataTokens using the fixed rate exchange contract", async () => {
      const receipt = await (
        await fixedRateExchange
          .connect(bob)
          .swap(eventsExchange[0].args.exchangeId, web3.utils.toWei("10"))
      ).wait();

      // console.log(receipt)
      const SwappedEvent = receipt.events.filter((e) => e.event === "Swapped");

      assert(
        SwappedEvent[0].args.baseTokenSwappedAmount.toString() ==
          SwappedEvent[0].args.dataTokenSwappedAmount.toString()
      );
      const dtBobBalanceAfterSwap = await mockDT18.balanceOf(bob.address);

      const btAliceAfterSwap = await mockBase18.balanceOf(alice.address);

      assert(dtBobBalanceAfterSwap.toString() == btAliceAfterSwap.toString());
    });
  });
});
