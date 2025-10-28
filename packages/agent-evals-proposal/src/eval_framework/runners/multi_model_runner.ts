/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Multi-Model Runner
 *
 * Orchestrates evaluation runs across multiple models and generates comparison reports.
 */

import {
  DatasetLoader,
  TestCase,
  ExecutionResult,
  ComparisonResult,
  EvaluationResults,
} from '../runner';
import { AgentExecutor } from '../executors/agent_executor';
import { DeterministicEvaluator } from '../evaluators/deterministic_evaluator';
import { MetricsCalculator } from '../metrics/metrics_calculator';
import { HTMLReporter, ModelComparisonData } from '../reporters/html_reporter';
import { ConfigLoader } from '../config/config_loader';
import { FailedTestsTracker } from '../utils/failed_tests_tracker';

/**
 * Multi-model runner configuration
 */
export interface MultiModelRunnerConfig {
  agent_name: string;
  model_names: string[];
  benchmark_path: string;
  output_dir?: string;
  parallel_execution?: boolean;
  max_concurrent_models?: number;
  // Dataset filters
  limit?: number;
  difficulty?: string;
  category?: string;
  test_indices?: number[]; // Specific test indices to run
}

/**
 * Results for a single model
 */
interface ModelEvaluationResult {
  model_name: string;
  display_name: string;
  test_cases: TestCase[];
  execution_results: ExecutionResult[];
  comparison_results: ComparisonResult[];
  evaluation_results: EvaluationResults;
}

/**
 * Multi-model evaluation runner
 */
export class MultiModelRunner {
  private config: MultiModelRunnerConfig;
  private datasetLoader: DatasetLoader;
  private evaluator: DeterministicEvaluator;
  private metricsCalculator: MetricsCalculator;
  private htmlReporter: HTMLReporter;

  constructor(config: MultiModelRunnerConfig) {
    this.config = {
      output_dir: './reports',
      parallel_execution: false,
      max_concurrent_models: 2,
      ...config,
    };

    // Initialize components
    this.datasetLoader = new DatasetLoader();
    this.evaluator = new DeterministicEvaluator();
    this.metricsCalculator = new MetricsCalculator();
    this.htmlReporter = new HTMLReporter({
      output_dir: this.config.output_dir,
    });
  }

  /**
   * Run evaluation across all configured models
   */
  async run(): Promise<ModelComparisonData[]> {
    const totalStartTime = Date.now();

    // eslint-disable-next-line no-console
    console.log(`\n🚀 Starting multi-model evaluation`);
    // eslint-disable-next-line no-console
    console.log(`Agent: ${this.config.agent_name}`);
    // eslint-disable-next-line no-console
    console.log(`Models: ${this.config.model_names.join(', ')}`);
    // eslint-disable-next-line no-console
    console.log(`Benchmark: ${this.config.benchmark_path}\n`);

    // Load test cases once (shared across all models)
    // eslint-disable-next-line no-console
    console.log('Loading test cases...');
    const loadStartTime = Date.now();
    const filters = {
      limit: this.config.limit,
      difficulty: this.config.difficulty,
      category: this.config.category,
      test_indices: this.config.test_indices,
    };
    const testCases = await this.datasetLoader.loadBenchmark(this.config.benchmark_path, filters);
    const loadTime = Date.now() - loadStartTime;
    // eslint-disable-next-line no-console
    console.log(`Loaded ${testCases.length} test cases in ${loadTime}ms\n`);

    // Run evaluation for each model
    const modelResults: ModelEvaluationResult[] = [];

    if (this.config.parallel_execution) {
      // Run models in parallel (with concurrency limit)
      modelResults.push(...(await this.runModelsInParallel(testCases)));
    } else {
      // Run models sequentially
      for (const modelName of this.config.model_names) {
        const result = await this.runSingleModel(modelName, testCases);
        modelResults.push(result);
      }
    }

    // Generate comparison data
    const comparisonData = this.generateComparisonData(modelResults);

    // Generate multi-model HTML report
    // eslint-disable-next-line no-console
    console.log('\n📊 Generating multi-model comparison report...');
    await this.htmlReporter.exportMultiModelReport(comparisonData);

    // Generate individual model reports and save failed tests
    for (const result of modelResults) {
      await this.htmlReporter.exportResults(result.evaluation_results);

      // Generate test cases detail report
      const testCasesFilename = `test-cases-${result.model_name}.html`;
      await this.htmlReporter.exportTestCasesReport(result.evaluation_results, testCasesFilename);

      // Save failed tests for this model
      const failedTestIds = FailedTestsTracker.extractFailedTestIds(
        result.test_cases,
        result.comparison_results
      );

      if (failedTestIds.length > 0) {
        FailedTestsTracker.saveFailedTests(
          failedTestIds,
          {
            model_name: result.model_name,
            agent_name: this.config.agent_name,
            benchmark_name: this.config.benchmark_path,
            total_tests: result.test_cases.length,
          },
          result.model_name
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(`\n✅ All tests passed for ${result.model_name}! No failed tests to save.`);
      }
    }

    // Print summary
    this.printSummary(comparisonData);

    // Print total execution time
    const totalTime = Date.now() - totalStartTime;
    // eslint-disable-next-line no-console
    console.log(
      `\n⏱️  Total execution time: ${(totalTime / 1000).toFixed(2)}s (${(totalTime / 60000).toFixed(
        2
      )}min)\n`
    );

    return comparisonData;
  }

  /**
   * Run evaluation for a single model
   */
  private async runSingleModel(
    modelName: string,
    testCases: TestCase[]
  ): Promise<ModelEvaluationResult> {
    const modelStartTime = Date.now();

    // eslint-disable-next-line no-console
    console.log(`\n📦 Evaluating model: ${modelName}`);
    // eslint-disable-next-line no-console
    console.log(`${'='.repeat(50)}`);

    // Get model config
    const modelConfig = ConfigLoader.getModelConfig(modelName);
    if (!modelConfig) {
      throw new Error(`Model config not found: ${modelName}`);
    }

    // Create executor for this model
    const executor = new AgentExecutor({
      agentName: this.config.agent_name,
      modelName,
      parallel: false,
    });

    // Execute test cases
    // eslint-disable-next-line no-console
    console.log(`Executing ${testCases.length} test cases...`);
    const execStartTime = Date.now();
    const executionResults = await executor.executeBatch(testCases);
    const execTime = Date.now() - execStartTime;
    const executionStats = executor.getStats(executionResults);
    // eslint-disable-next-line no-console
    console.log(`  ✓ Completed: ${executionStats.successful}/${executionStats.total}`);
    // eslint-disable-next-line no-console
    console.log(`  ✗ Failed: ${executionStats.failed}`);
    // eslint-disable-next-line no-console
    console.log(`  ⏱  Execution time: ${(execTime / 1000).toFixed(2)}s`);
    // eslint-disable-next-line no-console
    console.log(`  ⏱  Avg latency per test: ${executionStats.avgLatencyMs.toFixed(0)}ms`);
    // eslint-disable-next-line no-console
    console.log(`  💰 Total cost: $${executionStats.totalCostUsd.toFixed(4)}`);

    // Evaluate results
    // eslint-disable-next-line no-console
    console.log('Evaluating results...');
    const evalStartTime = Date.now();
    const comparisonResults = this.evaluator.evaluateBatch(testCases, executionResults);
    const evalTime = Date.now() - evalStartTime;
    const evalSummary = this.evaluator.getSummary(comparisonResults);
    // eslint-disable-next-line no-console
    console.log(`  ✓ Passed: ${evalSummary.passed}/${evalSummary.total}`);
    // eslint-disable-next-line no-console
    console.log(`  ✗ Failed: ${evalSummary.failed}`);
    // eslint-disable-next-line no-console
    console.log(`  📈 Pass rate: ${(evalSummary.passRate * 100).toFixed(1)}%`);
    // eslint-disable-next-line no-console
    console.log(`  ⏱  Evaluation time: ${evalTime}ms`);

    // Log individual test results
    // eslint-disable-next-line no-console
    console.log('\n  📋 Individual Test Results:');
    comparisonResults.forEach((result, index) => {
      const testCase = testCases[index];
      const statusIcon = result.success ? '✅' : '❌';
      const statusText = result.success ? 'PASS' : 'FAIL';
      // eslint-disable-next-line no-console
      console.log(`    ${statusIcon} ${statusText}: ${testCase.id}`);
    });

    // Calculate metrics
    const metricsStartTime = Date.now();
    const metrics = this.metricsCalculator.calculateMetrics(
      testCases,
      executionResults,
      comparisonResults
    );
    const metricsTime = Date.now() - metricsStartTime;
    // eslint-disable-next-line no-console
    console.log(`  ⏱  Metrics calculation time: ${metricsTime}ms`);

    // Create evaluation results
    const evaluationResults: EvaluationResults = {
      evaluation_id: `eval-${Date.now()}-${modelName}`,
      agent_name: this.config.agent_name,
      agent_endpoint: ConfigLoader.getAgent(this.config.agent_name)?.endpoint || 'unknown',
      model_name: modelName,
      benchmark_name: this.config.benchmark_path,
      benchmark_version: '1.0.0',
      timestamp: new Date(),
      test_cases: testCases,
      execution_results: executionResults,
      comparison_results: comparisonResults,
      metrics,
    };

    const modelTotalTime = Date.now() - modelStartTime;
    // eslint-disable-next-line no-console
    console.log(`\n  🏁 Model ${modelName} completed in ${(modelTotalTime / 1000).toFixed(2)}s\n`);

    return {
      model_name: modelName,
      display_name: modelConfig.display_name,
      test_cases: testCases,
      execution_results: executionResults,
      comparison_results: comparisonResults,
      evaluation_results: evaluationResults,
    };
  }

  /**
   * Run models in parallel with concurrency limit
   */
  private async runModelsInParallel(testCases: TestCase[]): Promise<ModelEvaluationResult[]> {
    const results: ModelEvaluationResult[] = [];
    const maxConcurrent = this.config.max_concurrent_models || 2;

    // Process models in batches
    for (let i = 0; i < this.config.model_names.length; i += maxConcurrent) {
      const batch = this.config.model_names.slice(i, i + maxConcurrent);
      // eslint-disable-next-line no-console
      console.log(`\n📦 Processing batch: ${batch.join(', ')}`);

      const batchPromises = batch.map((modelName) => this.runSingleModel(modelName, testCases));

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Generate comparison data for HTML report
   */
  private generateComparisonData(modelResults: ModelEvaluationResult[]): ModelComparisonData[] {
    return modelResults.map((result) => ({
      model_name: result.model_name,
      display_name: result.display_name,
      metrics: result.evaluation_results.metrics,
      test_count: result.test_cases.length,
    }));
  }

  /**
   * Print comparison summary to console
   */
  private printSummary(comparisonData: ModelComparisonData[]): void {
    // eslint-disable-next-line no-console
    console.log(`\n\n${'='.repeat(80)}`);
    // eslint-disable-next-line no-console
    console.log('📊 MULTI-MODEL COMPARISON SUMMARY');
    // eslint-disable-next-line no-console
    console.log('='.repeat(80));

    // Cost comparison
    // eslint-disable-next-line no-console
    console.log('\n💰 Cost Comparison:');
    // eslint-disable-next-line no-console
    console.log('─'.repeat(80));
    // eslint-disable-next-line no-console
    console.log(`${'Model'.padEnd(25)} ${'Avg Cost'.padEnd(15)} ${'Total Cost'.padEnd(15)}`);
    // eslint-disable-next-line no-console
    console.log('─'.repeat(80));
    comparisonData.forEach((data) => {
      // eslint-disable-next-line no-console
      console.log(
        `${data.display_name.padEnd(25)} ` +
          `$${data.metrics.avgCostPerTest.toFixed(4).padEnd(14)} ` +
          `$${data.metrics.totalCostUsd.toFixed(4)}`
      );
    });

    // Latency comparison
    // eslint-disable-next-line no-console
    console.log('\n⏱  Latency Comparison (ms):');
    // eslint-disable-next-line no-console
    console.log('─'.repeat(80));
    // eslint-disable-next-line no-console
    console.log(
      `${'Model'.padEnd(25)} ${'Avg'.padEnd(10)} ${'P50'.padEnd(10)} ${'P95'.padEnd(10)}`
    );
    // eslint-disable-next-line no-console
    console.log('─'.repeat(80));
    comparisonData.forEach((data) => {
      // eslint-disable-next-line no-console
      console.log(
        `${data.display_name.padEnd(25)} ` +
          `${data.metrics.avgLatencyMs.toFixed(0).padEnd(10)} ` +
          `${data.metrics.p50LatencyMs.toFixed(0).padEnd(10)} ` +
          `${data.metrics.p95LatencyMs.toFixed(0)}`
      );
    });

    // Accuracy comparison
    // eslint-disable-next-line no-console
    console.log('\n✅ Accuracy Comparison:');
    // eslint-disable-next-line no-console
    console.log('─'.repeat(80));
    // eslint-disable-next-line no-console
    console.log(`${'Model'.padEnd(25)} ${'Success Rate'.padEnd(15)} ${'Syntax Valid'.padEnd(15)}`);
    // eslint-disable-next-line no-console
    console.log('─'.repeat(80));
    comparisonData.forEach((data) => {
      // eslint-disable-next-line no-console
      console.log(
        `${data.display_name.padEnd(25)} ` +
          `${(data.metrics.successRate * 100).toFixed(1)}%`.padEnd(15) +
          `${(data.metrics.syntaxValidRate * 100).toFixed(1)}%`
      );
    });

    // Efficiency comparison
    // eslint-disable-next-line no-console
    console.log('\n⚡ Efficiency Comparison:');
    // eslint-disable-next-line no-console
    console.log('─'.repeat(80));
    // eslint-disable-next-line no-console
    console.log(
      `${'Model'.padEnd(25)} ${'Avg Tool Calls'.padEnd(16)} ${'Avg LLM Calls'.padEnd(15)}`
    );
    // eslint-disable-next-line no-console
    console.log('─'.repeat(80));
    comparisonData.forEach((data) => {
      // eslint-disable-next-line no-console
      console.log(
        `${data.display_name.padEnd(25)} ` +
          `${data.metrics.avgToolCalls.toFixed(1).padEnd(16)} ` +
          `${data.metrics.avgLlmCalls.toFixed(1)}`
      );
    });

    // eslint-disable-next-line no-console
    console.log('\n' + '='.repeat(80));
  }

  /**
   * Get winner for each metric category
   */
  getWinners(
    comparisonData: ModelComparisonData[]
  ): {
    lowest_cost: string;
    fastest: string;
    most_accurate: string;
  } {
    let lowestCostModel = comparisonData[0];
    let fastestModel = comparisonData[0];
    let mostAccurateModel = comparisonData[0];

    comparisonData.forEach((data) => {
      if (data.metrics.avgCostPerTest < lowestCostModel.metrics.avgCostPerTest) {
        lowestCostModel = data;
      }
      if (data.metrics.avgLatencyMs < fastestModel.metrics.avgLatencyMs) {
        fastestModel = data;
      }
      if (data.metrics.successRate > mostAccurateModel.metrics.successRate) {
        mostAccurateModel = data;
      }
    });

    return {
      lowest_cost: lowestCostModel.display_name,
      fastest: fastestModel.display_name,
      most_accurate: mostAccurateModel.display_name,
    };
  }
}
