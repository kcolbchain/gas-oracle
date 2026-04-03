import type { ChainAdapter } from '../types'

/** Optimism (+ Base): L2 cost = L2 execution + L1 data fee via Ecotone formula */
export const optimism: ChainAdapter = {
  name: 'optimism',
  computeL2Cost(blobBaseFee: bigint, l2ExecutionFee: bigint): bigint {
    // Ecotone (post-EIP-4844): L1 fee = baseFeeScalar * l1BaseFee + blobBaseFeeScalar * blobBaseFee
    // Simplified with typical scalars
    const blobBaseFeeScalar = 810949n // typical OP mainnet value
    const typicalTxSize = 200n // compressed bytes
    const l1Component = (blobBaseFeeScalar * blobBaseFee * typicalTxSize) / (16n * 1000000n)
    return l2ExecutionFee + l1Component
  },
}

/** Base uses same Ecotone formula as Optimism */
export const base: ChainAdapter = {
  name: 'base',
  computeL2Cost: optimism.computeL2Cost,
}
