import { FeeFetcher } from './fetcher'
import { Predictor } from './predictor'
import { arbitrum } from './chains/arbitrum'
import { optimism, base } from './chains/optimism'
import { scroll } from './chains/scroll'
import { zksync } from './chains/zksync'
import type { OracleConfig, Prediction, ChainAdapter, ChainName } from './types'

const adapters: Record<ChainName, ChainAdapter> = { arbitrum, optimism, base, scroll, zksync }

export class GasOracle {
  private fetcher: FeeFetcher
  private predictor: Predictor
  private adapter: ChainAdapter
  private chain: ChainName

  constructor(config: OracleConfig) {
    this.fetcher = new FeeFetcher(config)
    this.predictor = new Predictor()
    this.chain = config.chain
    this.adapter = adapters[config.chain]
    if (!this.adapter) throw new Error(`Unsupported chain: ${config.chain}`)
  }

  async predict(opts: { blocksAhead?: number } = {}): Promise<Prediction> {
    const blocksAhead = opts.blocksAhead ?? 10
    const snapshots = await this.fetcher.fetchHistory()
    return this.predictor.predict(snapshots, blocksAhead, this.chain, this.adapter)
  }
}
