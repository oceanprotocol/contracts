## `OPFCommunityFeeCollector`



Ocean Protocol Foundation Community Fee Collector contract
allows consumers to pay very small fee as part of the exchange of 
data tokens with ocean token in order to support the community of  
ocean protocol and provide a sustainble development.


### `constructor(address payable newCollector, address OPFOwnerAddress)` (public)



constructor
Called prior contract deployment. set the controller address and
the contract owner address


### `fallback()` (external)



fallback function
this is a default fallback function in which receives
the collected ether.

### `withdrawETH()` (external)



withdrawETH
transfers all the accumlated ether the collector address

### `withdrawToken(address tokenAddress)` (external)



withdrawToken
transfers all the accumlated tokens the collector address


### `changeCollector(address payable newCollector)` (external)



changeCollector
change the current collector address. Only owner can do that.



