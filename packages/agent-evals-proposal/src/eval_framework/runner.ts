/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenSearch Agent Evaluation Framework - Main Runner
 *
 * This module implements the core evaluation orchestration logic using TypeScript
 * and AG UI protocol integration.
 */

import { Tool } from '@ag-ui/core';

// ============================================================================
// Data Models
// ============================================================================

/**
 * Represents a single test case from a benchmark
 */
export interface TestCase {
  id: string;
  category: string;
  subcategory?: string;
  difficulty: string;
  tags?: string[];
  input: {
    query: string;
    tools?: Tool[]; // Client-side tools to pass to agent (e.g., execute_ppl_query)
    context?: {
      index?: string;
      available_fields?: string[];
      sample_data?: any;
      constraints?: any;
      dataset?: {
        // Enhanced dataset info matching production format
        title: string;
        timeFieldName: string;
        type: string;
        id?: string;
      };
      timeRange?: {
        // Optional time range for queries
        from: string;
        to: string;
      };
    };
  };
  expected_output: {
    ppl_query?: string;
    tools_used?: string[];
    reasoning?: string;
    alternative_outputs?: string[];
  };
  evaluation_criteria: {
    primary_metric: string;
    syntax_valid?: boolean;
    semantically_correct?: boolean;
    tool_efficiency?: boolean;
    semantic_similarity_threshold?: number;
  };
  metadata?: Record<string, any>;
}

/**
 * Results from executing an agent on a test case
 */
export interface ExecutionResult {
  test_case_id: string;
  agent_output: Record<string, any>;
  latency_ms: number;
  token_usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  cost_usd: number;
  tool_calls_count: number; // Total number of tool calls made
  llm_calls_count: number; // Total number of LLM roundtrips
  tool_calls_by_type: Record<string, number>; // Breakdown of tool calls by tool name
  trace_id?: string;
  error?: string;
  timestamp: Date;
}

/**
 * Results from comparing agent output with expected output
 */
export interface ComparisonResult {
  test_case_id: string;
  success: boolean;
  exactMatch: boolean;
  syntaxValid: boolean;
  semanticSimilarity?: number;
  toolMatch: boolean;
  details: Record<string, any>;
}

/**
 * Metrics for a specific category or difficulty level
 */
export interface CategoryMetrics {
  name: string;
  totalTests: number;
  successful: number;
  successRate: number;
  avgLatencyMs: number;
  avgCostUsd: number;
}

/**
 * Aggregated metrics from an evaluation run
 */
export interface Metrics {
  totalTests: number;
  successful: number;
  failed: number;
  successRate: number;

  // Accuracy metrics
  exactMatchRate: number;
  syntaxValidRate: number;
  avgSemanticSimilarity: number;

  // Latency metrics
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;

  // Cost metrics
  totalCostUsd: number;
  avgCostPerTest: number;
  minCostUsd: number;
  maxCostUsd: number;

  // Tool efficiency
  avgToolsUsed: number;
  unnecessaryToolRate: number;

  // Efficiency metrics
  avgToolCalls: number;
  minToolCalls: number;
  maxToolCalls: number;
  avgLlmCalls: number;
  minLlmCalls: number;
  maxLlmCalls: number;

  // By category/difficulty
  metricsByCategory: Record<string, CategoryMetrics>;
  metricsByDifficulty: Record<string, CategoryMetrics>;
}

/**
 * Complete results from an evaluation run
 */
export interface EvaluationResults {
  evaluation_id: string;
  agent_name: string;
  agent_endpoint: string;
  model_name: string;
  benchmark_name: string;
  benchmark_version: string;
  timestamp: Date;
  test_cases: TestCase[];
  execution_results: ExecutionResult[];
  comparison_results: ComparisonResult[];
  metrics: Metrics;
}

// ============================================================================
// Re-export from loaders
// ============================================================================

export { DatasetLoader, DatasetFilters } from './loaders/dataset_loader';

// ============================================================================
// Placeholder classes (to be implemented in separate files)
// ============================================================================

/**
 * Base interface for result exporters
 */
export abstract class Exporter {
  abstract exportResults(results: EvaluationResults): Promise<boolean>;
}
