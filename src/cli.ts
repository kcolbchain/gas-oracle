#!/usr/bin/env node
#!/usr/bin/env node
import { Command } from 'commander'
import { GasOracle } from './oracle'
import { AccuracyTracker } from './tracker' // Import new tracker
import type { ChainName } from './types'

const program = new Command()

program
  .name('gas-oracle')
  .description('Predict L2 gas costs using blob fee market dynamics')
  .version('0.2.0') // Bump version for new feature

const l2RpcDefaults: Record<string, string> = {
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  optimism: 'https://mainnet.optimism.io',
  base: 'https://mainnet.base.org',
  scroll: 'https://rpc.scroll.io',
}

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
    const oracle = new GasOracle({
      l1Rpc: opts.l1Rpc,
      l2Rpc: opts.l2Rpc || l2RpcDefaults[chain] || '',
      chain,
      windowSize: parseInt(opts.window),
    })

    try {
      const prediction = await oracle.predict({ blocksAhead: parseInt(opts.blocks) })
      console.log(`\n  gas-oracle prediction for ${chain}`)
      console.log(`  ─────────────────────────────`)
      console.log(`  L2 gas price:  ${prediction.gasPrice.toFixed(6)} gwei`)
      console.log(`  Blob fee:      ${prediction.blobFee.toFixed(6)} gwei`)
      console.log(`  Confidence:    ${(prediction.confidence * 100).toFixed(1)}%`)
      console.log(`  Blocks ahead:  ${prediction.blocksAhead}\n`)
    } catch (err: any) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
  })

program
  .command('accuracy')
  .description('Compute historical prediction accuracy')
  .requiredOption('--chain <chain>', 'Target chain: arbitrum, optimism, base, scroll')
  .requiredOption('--last <n>', 'Number of historical blocks to evaluate (e.g., 100)')
  .option('--blocks <n>', 'Blocks ahead the prediction was made for (N blocks later)', '10')
  .option('--l1-rpc <url>', 'L1 Ethereum RPC URL', 'https://eth.llamarpc.com')
  .option('--l2-rpc <url>', 'L2 RPC URL')
  .option('--window <n>', 'Historical blocks to analyze for each prediction', '50')
  .action(async (opts) => {
    const chain = opts.chain as ChainName
    const tracker = new AccuracyTracker({
      l1Rpc: opts.l1Rpc,
      l2Rpc: opts.l2Rpc || l2RpcDefaults[chain] || '',
      chain,
      windowSize: parseInt(opts.window),
    })

    try {
      console.log(`\n  Computing accuracy for ${chain} over last ${opts.last} blocks... This may take a moment.`)
      const report = await tracker.computeAccuracy(parseInt(opts.last), parseInt(opts.blocks))

      console.log(`\n  gas-oracle accuracy report for ${chain} (${report.blocksAhead} blocks ahead)`)
      console.log(`  ───────────────────────────────────────────────────────────`)
      console.log(`  Total evaluated predictions: ${report.totalEvaluated}`)
      console.log(`  `)
      console.log(`  L2 Total Gas Price (gwei):`)
      console.log(`    MAE:               ${report.maeGasPrice.toFixed(6)}`)
      console.log(`    MAPE:              ${report.mapeGasPrice.toFixed(2)}%`)
      console.log(`    Within Conf. Band: ${report.withinConfidenceGasPrice.toFixed(2)}%`)
      console.log(`  `)
      console.log(`  L1 Blob Base Fee (gwei):`)
      console.log(`    MAE:               ${report.maeBlobFee.toFixed(6)}`)
      console.log(`    MAPE:              ${report.mapeBlobFee.toFixed(2)}%`)
      console.log(`    Within Conf. Band: ${report.withinConfidenceBlobFee.toFixed(2)}%\n`)

    } catch (err: any) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
  })

program.parse()
