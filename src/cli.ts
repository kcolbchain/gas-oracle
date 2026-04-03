#!/usr/bin/env node
import { Command } from 'commander'
import { GasOracle } from './oracle'
import type { ChainName } from './types'

const program = new Command()

program
  .name('gas-oracle')
  .description('Predict L2 gas costs using blob fee market dynamics')
  .version('0.1.0')

program
  .command('predict')
  .description('Predict gas costs N blocks ahead')
  .requiredOption('--chain <chain>', 'Target chain: arbitrum, optimism, base, scroll')
  .option('--blocks <n>', 'Blocks ahead to predict', '10')
  .option('--l1-rpc <url>', 'L1 Ethereum RPC URL', 'https://eth.llamarpc.com')
  .option('--l2-rpc <url>', 'L2 RPC URL')
  .option('--window <n>', 'Historical blocks to analyze', '50')
  .action(async (opts) => {
    const chain = opts.chain as ChainName
    const l2Defaults: Record<string, string> = {
      arbitrum: 'https://arb1.arbitrum.io/rpc',
      optimism: 'https://mainnet.optimism.io',
      base: 'https://mainnet.base.org',
      scroll: 'https://rpc.scroll.io',
    }

    const oracle = new GasOracle({
      l1Rpc: opts.l1Rpc,
      l2Rpc: opts.l2Rpc || l2Defaults[chain] || '',
      chain,
      windowSize: parseInt(opts.window),
    })

    try {
      const prediction = await oracle.predict({ blocksAhead: parseInt(opts.blocks) })
      console.log(`\n  gas-oracle prediction for ${chain}`)
      console.log(`  ─────────────────────────────`)
      console.log(`  L2 gas price:  ${prediction.gasPrice} gwei`)
      console.log(`  Blob fee:      ${prediction.blobFee} gwei`)
      console.log(`  Confidence:    ${(prediction.confidence * 100).toFixed(1)}%`)
      console.log(`  Blocks ahead:  ${prediction.blocksAhead}\n`)
    } catch (err: any) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
  })

program.parse()
