import { createPublicClient, http, type PublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import type { FeeSnapshot, OracleConfig } from './types'

export class FeeFetcher {
  private l1Client: PublicClient
  private l2Client: PublicClient
  private windowSize: number

  constructor(config: OracleConfig) {
    this.l1Client = createPublicClient({ chain: mainnet, transport: http(config.l1Rpc) })
    this.l2Client = createPublicClient({ transport: http(config.l2Rpc) })
    this.windowSize = config.windowSize ?? 50
  }

  async fetchHistory(): Promise<FeeSnapshot[]> {
    const latestBlock = await this.l1Client.getBlockNumber()
    const snapshots: FeeSnapshot[] = []

    // Fetch last N L1 blocks for blob base fee
    const startBlock = latestBlock - BigInt(this.windowSize)
    const blockPromises: Promise<FeeSnapshot | null>[] = []

    for (let i = startBlock; i <= latestBlock; i++) {
      blockPromises.push(this.fetchBlock(i))
    }

    const results = await Promise.allSettled(blockPromises)
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        snapshots.push(r.value)
      }
    }

    return snapshots.sort((a, b) => Number(a.blockNumber - b.blockNumber))
  }

  private async fetchBlock(blockNumber: bigint): Promise<FeeSnapshot | null> {
    try {
      const block = await this.l1Client.getBlock({ blockNumber })
      // EIP-4844: blobGasUsed and excessBlobGas are on the block
      // Blob base fee = e^(excessBlobGas / 3338477) (simplified)
      const excessBlobGas = block.excessBlobGas ?? 0n
      const blobBaseFee = this.computeBlobBaseFee(excessBlobGas)

      // Get current L2 gas price
      const l2GasPrice = await this.l2Client.getGasPrice()

      return {
        blockNumber,
        blobBaseFee,
        l2GasPrice,
        timestamp: Number(block.timestamp),
      }
    } catch {
      return null
    }
  }

  /** EIP-4844 blob base fee calculation: min_base_fee * e^(excess / denominator) */
  private computeBlobBaseFee(excessBlobGas: bigint): bigint {
    const MIN_BLOB_BASE_FEE = 1n
    const BLOB_BASE_FEE_UPDATE_FRACTION = 3338477n

    if (excessBlobGas === 0n) return MIN_BLOB_BASE_FEE

    // Approximate e^(x) using integer math: 1 + x + x^2/2
    const x = (excessBlobGas * 1000000n) / BLOB_BASE_FEE_UPDATE_FRACTION
    const exp = 1000000n + x + (x * x) / 2000000n
    return (MIN_BLOB_BASE_FEE * exp) / 1000000n
  }
}
