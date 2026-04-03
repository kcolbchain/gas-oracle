import type { ChainAdapter } from '../types'

/** Arbitrum: L2 cost = L2 execution fee + L1 data fee (blob-based post-ArbOS 20) */
export const arbitrum: ChainAdapter = {
  name: 'arbitrum',
  computeL2Cost(blobBaseFee: bigint, l2ExecutionFee: bigint): bigint {
    // Arbitrum charges L1 data posting cost as a surcharge on L2 gas
    // Simplified: total ≈ l2ExecutionFee + (blobBaseFee * dataUnits / 16)
    // Using 1600 bytes as typical tx calldata
    const typicalDataUnits = 1600n
    const l1Component = (blobBaseFee * typicalDataUnits) / 16n
    return l2ExecutionFee + l1Component
  },
}
