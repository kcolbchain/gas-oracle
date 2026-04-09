# gas-oracle

Predicts L2 gas costs 5-30 blocks ahead using blob fee market dynamics post-EIP-4844. By [kcolbchain](https://kcolbchain.com) (est. 2015).

## Why this exists

After EIP-4844, L2 transaction costs are driven by the L1 blob base fee — a volatile, auction-based market that's hard to predict. Wallets and DeFi protocols that estimate gas using the current fee consistently over- or under-pay. This tool predicts where blob fees (and therefore L2 costs) are heading.

## Supported chains

- Arbitrum One
- Optimism
- Base
- Scroll
- zkSync Era

## Quick start

```bash
npm install
npm run build
npx gas-oracle predict --chain arbitrum --blocks 10
```

## How it works

1. Fetches recent L1 blob base fees and L2 gas prices via RPC
2. Applies exponential moving average (EMA) smoothing
3. Runs linear regression over the fee window
4. Returns predicted gas cost with confidence interval

## As a library

```typescript
import { GasOracle } from '@kcolbchain/gas-oracle'

const oracle = new GasOracle({
  l1Rpc: 'https://eth.llamarpc.com',
  chain: 'arbitrum',
  l2Rpc: 'https://arb1.arbitrum.io/rpc',
})

const prediction = await oracle.predict({ blocksAhead: 10 })
console.log(prediction)
// { gasPrice: 0.012, blobFee: 25.3, confidence: 0.87, blocksAhead: 10 }
```

## Architecture

```
L1 RPC (blob base fee history)
    ↓
Fetcher → collects last N blocks of blob fees + L2 gas prices
    ↓
Predictor → EMA smoothing + linear regression + confidence interval
    ↓
Chain adapter → applies chain-specific L2 fee formula
    ↓
Prediction { gasPrice, blobFee, confidence, blocksAhead }
```

## License

MIT

## Contributing

Issues and PRs welcome. See the [kcolbchain contributing guide](https://github.com/kcolbchain).
