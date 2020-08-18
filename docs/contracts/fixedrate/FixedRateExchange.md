## `FixedRateExchange`



FixedRateExchange is a fixed rate exchange Contract

### `onlyActiveExchange(bytes32 exchangeId)`





### `onlyExchangeOwner(bytes32 exchangeId)`






### `create(address baseToken, address dataToken, uint256 fixedRate)` (external)





### `generateExchangeId(address baseToken, address dataToken, address exchangeOwner) → bytes32` (public)





### `swap(bytes32 exchangeId, uint256 dataTokenAmount)` (external)





### `getNumberOfExchanges() → uint256` (external)





### `setRate(bytes32 exchangeId, uint256 newRate)` (external)





### `activate(bytes32 exchangeId)` (external)





### `deactivate(bytes32 exchangeId)` (external)





### `getRate(bytes32 exchangeId) → uint256` (external)





### `getExchange(bytes32 exchangeId) → address exchangeOwner, address dataToken, address baseToken, uint256 fixedRate, bool active` (external)





### `getExchanges() → bytes32[]` (external)





### `isActive(bytes32 exchangeId) → bool` (external)






### `ExchangeCreated(bytes32 exchangeId, address baseToken, address dataToken, address exchangeOwner, uint256 fixedRate)`





### `ExchangeRateChanged(bytes32 exchangeId, address exchangeOwner, uint256 newRate)`





### `ExchangeActivated(bytes32 exchangeId, address exchangeOwner, uint256 timestamp)`





### `ExchangeDeactivated(bytes32 exchangeId, address exchangeOwner, uint256 timestamp)`





### `Swapped(bytes32 exchangeId, address by, uint256 baseTokenSwappedAmount, uint256 dataTokenSwappedAmount)`





