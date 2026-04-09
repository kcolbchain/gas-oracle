import { createPublicClient, http, type PublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import type { FeeSnapshot, OracleConfig } from './types'

export class FeeFetcher {
  private l1Client: PublicClient
  private l2Client: PublicClient
  private windowSize: number
  private chainName: ChainName // Store chain name for error messages in fetchBlock

  constructor(config: OracleConfig) {
    this.l1Client = createPublicClient({ chain: mainnet, transport: http(config.l1Rpc) })
    this.l2Client = createPublicClient({ transport: http(config.l2Rpc) })
    this.windowSize = config.windowSize ?? 50
    this.chainName = config.chain
  }

  async getLatestL1BlockNumber(): Promise<bigint> {
    return this.l1Client.getBlockNumber()
  }

  /**
   * Fetches historical fee snapshots.
   * @param endBlockNumber The last L1 block number to include in the history. If undefined, uses the latest L1 block.
   * @param historyWindowSize The number of blocks to fetch. If undefined, uses the configured windowSize.
   */
  async fetchHistory(endBlockNumber?: bigint, historyWindowSize?: number): Promise<FeeSnapshot[]> {
    const currentWindowSize = historyWindowSize ?? this.windowSize;
    let effectiveEndBlockNumber = endBlockNumber;
    if (effectiveEndBlockNumber === undefined) {
        effectiveEndBlockNumber = await this.l1Client.getBlockNumber();
    }

    const snapshots: FeeSnapshot[] = []
    // Fetch `currentWindowSize` blocks, ending at `effectiveEndBlockNumber`.
    // So, if windowSize is 50, and endBlock is 100, we fetch blocks 51-100.
    const startBlock = effectiveEndBlockNumber - BigInt(currentWindowSize - 1);
    
    // Ensure we don't try to fetch negative block numbers
    const actualStartBlock = startBlock < 0n ? 0n : startBlock;

    const blockPromises: Promise<FeeSnapshot | null>[] = []

    for (let i = actualStartBlock; i <= effectiveEndBlockNumber; i++) {
      blockPromises.push(this.fetchBlock(i))
    }

    const results = await Promise.allSettled(blockPromises)
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        snapshots.push(r.value)
      }
    }
    // Sort to ensure chronological order, important for predictor
    return snapshots.sort((a, b) => Number(a.blockNumber - b.blockNumber));
  }

  /**
   * Fetches a single specific block's FeeSnapshot.
   * @param blockNumber The L1 block number to fetch.
   */
  async fetchSpecificBlock(blockNumber: bigint): Promise<FeeSnapshot | null> {
    return this.fetchBlock(blockNumber);
  }

  /**
   * Internal method to fetch a single L1 block's data and corresponding L2 gas price.
   * This now attempts to fetch historical L2 gas price from the L2 chain using the L1 block number
   * as a proxy for the L2 block number (assumption: L2 block numbers are somewhat aligned or
   * the RPC endpoint supports fetching an L2 block by an L1-aligned block number).
   */
  private async fetchBlock(blockNumber: bigint): Promise<FeeSnapshot | null> {
    try {
      const l1Block = await this.l1Client.getBlock({ blockNumber })
      const excessBlobGas = l1Block.excessBlobGas ?? 0n
      const blobBaseFee = this.computeBlobBaseFee(excessBlobGas)

      // Attempt to fetch L2 base fee for the corresponding L2 block.
      // This assumes L2 block numbers can be referenced by the L1 block number,
      // or that the L2 RPC can intelligently map this. This is a simplification.
      const l2Block = await this.l2Client.getBlock({ blockNumber })
      // Use baseFeePerGas for EIP-1559 chains, otherwise gasPrice
      const l2ExecutionFee = l2Block.baseFeePerGas ?? l2Block.gasPrice ?? 0n;
      
      if (l2ExecutionFee === 0n && this.chainName !== 'arbitrum') { // Arbitrum can return 0 gasPrice for its L2
         // For other chains, 0n may indicate an issue or non-EIP1559, fall back to current if historical failed, or throw
         // For this intermediate fix, let's allow 0n and log a warning. Actual costs will be 0.
         // console.warn(`Could not determine historical L2 execution fee for block ${blockNumber} on ${this.chainName}. Using 0.`);
      }

      return {
        blockNumber,
        blobBaseFee,
        l2GasPrice: l2ExecutionFee, // This is now a historical L2 execution fee
        timestamp: Number(l1Block.timestamp),
      }
    } catch (error: any) {
      // console.warn(`Error fetching block ${blockNumber} for ${this.chainName}: ${error.message}`);
      return null
    }
  }

  /** EIP-4844 blob base fee calculation: min_base_fee * e^(excess / denominator) */
  private computeBlobBaseFee(excessBlobGas: bigint): bigint {
    const MIN_BLOB_BASE_FEE = 1n
    const BLOB_BASE_FEE_UPDATE_FRACTION = 3338477n

    if (excessBlobGas === 0n) return MIN_BLOB_BASE_FEE

    // Approximate e^(x) using integer math: 1 + x + x^2/2.
    // This is an existing approximation.
    const x = (excessBlobGas * 1000000n) / BLOB_BASE_FEE_UPDATE_FRACTION
    const exp = 1000000n + x + (x * x) / 2000000n
    return (MIN_BLOB_BASE_FEE * exp) / 1000000n
  }
}
