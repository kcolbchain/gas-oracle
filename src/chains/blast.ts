import type { ChainAdapter } from '../types'

/** Blast: OP Stack rollup — Ecotone fee formula (same as Optimism) */
export const blast: ChainAdapter = {
  name: 'blast',
  computeL2Cost(blobBaseFee: bigint, l2ExecutionFee: bigint): bigint {
    const blobBaseFeeScalar = 810949n
    const typicalTxSize = 200n
    const l1Component = (blobBaseFeeScalar * blobBaseFee * typicalTxSize) / (16n * 1000000n)
    return l2ExecutionFee + l1Component
  },
}
