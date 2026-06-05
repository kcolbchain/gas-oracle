import type { ChainAdapter } from '../types'

/** Polygon zkEVM: L2 cost = execution fee + L1 pubdata cost (ZK-rollup similar to zkSync) */
export const polygonzkevm: ChainAdapter = {
  name: 'polygonzkevm',
  computeL2Cost(blobBaseFee: bigint, l2ExecutionFee: bigint): bigint {
    const gasPerPubdataByte = 16n
    const typicalPubdataBytes = 256n
    const l1Component = (blobBaseFee * typicalPubdataBytes) / gasPerPubdataByte
    return l2ExecutionFee + l1Component
  },
}
