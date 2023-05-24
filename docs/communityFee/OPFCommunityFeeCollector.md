# Solidity API

## OPFCommunityFeeCollector

_Ocean Protocol Foundation Community Fee Collector contract
     allows consumers to pay very small fee as part of the exchange of 
     datatokens with ocean token in order to support the community of  
     ocean protocol and provide a sustainble development._

### constructor

```solidity
constructor(address payable newCollector, address OPFOwnerAddress) public
```

_constructor
     Called prior contract deployment. set the controller address and
     the contract owner address_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newCollector | address payable | the fee collector address. |
| OPFOwnerAddress | address | the contract owner address |

### fallback

```solidity
fallback() external payable
```

_fallback function
     this is a default fallback function in which receives
     the collected ether._

### receive

```solidity
receive() external payable
```

_receive function
     this is a default receive function in which receives
     the collected ether._

### withdrawETH

```solidity
function withdrawETH() external payable
```

_withdrawETH
     transfers all the accumlated ether the collector address_

### withdrawToken

```solidity
function withdrawToken(address tokenAddress) external
```

_withdrawToken
     transfers all the accumlated tokens the collector address_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAddress | address | the token contract address |

### changeCollector

```solidity
function changeCollector(address payable newCollector) external
```

_changeCollector
     change the current collector address. Only owner can do that._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newCollector | address payable | the new collector address |

