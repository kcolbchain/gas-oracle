import { FeeFetcher } from './fetcher';
import { Predictor } from './predictor';
import { arbitrum } from './chains/arbitrum';
import { optimism, base } from './chains/optimism';
import { scroll } from './chains/scroll';
import type { ChainAdapter, ChainName, OracleConfig, Prediction, FeeSnapshot, AccuracyReport } from './types';

const adapters: Record<ChainName, ChainAdapter> = { arbitrum, optimism, base, scroll };

/**
 * AccuracyTracker is responsible for evaluating the historical performance
 * of the GasOracle's predictions. It simulates past predictions and compares
 * them against actual recorded fees.
 */
export class AccuracyTracker {
  private fetcher: FeeFetcher;
  private predictor: Predictor;
  private adapter: ChainAdapter;
  private chain: ChainName;
  private windowSize: number;

  constructor(config: OracleConfig) {
    this.fetcher = new FeeFetcher(config);
    this.predictor = new Predictor();
    this.chain = config.chain;
    this.adapter = adapters[config.chain];
    if (!this.adapter) throw new Error(`Unsupported chain: ${config.chain}`);
    this.windowSize = config.windowSize ?? 50;
  }

  /**
   * Computes accuracy metrics by simulating predictions for past blocks
   * and comparing them against actual recorded values.
   *
   * @param lastNBlocks The number of past "actual" blocks to evaluate.
   * @param blocksAhead The number of blocks ahead the prediction was made for (N in "N blocks later").
   * @returns An AccuracyReport containing MAE, MAPE, and % within confidence band.
   */
  async computeAccuracy(lastNBlocks: number, blocksAhead: number): Promise<AccuracyReport> {
    const latestBlock = await this.fetcher.getLatestL1BlockNumber();
    const evaluatedPredictions: { prediction: Prediction, actualL2Cost: bigint, actualBlobFee: bigint }[] = [];

    // Iterate backwards from (latestBlock - blocksAhead) to collect `lastNBlocks` data points.
    // For each block `i` (relative to latestBlock), we consider it an 'actual' block.
    // We then predict for block `actualBlockNumber` based on history up to `predictionBaseBlockNumber`.
    for (let i = 0; i < lastNBlocks; i++) {
      const actualBlockNumber = latestBlock - BigInt(i); // This is the block where we expect the actuals
      const predictionBaseBlockNumber = actualBlockNumber - BigInt(blocksAhead); // This is the block from which prediction is made

      if (predictionBaseBlockNumber < BigInt(this.windowSize -1)) { // Ensure enough history for windowSize
        // console.warn(`Skipping block ${predictionBaseBlockNumber}: not enough history for window size ${this.windowSize}.`);
        continue;
      }

      // 1. Fetch historical snapshots up to `predictionBaseBlockNumber`
      // The `fetchHistory` method takes `endBlockNumber` and fetches `windowSize` blocks ending there.
      const snapshots = await this.fetcher.fetchHistory(predictionBaseBlockNumber, this.windowSize);
      
      // Ensure enough valid snapshots for prediction (at least 3 for linear regression)
      if (snapshots.length < Math.min(this.windowSize, 3)) {
         // console.warn(`Not enough snapshots (${snapshots.length}) for prediction at block ${predictionBaseBlockNumber}. Skipping.`);
         continue;
      }

      // 2. Make a prediction for `blocksAhead`
      const prediction = this.predictor.predict(snapshots, blocksAhead, this.chain, this.adapter);

      // 3. Fetch actual values at `actualBlockNumber`
      const actualBlockData = await this.fetcher.fetchSpecificBlock(actualBlockNumber);
      if (!actualBlockData) {
        // console.warn(`Could not fetch actual block data for ${actualBlockNumber}. Skipping.`);
        continue;
      }

      const actualBlobFee = actualBlockData.blobBaseFee;
      // Compute the actual total L2 cost using the chain adapter's formula
      const actualL2Cost = this.adapter.computeL2Cost(actualBlockData.blobBaseFee, actualBlockData.l2GasPrice);

      evaluatedPredictions.push({
        prediction,
        actualL2Cost,
        actualBlobFee,
      });
    }

    if (evaluatedPredictions.length === 0) {
      return {
        maeGasPrice: 0, mapeGasPrice: 0, withinConfidenceGasPrice: 0,
        maeBlobFee: 0, mapeBlobFee: 0, withinConfidenceBlobFee: 0,
        totalEvaluated: 0, chain: this.chain, blocksAhead,
      };
    }

    // Now calculate metrics from collected data
    let totalAbsErrorGasPrice = 0;
    let totalAbsPercentageErrorGasPrice = 0;
    let withinConfCountGasPrice = 0;

    let totalAbsErrorBlobFee = 0;
    let totalAbsPercentageErrorBlobFee = 0;
    let withinConfCountBlobFee = 0;

    for (const { prediction, actualL2Cost, actualBlobFee } of evaluatedPredictions) {
      // Convert actual BigInt values (wei) to gwei (number) for comparison
      const predictedL2CostGwei = prediction.gasPrice;
      const actualL2CostGwei = Number(actualL2Cost) / 1e9;

      const predictedBlobFeeGwei = prediction.blobFee;
      const actualBlobFeeGwei = Number(actualBlobFee) / 1e9;

      // --- Calculate metrics for L2 Total Gas Price ---
      const diffL2Cost = Math.abs(predictedL2CostGwei - actualL2CostGwei);
      totalAbsErrorGasPrice += diffL2Cost;
      if (actualL2CostGwei > 0) { // Avoid division by zero for MAPE
        totalAbsPercentageErrorGasPrice += diffL2Cost / actualL2CostGwei;
      }

      // Confidence band for gas price: actual is within [predicted * (1-C), predicted * (1+C)]
      // Where C is (1 - prediction.confidence) acting as a relative margin
      const marginFactorGasPrice = (1 - prediction.confidence);
      const lowerBoundGasPrice = predictedL2CostGwei * (1 - marginFactorGasPrice);
      const upperBoundGasPrice = predictedL2CostGwei * (1 + marginFactorGasPrice);
      if (actualL2CostGwei >= lowerBoundGasPrice && actualL2CostGwei <= upperBoundGasPrice) {
        withinConfCountGasPrice++;
      }

      // --- Calculate metrics for L1 Blob Base Fee ---
      const diffBlobFee = Math.abs(predictedBlobFeeGwei - actualBlobFeeGwei);
      totalAbsErrorBlobFee += diffBlobFee;
      if (actualBlobFeeGwei > 0) { // Avoid division by zero for MAPE
        totalAbsPercentageErrorBlobFee += diffBlobFee / actualBlobFeeGwei;
      }

      // Confidence band for blob fee
      const marginFactorBlobFee = (1 - prediction.confidence);
      const lowerBoundBlobFee = predictedBlobFeeGwei * (1 - marginFactorBlobFee);
      const upperBoundBlobFee = predictedBlobFeeGwei * (1 + marginFactorBlobFee);
      if (actualBlobFeeGwei >= lowerBoundBlobFee && actualBlobFeeGwei <= upperBoundBlobFee) {
        withinConfCountBlobFee++;
      }
    }

    const total = evaluatedPredictions.length;
    return {
      maeGasPrice: totalAbsErrorGasPrice / total,
      mapeGasPrice: (totalAbsPercentageErrorGasPrice / total) * 100, // as percentage
      withinConfidenceGasPrice: (withinConfCountGasPrice / total) * 100, // as percentage

      maeBlobFee: totalAbsErrorBlobFee / total,
      mapeBlobFee: (totalAbsPercentageErrorBlobFee / total) * 100, // as percentage
      withinConfidenceBlobFee: (withinConfCountBlobFee / total) * 100, // as percentage

      totalEvaluated: total,
      chain: this.chain,
      blocksAhead,
    };
  }
}
