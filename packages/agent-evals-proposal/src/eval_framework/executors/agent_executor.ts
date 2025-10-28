/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent Executor
 *
 * Executes agents on test cases using AG UI protocol and collects execution results.
 */

import { AGUIClient, createAGUIClient } from '../clients/ag_ui_client';
import { TestCase, ExecutionResult } from '../runner';
import { CLIENT_TOOLS } from '../config/client_tools';

/**
 * Executor configuration
 */
export interface AgentExecutorConfig {
  agentName: string;
  modelName: string;
  timeout_ms?: number;
  parallel?: boolean;
  max_retries?: number;
}

/**
 * Executes agents with test cases
 */
export class AgentExecutor {
  private config: AgentExecutorConfig;
  private client: AGUIClient;

  constructor(config: AgentExecutorConfig) {
    this.config = {
      timeout_ms: 60000,
      parallel: false,
      max_retries: 2,
      ...config,
    };

    // Create AG UI client
    this.client = createAGUIClient(config.agentName, config.modelName);
  }

  /**
   * Execute agent on a single test case
   */
  async execute(testCase: TestCase): Promise<ExecutionResult> {
    const testStartTime = Date.now();
    // eslint-disable-next-line no-console
    console.log(`Executing test case ${testCase.id} with ${this.config.modelName}`);

    try {
      // Create RunAgentInput from test case
      // Use test-specific tools if provided, otherwise use default CLIENT_TOOLS
      const runAgentInput = AGUIClient.createRunAgentInput(
        testCase.input.query,
        testCase.input.context,
        testCase.input.tools || CLIENT_TOOLS
      );

      // Run agent and collect metrics
      const result = await this.client.runAgent(runAgentInput);
      const testTotalTime = Date.now() - testStartTime;
      // eslint-disable-next-line no-console
      console.log(
        `  ⏱️  Test ${testCase.id} completed in ${(testTotalTime / 1000).toFixed(
          2
        )}s (agent latency: ${result.latency_ms}ms)`
      );

      // Build execution result
      return {
        test_case_id: testCase.id,
        agent_output: result.output,
        latency_ms: result.latency_ms,
        token_usage: result.token_usage,
        cost_usd: result.cost_usd,
        tool_calls_count: result.tool_calls_count,
        llm_calls_count: result.llm_calls_count,
        tool_calls_by_type: result.tool_calls_by_type,
        trace_id: result.trace_id,
        error: result.error,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error(`Error executing test case ${testCase.id}:`, errorMessage);

      return {
        test_case_id: testCase.id,
        agent_output: {},
        latency_ms: 0,
        token_usage: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        },
        cost_usd: 0,
        tool_calls_count: 0,
        llm_calls_count: 0,
        tool_calls_by_type: {},
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Execute agent on multiple test cases
   */
  async executeBatch(testCases: TestCase[]): Promise<ExecutionResult[]> {
    // eslint-disable-next-line no-console
    console.log(
      `Executing ${testCases.length} test cases with ${this.config.modelName} ` +
        `(parallel: ${this.config.parallel})`
    );

    if (this.config.parallel) {
      // Execute in parallel
      return await this.executeParallel(testCases);
    } else {
      // Execute sequentially
      return await this.executeSequential(testCases);
    }
  }

  /**
   * Execute test cases sequentially
   */
  private async executeSequential(testCases: TestCase[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    const batchStartTime = Date.now();

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      // eslint-disable-next-line no-console
      console.log(`\nProgress: ${i + 1}/${testCases.length} - ${testCase.id}`);

      const result = await this.execute(testCase);
      results.push(result);

      // Add small delay between requests to avoid rate limiting
      if (i < testCases.length - 1) {
        // eslint-disable-next-line no-console
        console.log(`  ⏸️  Waiting 500ms before next test...`);
        await this.delay(500);
      }
    }

    const batchTotalTime = Date.now() - batchStartTime;
    // eslint-disable-next-line no-console
    console.log(`\n  ✅ Batch execution completed in ${(batchTotalTime / 1000).toFixed(2)}s\n`);

    return results;
  }

  /**
   * Execute test cases in parallel
   */
  private async executeParallel(testCases: TestCase[]): Promise<ExecutionResult[]> {
    // Use Promise.all for parallel execution
    // Note: Be careful with rate limiting - consider batching if many test cases
    const promises = testCases.map((testCase) => this.execute(testCase));

    return await Promise.all(promises);
  }

  /**
   * Execute test cases in batches (for large datasets)
   */
  async executeBatched(testCases: TestCase[], batchSize: number = 5): Promise<ExecutionResult[]> {
    // eslint-disable-next-line no-console
    console.log(`Executing ${testCases.length} test cases in batches of ${batchSize}`);

    const results: ExecutionResult[] = [];

    for (let i = 0; i < testCases.length; i += batchSize) {
      const batch = testCases.slice(i, i + batchSize);
      // eslint-disable-next-line no-console
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          testCases.length / batchSize
        )}`
      );

      const batchResults = await Promise.all(batch.map((testCase) => this.execute(testCase)));

      results.push(...batchResults);

      // Add delay between batches
      if (i + batchSize < testCases.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry(testCase: TestCase): Promise<ExecutionResult> {
    let lastError: string | undefined;
    const maxRetries = this.config.max_retries || 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.execute(testCase);

        // If no error, return result
        if (!result.error) {
          return result;
        }

        // If error and retries remaining, try again
        lastError = result.error;
        if (attempt < maxRetries) {
          // eslint-disable-next-line no-console
          console.warn(
            `Test case ${testCase.id} failed (attempt ${attempt + 1}/${
              maxRetries + 1
            }), retrying...`
          );
          await this.delay(1000 * (attempt + 1)); // Exponential backoff
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < maxRetries) {
          // eslint-disable-next-line no-console
          console.warn(
            `Test case ${testCase.id} threw error (attempt ${attempt + 1}/${
              maxRetries + 1
            }), retrying...`
          );
          await this.delay(1000 * (attempt + 1));
        }
      }
    }

    // All retries failed, return error result
    return {
      test_case_id: testCase.id,
      agent_output: {},
      latency_ms: 0,
      token_usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
      cost_usd: 0,
      tool_calls_count: 0,
      llm_calls_count: 0,
      tool_calls_by_type: {},
      error: `Failed after ${maxRetries + 1} attempts: ${lastError}`,
      timestamp: new Date(),
    };
  }

  /**
   * Utility: delay for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get executor statistics
   */
  getStats(
    results: ExecutionResult[]
  ): {
    total: number;
    successful: number;
    failed: number;
    avgLatencyMs: number;
    totalCostUsd: number;
  } {
    const total = results.length;
    const successful = results.filter((r) => !r.error).length;
    const failed = total - successful;

    const latencies = results.map((r) => r.latency_ms);
    const avgLatencyMs =
      latencies.length > 0 ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0;

    const totalCostUsd = results.reduce((sum, r) => sum + r.cost_usd, 0);

    return {
      total,
      successful,
      failed,
      avgLatencyMs,
      totalCostUsd,
    };
  }
}
