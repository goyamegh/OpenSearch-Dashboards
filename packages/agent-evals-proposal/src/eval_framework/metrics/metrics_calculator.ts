/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Metrics Calculator
 *
 * Calculates comprehensive metrics from evaluation results:
 * - Accuracy metrics (exact match, syntax valid, semantic similarity)
 * - Latency metrics (avg, min, max, P50, P95, P99)
 * - Cost metrics (total, avg, min, max)
 * - Tool efficiency metrics
 * - Category and difficulty breakdowns
 */

import { TestCase, ExecutionResult, ComparisonResult, Metrics, CategoryMetrics } from '../runner';

/**
 * Metrics calculator for evaluation results
 */
export class MetricsCalculator {
  /**
   * Calculate all metrics from evaluation results
   */
  calculateMetrics(
    testCases: TestCase[],
    executionResults: ExecutionResult[],
    comparisonResults: ComparisonResult[]
  ): Metrics {
    // Validate input lengths match
    if (
      testCases.length !== executionResults.length ||
      testCases.length !== comparisonResults.length
    ) {
      throw new Error('Test cases, execution results, and comparison results length mismatch');
    }

    const totalTests = comparisonResults.length;
    const successful = comparisonResults.filter((r) => r.success).length;
    const failed = totalTests - successful;
    const successRate = totalTests > 0 ? successful / totalTests : 0;

    // Accuracy metrics
    const exactMatchRate = this.calculateRate(comparisonResults, (r) => r.exactMatch);
    const syntaxValidRate = this.calculateRate(comparisonResults, (r) => r.syntaxValid);
    const avgSemanticSimilarity = this.calculateAverage(
      comparisonResults.map((r) => r.semanticSimilarity).filter((s): s is number => s !== undefined)
    );

    // Latency metrics
    const latencies = executionResults.map((r) => r.latency_ms);
    const avgLatencyMs = this.calculateAverage(latencies);
    const minLatencyMs = latencies.length > 0 ? Math.min(...latencies) : 0;
    const maxLatencyMs = latencies.length > 0 ? Math.max(...latencies) : 0;
    const p50LatencyMs = this.calculatePercentile(latencies, 50);
    const p95LatencyMs = this.calculatePercentile(latencies, 95);
    const p99LatencyMs = this.calculatePercentile(latencies, 99);

    // Cost metrics
    const costs = executionResults.map((r) => r.cost_usd);
    const totalCostUsd = costs.reduce((sum, c) => sum + c, 0);
    const avgCostPerTest = totalTests > 0 ? totalCostUsd / totalTests : 0;
    const minCostUsd = costs.length > 0 ? Math.min(...costs) : 0;
    const maxCostUsd = costs.length > 0 ? Math.max(...costs) : 0;

    // Tool efficiency metrics
    const avgToolsUsed = this.calculateAverageToolsUsed(executionResults);
    const unnecessaryToolRate = this.calculateUnnecessaryToolRate(testCases, executionResults);

    // Efficiency metrics
    const toolCalls = executionResults.map((r) => r.tool_calls_count);
    const avgToolCalls = this.calculateAverage(toolCalls);
    const minToolCalls = toolCalls.length > 0 ? Math.min(...toolCalls) : 0;
    const maxToolCalls = toolCalls.length > 0 ? Math.max(...toolCalls) : 0;

    const llmCalls = executionResults.map((r) => r.llm_calls_count);
    const avgLlmCalls = this.calculateAverage(llmCalls);
    const minLlmCalls = llmCalls.length > 0 ? Math.min(...llmCalls) : 0;
    const maxLlmCalls = llmCalls.length > 0 ? Math.max(...llmCalls) : 0;

    // Calculate metrics by category and difficulty
    const metricsByCategory = this.calculateMetricsByGroup(
      testCases,
      executionResults,
      comparisonResults,
      'category'
    );

    const metricsByDifficulty = this.calculateMetricsByGroup(
      testCases,
      executionResults,
      comparisonResults,
      'difficulty'
    );

    return {
      totalTests,
      successful,
      failed,
      successRate,
      exactMatchRate,
      syntaxValidRate,
      avgSemanticSimilarity,
      avgLatencyMs,
      minLatencyMs,
      maxLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      p99LatencyMs,
      totalCostUsd,
      avgCostPerTest,
      minCostUsd,
      maxCostUsd,
      avgToolsUsed,
      unnecessaryToolRate,
      avgToolCalls,
      minToolCalls,
      maxToolCalls,
      avgLlmCalls,
      minLlmCalls,
      maxLlmCalls,
      metricsByCategory,
      metricsByDifficulty,
    };
  }

  /**
   * Calculate rate of results matching a condition
   */
  private calculateRate(
    results: ComparisonResult[],
    condition: (r: ComparisonResult) => boolean
  ): number {
    if (results.length === 0) {
      return 0;
    }
    return results.filter(condition).length / results.length;
  }

  /**
   * Calculate average of numeric values
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate percentile of values
   */
  calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) {
      return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Calculate average number of tools used
   */
  private calculateAverageToolsUsed(results: ExecutionResult[]): number {
    const toolCounts = results.map((r) => {
      const tools = r.agent_output.tools_used;
      return Array.isArray(tools) ? tools.length : 0;
    });

    return this.calculateAverage(toolCounts);
  }

  /**
   * Calculate rate of unnecessary tool usage
   */
  private calculateUnnecessaryToolRate(
    testCases: TestCase[],
    executionResults: ExecutionResult[]
  ): number {
    let unnecessaryCount = 0;

    for (let i = 0; i < testCases.length; i++) {
      const expected = testCases[i].expected_output.tools_used || [];
      const actual = executionResults[i].agent_output.tools_used || [];

      // Count tools used that weren't expected
      const unnecessary = actual.filter((tool: string) => !expected.includes(tool));
      if (unnecessary.length > 0) {
        unnecessaryCount++;
      }
    }

    return testCases.length > 0 ? unnecessaryCount / testCases.length : 0;
  }

  /**
   * Calculate metrics grouped by a field (category or difficulty)
   */
  private calculateMetricsByGroup(
    testCases: TestCase[],
    executionResults: ExecutionResult[],
    comparisonResults: ComparisonResult[],
    groupBy: 'category' | 'difficulty'
  ): Record<string, CategoryMetrics> {
    // Group indices by the field value
    const groups: Record<string, number[]> = {};

    testCases.forEach((testCase, index) => {
      const groupValue = testCase[groupBy];
      if (!groups[groupValue]) {
        groups[groupValue] = [];
      }
      groups[groupValue].push(index);
    });

    // Calculate metrics for each group
    const metrics: Record<string, CategoryMetrics> = {};

    for (const [groupValue, indices] of Object.entries(groups)) {
      const groupComparisons = indices.map((i) => comparisonResults[i]);
      const groupExecutions = indices.map((i) => executionResults[i]);

      const totalTests = indices.length;
      const successful = groupComparisons.filter((r) => r.success).length;
      const successRate = totalTests > 0 ? successful / totalTests : 0;

      const latencies = groupExecutions.map((r) => r.latency_ms);
      const avgLatencyMs = this.calculateAverage(latencies);

      const costs = groupExecutions.map((r) => r.cost_usd);
      const avgCostUsd = this.calculateAverage(costs);

      metrics[groupValue] = {
        name: groupValue,
        totalTests,
        successful,
        successRate,
        avgLatencyMs,
        avgCostUsd,
      };
    }

    return metrics;
  }

  /**
   * Calculate detailed percentile statistics
   */
  calculateDetailedLatencyStats(
    latencies: number[]
  ): {
    avg: number;
    min: number;
    max: number;
    median: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
    stddev: number;
  } {
    if (latencies.length === 0) {
      return {
        avg: 0,
        min: 0,
        max: 0,
        median: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        stddev: 0,
      };
    }

    const avg = this.calculateAverage(latencies);
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    const median = this.calculatePercentile(latencies, 50);
    const p50 = this.calculatePercentile(latencies, 50);
    const p75 = this.calculatePercentile(latencies, 75);
    const p90 = this.calculatePercentile(latencies, 90);
    const p95 = this.calculatePercentile(latencies, 95);
    const p99 = this.calculatePercentile(latencies, 99);

    // Calculate standard deviation
    const variance = latencies.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / latencies.length;
    const stddev = Math.sqrt(variance);

    return {
      avg,
      min,
      max,
      median,
      p50,
      p75,
      p90,
      p95,
      p99,
      stddev,
    };
  }

  /**
   * Format metrics for console output
   */
  formatMetrics(metrics: Metrics): string {
    const lines: string[] = [];

    lines.push('=== Evaluation Metrics ===');
    lines.push('');
    lines.push(`Total Tests: ${metrics.totalTests}`);
    lines.push(`Successful: ${metrics.successful} (${(metrics.successRate * 100).toFixed(1)}%)`);
    lines.push(`Failed: ${metrics.failed}`);
    lines.push('');

    lines.push('Accuracy:');
    lines.push(`  Exact Match Rate: ${(metrics.exactMatchRate * 100).toFixed(1)}%`);
    lines.push(`  Syntax Valid Rate: ${(metrics.syntaxValidRate * 100).toFixed(1)}%`);
    lines.push(`  Avg Semantic Similarity: ${metrics.avgSemanticSimilarity.toFixed(2)}`);
    lines.push('');

    lines.push('Latency:');
    lines.push(`  Average: ${metrics.avgLatencyMs.toFixed(0)}ms`);
    lines.push(`  Min: ${metrics.minLatencyMs.toFixed(0)}ms`);
    lines.push(`  Max: ${metrics.maxLatencyMs.toFixed(0)}ms`);
    lines.push(`  P50: ${metrics.p50LatencyMs.toFixed(0)}ms`);
    lines.push(`  P95: ${metrics.p95LatencyMs.toFixed(0)}ms`);
    lines.push(`  P99: ${metrics.p99LatencyMs.toFixed(0)}ms`);
    lines.push('');

    lines.push('Cost:');
    lines.push(`  Total: $${metrics.totalCostUsd.toFixed(4)}`);
    lines.push(`  Average per Test: $${metrics.avgCostPerTest.toFixed(4)}`);
    lines.push(`  Min: $${metrics.minCostUsd.toFixed(4)}`);
    lines.push(`  Max: $${metrics.maxCostUsd.toFixed(4)}`);
    lines.push('');

    lines.push('Tool Efficiency:');
    lines.push(`  Average Tools Used: ${metrics.avgToolsUsed.toFixed(1)}`);
    lines.push(`  Unnecessary Tool Rate: ${(metrics.unnecessaryToolRate * 100).toFixed(1)}%`);
    lines.push('');

    lines.push('Efficiency:');
    lines.push(`  Average Tool Calls: ${metrics.avgToolCalls.toFixed(1)}`);
    lines.push(`  Min Tool Calls: ${metrics.minToolCalls}`);
    lines.push(`  Max Tool Calls: ${metrics.maxToolCalls}`);
    lines.push(`  Average LLM Calls: ${metrics.avgLlmCalls.toFixed(1)}`);
    lines.push(`  Min LLM Calls: ${metrics.minLlmCalls}`);
    lines.push(`  Max LLM Calls: ${metrics.maxLlmCalls}`);

    return lines.join('\n');
  }
}
