export type ChainName = 'arbitrum' | 'optimism' | 'base' | 'scroll' | 'zksync' | 'polygonzkevm' | 'blast' | 'mantle';

export const VALID_CHAINS: ChainName[] = ['arbitrum', 'optimism', 'base', 'scroll', 'zksync', 'polygonzkevm', 'blast', 'mantle'];

export interface OracleConfig {
  l1Rpc: string;
  l2Rpc: string;
  chain: ChainName;
  windowSize?: number;
}

export interface FeeSnapshot {
  blockNumber: bigint;
  blobBaseFee: bigint;
  l2GasPrice: bigint;
  timestamp: number;
}

export interface Prediction {
  gasPrice: number;
  blobFee: number;
  confidence: number;
  blocksAhead: number;
  chain: ChainName;
}

export interface ChainAdapter {
  name: ChainName;
  computeL2Cost(blobBaseFee: bigint, l2ExecutionFee: bigint): bigint;
}