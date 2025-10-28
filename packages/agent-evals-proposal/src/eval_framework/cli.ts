#!/usr/bin/env ts-node

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CLI for Agent Evaluation Framework
 *
 * Usage:
 *   npm run eval -- run --benchmark benchmarks/text_to_ppl/test_cases.json --models sonnet-4,haiku-4.5
 *   npm run eval -- run --agent osd-agents-local --models sonnet-4 --limit 10
 *   npm run eval -- list-models
 *   npm run eval -- list-benchmarks
 */

import * as path from 'path';
import { MultiModelRunner } from './runners/multi_model_runner';
import { ConfigLoader } from './config/config_loader';
import { FailedTestsTracker } from './utils/failed_tests_tracker';
import { DatasetLoader } from './runner';

/**
 * Parse command line arguments manually (lightweight approach)
 */
interface CLIArgs {
  command: string;
  agent?: string;
  models?: string[];
  benchmark?: string;
  output?: string;
  parallel?: boolean;
  limit?: number;
  difficulty?: string;
  category?: string;
  tests?: string;
  failedOnly?: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: CLIArgs = {
    command: args[0] || 'help',
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--agent':
      case '-a':
        parsed.agent = next;
        i++;
        break;
      case '--models':
      case '-m':
        parsed.models = next ? next.split(',').map((m) => m.trim()) : [];
        i++;
        break;
      case '--benchmark':
      case '-b':
        parsed.benchmark = next;
        i++;
        break;
      case '--output':
      case '-o':
        parsed.output = next;
        i++;
        break;
      case '--parallel':
      case '-p':
        parsed.parallel = true;
        break;
      case '--limit':
      case '-l':
        parsed.limit = parseInt(next, 10);
        i++;
        break;
      case '--difficulty':
      case '-d':
        parsed.difficulty = next;
        i++;
        break;
      case '--category':
      case '-c':
        parsed.category = next;
        i++;
        break;
      case '--tests':
      case '-t':
        parsed.tests = next;
        i++;
        break;
      case '--failed-only':
      case '-f':
        parsed.failedOnly = true;
        break;
    }
  }

  return parsed;
}

/**
 * Parse test selection string into array of indices
 *
 * Supports:
 * - Single index: "5" → [5]
 * - Multiple indices: "5,10,15" → [5, 10, 15]
 * - Ranges: "5-10" → [5, 6, 7, 8, 9, 10]
 * - Combined: "5,10,15-20" → [5, 10, 15, 16, 17, 18, 19, 20]
 *
 * @param selection Test selection string
 * @returns Array of test indices (0-based)
 */
function parseTestSelection(selection: string): number[] {
  const indices = new Set<number>();

  // Split by comma
  const parts = selection.split(',').map((s) => s.trim());

  for (const part of parts) {
    if (part.includes('-')) {
      // Range: "5-10"
      const [startStr, endStr] = part.split('-').map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (isNaN(start) || isNaN(end)) {
        throw new Error(`Invalid range: "${part}". Expected format: "start-end" (e.g., "5-10")`);
      }

      if (start > end) {
        throw new Error(
          `Invalid range: "${part}". Start index (${start}) must be <= end index (${end})`
        );
      }

      // Add all indices in range (inclusive)
      for (let i = start; i <= end; i++) {
        indices.add(i);
      }
    } else {
      // Single index: "5"
      const index = parseInt(part, 10);

      if (isNaN(index)) {
        throw new Error(`Invalid test index: "${part}". Expected a number.`);
      }

      indices.add(index);
    }
  }

  // Convert Set to sorted array
  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Show help message
 */
function showHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║              Agent Evaluation Framework - CLI                             ║
╚═══════════════════════════════════════════════════════════════════════════╝

USAGE:
  npm run eval -- <command> [options]

COMMANDS:
  run                 Run evaluation on specified benchmark
  list-models         List available models
  list-agents         List available agents
  list-benchmarks     List available benchmarks
  help                Show this help message

OPTIONS:
  --agent, -a         Agent name (default: osd-agents-local)
  --models, -m        Comma-separated list of models (e.g., sonnet-4,haiku-4.5)
  --benchmark, -b     Path to benchmark file
  --output, -o        Output directory for reports (default: ./reports)
  --parallel, -p      Run models in parallel
  --limit, -l         Limit number of test cases
  --difficulty, -d    Filter by difficulty (easy, medium, hard)
  --category, -c      Filter by category (e.g., text-to-ppl)
  --tests, -t         Run specific test indices or ranges (e.g., 5,10,15-20)
  --failed-only, -f   Re-run only failed tests from previous run

EXAMPLES:
  # Run evaluation on all test cases with multiple models
  npm run eval -- run --benchmark benchmarks/text_to_ppl/test_cases.json --models sonnet-4,sonnet-4.5,haiku-4.5

  # Run evaluation with specific agent and model
  npm run eval -- run --agent osd-agents-local --models sonnet-4 --limit 10

  # Filter by difficulty
  npm run eval -- run --benchmark benchmarks/text_to_ppl/test_cases.json --models haiku-4.5 --difficulty easy

  # Run specific test range (skip first 5 tests, run tests 5-10)
  npm run eval -- run --benchmark benchmarks/text_to_ppl/test_cases.json --models haiku-4.5 --tests 5-10

  # Run specific tests by index
  npm run eval -- run --benchmark benchmarks/text_to_ppl/test_cases.json --models haiku-4.5 --tests 5,10,15-20

  # Re-run only failed tests from previous run
  npm run eval -- run --benchmark benchmarks/text_to_ppl/test_cases.json --models haiku-4.5 --failed-only

  # Combine filters (failed tests that are also "hard")
  npm run eval -- run --benchmark benchmarks/text_to_ppl/test_cases.json --models haiku-4.5 --failed-only --difficulty hard

  # List available models
  npm run eval -- list-models

  # List available agents
  npm run eval -- list-agents
`);
}

/**
 * List available models
 */
async function listModels(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n📦 Available Models:\n');

  const modelNames = ConfigLoader.getAllModelNames();

  modelNames.forEach((modelName) => {
    const config = ConfigLoader.getModelConfig(modelName);
    if (config) {
      // eslint-disable-next-line no-console
      console.log(`  • ${modelName.padEnd(20)} - ${config.display_name}`);
      // eslint-disable-next-line no-console
      console.log(`    Model ID: ${config.model_id}`);
      // eslint-disable-next-line no-console
      console.log(`    Context: ${config.context_window.toLocaleString()} tokens`);
      // eslint-disable-next-line no-console
      console.log('');
    }
  });
}

/**
 * List available agents
 */
async function listAgents(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n🤖 Available Agents:\n');

  const agents = ConfigLoader.getEnabledAgents();

  agents.forEach((agent) => {
    // eslint-disable-next-line no-console
    console.log(`  • ${agent.name.padEnd(20)} - ${agent.description || 'No description'}`);
    // eslint-disable-next-line no-console
    console.log(`    Endpoint: ${agent.endpoint}`);
    // eslint-disable-next-line no-console
    console.log(`    Models: ${agent.models.join(', ')}`);
    // eslint-disable-next-line no-console
    console.log('');
  });
}

/**
 * List available benchmarks
 */
async function listBenchmarks(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n📊 Available Benchmarks:\n');

  const benchmarks = [
    {
      name: 'text-to-ppl',
      path: 'benchmarks/text_to_ppl/test_cases.json',
      description: 'Text to PPL query conversion (50 cases)',
    },
    {
      name: 'observability',
      path: 'benchmarks/observability/test_cases.json',
      description: 'Observability scenarios (placeholder)',
    },
  ];

  benchmarks.forEach((benchmark) => {
    // eslint-disable-next-line no-console
    console.log(`  • ${benchmark.name}`);
    // eslint-disable-next-line no-console
    console.log(`    Path: ${benchmark.path}`);
    // eslint-disable-next-line no-console
    console.log(`    Description: ${benchmark.description}`);
    // eslint-disable-next-line no-console
    console.log('');
  });
}

/**
 * Run evaluation
 */
async function runEvaluation(args: CLIArgs): Promise<void> {
  // Validate required arguments
  if (!args.benchmark) {
    // eslint-disable-next-line no-console
    console.error('❌ Error: --benchmark is required for run command\n');
    showHelp();
    process.exit(1);
  }

  if (!args.models || args.models.length === 0) {
    // eslint-disable-next-line no-console
    console.error('❌ Error: --models is required for run command\n');
    showHelp();
    process.exit(1);
  }

  // Default agent
  const agent = args.agent || 'osd-agents-local';

  // Resolve benchmark path
  const benchmarkPath = path.isAbsolute(args.benchmark)
    ? args.benchmark
    : path.join(process.cwd(), args.benchmark);

  // eslint-disable-next-line no-console
  console.log(`\n🚀 Starting evaluation...`);
  // eslint-disable-next-line no-console
  console.log(`Agent: ${agent}`);
  // eslint-disable-next-line no-console
  console.log(`Models: ${args.models.join(', ')}`);
  // eslint-disable-next-line no-console
  console.log(`Benchmark: ${benchmarkPath}`);
  if (args.limit) {
    // eslint-disable-next-line no-console
    console.log(`Limit: ${args.limit} test cases`);
  }
  if (args.difficulty) {
    // eslint-disable-next-line no-console
    console.log(`Difficulty filter: ${args.difficulty}`);
  }
  if (args.category) {
    // eslint-disable-next-line no-console
    console.log(`Category filter: ${args.category}`);
  }

  // Handle test indices
  let testIndices: number[] | undefined;

  // Process --tests flag
  if (args.tests) {
    try {
      testIndices = parseTestSelection(args.tests);
      // eslint-disable-next-line no-console
      console.log(`Test indices: [${testIndices.join(', ')}]`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error(`❌ Error parsing --tests: ${errorMessage}\n`);
      process.exit(1);
    }
  }

  // Process --failed-only flag
  if (args.failedOnly) {
    try {
      // Use first model for failed tests file name
      const modelName = args.models[0];

      // Check if failed tests file exists
      if (!FailedTestsTracker.hasFailedTestsFile(modelName)) {
        // eslint-disable-next-line no-console
        console.error(`❌ Error: No failed tests file found for model "${modelName}"`);
        // eslint-disable-next-line no-console
        console.error(
          `   Run evaluation first to generate .failed-tests-${modelName}.json file.\n`
        );
        process.exit(1);
      }

      // Load failed test IDs
      const failedTestIds = FailedTestsTracker.loadFailedTests(modelName);

      if (failedTestIds.length === 0) {
        // eslint-disable-next-line no-console
        console.log(`✅ No failed tests found in previous run. Nothing to re-run!\n`);
        process.exit(0);
      }

      // Load all test cases to convert IDs to indices
      const datasetLoader = new DatasetLoader();
      const allTestCases = await datasetLoader.loadBenchmark(benchmarkPath);

      // Convert failed test IDs to indices
      testIndices = FailedTestsTracker.getFailedTestIndices(allTestCases, failedTestIds);

      if (testIndices.length === 0) {
        // eslint-disable-next-line no-console
        console.error(`❌ Error: Could not find any of the failed tests in the benchmark\n`);
        process.exit(1);
      }

      // eslint-disable-next-line no-console
      console.log(`Re-running ${testIndices.length} failed tests`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error(`❌ Error loading failed tests: ${errorMessage}\n`);
      process.exit(1);
    }
  }

  try {
    // Create multi-model runner
    const runner = new MultiModelRunner({
      agent_name: agent,
      model_names: args.models,
      benchmark_path: benchmarkPath,
      output_dir: args.output || './reports',
      parallel_execution: args.parallel || false,
      limit: args.limit,
      difficulty: args.difficulty,
      category: args.category,
      test_indices: testIndices,
    });

    // Run evaluation
    const results = await runner.run();

    // Show winners
    const winners = runner.getWinners(results);
    // eslint-disable-next-line no-console
    console.log(`\n🏆 Winners:`);
    // eslint-disable-next-line no-console
    console.log(`  💰 Lowest Cost: ${winners.lowest_cost}`);
    // eslint-disable-next-line no-console
    console.log(`  ⚡ Fastest: ${winners.fastest}`);
    // eslint-disable-next-line no-console
    console.log(`  ✅ Most Accurate: ${winners.most_accurate}`);

    // eslint-disable-next-line no-console
    console.log(`\n✅ Evaluation complete! Check ./reports for HTML reports.\n`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`\n❌ Error: ${errorMessage}\n`);
    process.exit(1);
  }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();

  switch (args.command) {
    case 'run':
      await runEvaluation(args);
      break;
    case 'list-models':
      await listModels();
      break;
    case 'list-agents':
      await listAgents();
      break;
    case 'list-benchmarks':
      await listBenchmarks();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

// Run CLI
if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
