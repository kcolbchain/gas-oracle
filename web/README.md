# gas-oracle web dashboard

A zero-build, single-file static dashboard that shows live L2 gas prices and
the L1 blob-base-fee driver for Arbitrum, Optimism, Base, and Scroll.

## Run locally

```bash
python3 -m http.server -d web 8080
# then open http://localhost:8080
```

No build step, no bundler — just `index.html` and the inline `<script>` block
calling public RPC endpoints directly.

## Custom RPC endpoints

Public RPCs are rate-limited. Override per chain or for the L1 blob-fee source
via query string:

```
index.html?l1rpc=https://your-eth-rpc&rpc_arbitrum=https://your-arb-rpc
```

Accepted keys: `l1rpc`, `rpc` (applied to every chain), or
`rpc_{arbitrum,optimism,base,scroll}`.

## Deploy

The `web/` directory is a static site and deploys unchanged to GitHub Pages,
Cloudflare Pages, or any static host. It intentionally has no build
dependencies so a contributor can edit `index.html` and see the result
immediately.

## What it shows

- **L1 bar** — latest mainnet block, base fee, blob base fee (derived from
  `excessBlobGas` per EIP-4844's `fake_exponential`), and raw excess blob gas.
- **Per-chain card** — live `eth_gasPrice`, predicted gas 10 blocks ahead
  (exponential smoothing, α = 0.3, window = 50 samples), 3-vs-3 trend %, and
  a rolling sparkline.

This is a lightweight preview of the full
[gas-oracle](https://github.com/kcolbchain/gas-oracle) library, which layers
linear regression on top of EMA and returns a confidence interval.
