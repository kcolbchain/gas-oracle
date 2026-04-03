export type ChainName = 'arbitrum' | 'optimism' | 'base' | 'scroll'

export interface OracleConfig {
  l1Rpc: string
  l2Rpc: string
  chain: ChainName
  windowSize?: number // blocks of history to use (default 50)
}

export interface FeeSnapshot {
  blockNumber: bigint
  blobBaseFee: bigint   // wei
  l2GasPrice: bigint    // wei
  timestamp: number
}

export interface Prediction {
  gasPrice: number      // gwei — predicted L2 gas price
  blobFee: number       // gwei — predicted L1 blob base fee
  confidence: number    // 0-1
  blocksAhead: number
  chain: ChainName
}

export interface ChainAdapter {
  name: ChainName
  /** Compute L2 gas price from L1 blob base fee and L2 execution fee */
  computeL2Cost(blobBaseFee: bigint, l2ExecutionFee: bigint): bigint
}
