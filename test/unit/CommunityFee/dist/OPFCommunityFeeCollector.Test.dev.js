"use strict";

/* eslint-env mocha */

/* global artifacts, contract, it, before, web3 */
var OPFCommunityFeeCollector = artifacts.require('OPFCommunityFeeCollector');

var Template = artifacts.require('DataTokenTemplate');

var DTFactory = artifacts.require('DTFactory');

var Token = artifacts.require('DataTokenTemplate');

var testUtils = require('../../helpers/utils');

var truffleAssert = require('truffle-assertions');

var BigNumber = require('bn.js');

var _require = require('chai'),
    assert = _require.assert;
/* FLow:
   1. Owner changes the collector to another address
   2. Alice creates datatoken
   3. Alice mints datatokens
   4. Alice transfers datatokens to the CommunityFeeCollector
   5. Bob triggers a withdraw from CommunityFeeCollector
   6. Bob tries to change the collector in CommunityFeeCollector

   */


contract('OPFCommunityFeeCollector', function _callee8(accounts) {
  var cap, factory, template, comfeecollector, tokenAddress, alice, bob, charlie, dave, owner, blob, datatoken, amountOfMintedTokens, amountOfTokens;
  return regeneratorRuntime.async(function _callee8$(_context8) {
    while (1) {
      switch (_context8.prev = _context8.next) {
        case 0:
          amountOfMintedTokens = 10;
          amountOfTokens = 2;
          before('init contracts for each test', function _callee() {
            var trxReceipt, TokenCreatedEventArgs;
            return regeneratorRuntime.async(function _callee$(_context) {
              while (1) {
                switch (_context.prev = _context.next) {
                  case 0:
                    blob = 'https://example.com/dataset-1';
                    owner = accounts[0];
                    alice = accounts[1];
                    bob = accounts[2];
                    charlie = accounts[3];
                    dave = accounts[4];
                    cap = new BigNumber(web3.utils.toWei('1400000000'));
                    _context.next = 9;
                    return regeneratorRuntime.awrap(OPFCommunityFeeCollector["new"](dave, owner));

                  case 9:
                    comfeecollector = _context.sent;
                    _context.next = 12;
                    return regeneratorRuntime.awrap(Template["new"]('Template', 'TEMPLATE', alice, cap, blob, comfeecollector.address));

                  case 12:
                    template = _context.sent;
                    _context.next = 15;
                    return regeneratorRuntime.awrap(DTFactory["new"](template.address, comfeecollector.address));

                  case 15:
                    factory = _context.sent;
                    _context.next = 18;
                    return regeneratorRuntime.awrap(factory.createToken(blob, {
                      from: alice
                    }));

                  case 18:
                    trxReceipt = _context.sent;
                    TokenCreatedEventArgs = testUtils.getEventArgsFromTx(trxReceipt, 'TokenCreated');
                    tokenAddress = TokenCreatedEventArgs.newTokenAddress;
                    _context.next = 23;
                    return regeneratorRuntime.awrap(Token.at(tokenAddress));

                  case 23:
                    datatoken = _context.sent;

                  case 24:
                  case "end":
                    return _context.stop();
                }
              }
            });
          });
          it('Owner should change the collector in CommunityFeeCollector', function _callee2() {
            return regeneratorRuntime.async(function _callee2$(_context2) {
              while (1) {
                switch (_context2.prev = _context2.next) {
                  case 0:
                    _context2.t0 = truffleAssert;
                    _context2.next = 3;
                    return regeneratorRuntime.awrap(comfeecollector.changeCollector(charlie, {
                      from: owner
                    }));

                  case 3:
                    _context2.t1 = _context2.sent;

                    _context2.t0.passes.call(_context2.t0, _context2.t1);

                  case 5:
                  case "end":
                    return _context2.stop();
                }
              }
            });
          });
          it('Alice should mint some datatokens', function _callee3() {
            return regeneratorRuntime.async(function _callee3$(_context3) {
              while (1) {
                switch (_context3.prev = _context3.next) {
                  case 0:
                    _context3.t0 = truffleAssert;
                    _context3.next = 3;
                    return regeneratorRuntime.awrap(datatoken.mint(alice, amountOfMintedTokens, {
                      from: alice
                    }));

                  case 3:
                    _context3.t1 = _context3.sent;

                    _context3.t0.passes.call(_context3.t0, _context3.t1);

                  case 5:
                  case "end":
                    return _context3.stop();
                }
              }
            });
          });
          it('Alice should transfer datatokens to CommunityFeeCollector', function _callee4() {
            var feeContractBalance;
            return regeneratorRuntime.async(function _callee4$(_context4) {
              while (1) {
                switch (_context4.prev = _context4.next) {
                  case 0:
                    _context4.t0 = truffleAssert;
                    _context4.next = 3;
                    return regeneratorRuntime.awrap(datatoken.transfer(comfeecollector.address, amountOfTokens, {
                      from: alice
                    }));

                  case 3:
                    _context4.t1 = _context4.sent;

                    _context4.t0.passes.call(_context4.t0, _context4.t1);

                    _context4.t2 = parseFloat;
                    _context4.t3 = web3.utils;
                    _context4.next = 9;
                    return regeneratorRuntime.awrap(datatoken.balanceOf(comfeecollector.address));

                  case 9:
                    _context4.t4 = _context4.sent;
                    _context4.t5 = _context4.t3.fromWei.call(_context4.t3, _context4.t4);
                    feeContractBalance = (0, _context4.t2)(_context4.t5);
                    assert(feeContractBalance > 0);

                  case 13:
                  case "end":
                    return _context4.stop();
                }
              }
            });
          });
          it('Bob should trigger a withdraw from CommunityFeeCollector', function _callee5() {
            var charlieBalance;
            return regeneratorRuntime.async(function _callee5$(_context5) {
              while (1) {
                switch (_context5.prev = _context5.next) {
                  case 0:
                    _context5.t0 = parseFloat;
                    _context5.t1 = web3.utils;
                    _context5.next = 4;
                    return regeneratorRuntime.awrap(datatoken.balanceOf(charlie));

                  case 4:
                    _context5.t2 = _context5.sent;
                    _context5.t3 = _context5.t1.fromWei.call(_context5.t1, _context5.t2);
                    charlieBalance = (0, _context5.t0)(_context5.t3);
                    assert(charlieBalance === 0);
                    _context5.next = 10;
                    return regeneratorRuntime.awrap(comfeecollector.withdrawToken(tokenAddress, {
                      from: bob
                    }));

                  case 10:
                    _context5.t4 = parseFloat;
                    _context5.next = 13;
                    return regeneratorRuntime.awrap(datatoken.balanceOf(charlie));

                  case 13:
                    _context5.t5 = _context5.sent;
                    charlieBalance = (0, _context5.t4)(_context5.t5);
                    assert(charlieBalance === amountOfTokens);

                  case 16:
                  case "end":
                    return _context5.stop();
                }
              }
            });
          });
          it('Bob should fail to change the collector in CommunityFeeCollector', function _callee6() {
            return regeneratorRuntime.async(function _callee6$(_context6) {
              while (1) {
                switch (_context6.prev = _context6.next) {
                  case 0:
                    _context6.prev = 0;
                    _context6.next = 3;
                    return regeneratorRuntime.awrap(comfeecollector.changeCollector(dave, {
                      from: bob
                    }));

                  case 3:
                    assert(1 === 0);
                    _context6.next = 9;
                    break;

                  case 6:
                    _context6.prev = 6;
                    _context6.t0 = _context6["catch"](0);
                    console.log('Failed as it should');

                  case 9:
                  case "end":
                    return _context6.stop();
                }
              }
            }, null, null, [[0, 6]]);
          });
          it('should allow ETH withdrawal', function _callee7() {
            var EthSender;
            return regeneratorRuntime.async(function _callee7$(_context7) {
              while (1) {
                switch (_context7.prev = _context7.next) {
                  case 0:
                    EthSender = accounts[4];
                    web3.eth.sendTransaction({
                      from: EthSender.coinbase,
                      to: comfeecollector.address,
                      value: web3.utils.toWei('0.05')
                    });
                    _context7.next = 4;
                    return regeneratorRuntime.awrap(comfeecollector.withdrawETH());

                  case 4:
                    console.log(web3.utils.fromWei(web3.eth.getBalance(dave)));

                  case 5:
                  case "end":
                    return _context7.stop();
                }
              }
            });
          });

        case 9:
        case "end":
          return _context8.stop();
      }
    }
  });
});