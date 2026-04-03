import type { FeeSnapshot, Prediction, ChainAdapter, ChainName } from './types'

export class Predictor {
  private alpha: number // EMA smoothing factor

  constructor(alpha = 0.3) {
    this.alpha = alpha
  }

  predict(
    snapshots: FeeSnapshot[],
    blocksAhead: number,
    chain: ChainName,
    adapter: ChainAdapter,
  ): Prediction {
    if (snapshots.length < 3) {
      throw new Error(`Need at least 3 snapshots, got ${snapshots.length}`)
    }

    const blobFees = snapshots.map((s) => Number(s.blobBaseFee))
    const l2Fees = snapshots.map((s) => Number(s.l2GasPrice))

    // EMA-smoothed blob fees
    const smoothedBlob = this.ema(blobFees)
    const smoothedL2 = this.ema(l2Fees)

    // Linear regression on smoothed values for trend
    const blobTrend = this.linearRegression(smoothedBlob)
    const l2Trend = this.linearRegression(smoothedL2)

    // Predict N blocks ahead
    const n = smoothedBlob.length
    const predictedBlobWei = blobTrend.slope * (n + blocksAhead) + blobTrend.intercept
    const predictedL2Wei = l2Trend.slope * (n + blocksAhead) + l2Trend.intercept

    // Confidence based on R² of the regression
    const confidence = Math.max(0, Math.min(1, (blobTrend.r2 + l2Trend.r2) / 2))

    // Convert wei to gwei
    const blobGwei = Math.max(0, predictedBlobWei) / 1e9
    const l2Gwei = Math.max(0, predictedL2Wei) / 1e9

    return {
      gasPrice: Number(l2Gwei.toFixed(6)),
      blobFee: Number(blobGwei.toFixed(6)),
      confidence: Number(confidence.toFixed(3)),
      blocksAhead,
      chain,
    }
  }

  private ema(values: number[]): number[] {
    const result: number[] = [values[0]]
    for (let i = 1; i < values.length; i++) {
      result.push(this.alpha * values[i] + (1 - this.alpha) * result[i - 1])
    }
    return result
  }

  private linearRegression(values: number[]): { slope: number; intercept: number; r2: number } {
    const n = values.length
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0

    for (let i = 0; i < n; i++) {
      sumX += i
      sumY += values[i]
      sumXY += i * values[i]
      sumX2 += i * i
      sumY2 += values[i] * values[i]
    }

    const denom = n * sumX2 - sumX * sumX
    if (denom === 0) return { slope: 0, intercept: values[0], r2: 0 }

    const slope = (n * sumXY - sumX * sumY) / denom
    const intercept = (sumY - slope * sumX) / n

    // R² calculation
    const meanY = sumY / n
    let ssTot = 0, ssRes = 0
    for (let i = 0; i < n; i++) {
      ssTot += (values[i] - meanY) ** 2
      ssRes += (values[i] - (slope * i + intercept)) ** 2
    }
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot

    return { slope, intercept, r2 }
  }
}
