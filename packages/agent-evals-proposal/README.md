# Agent Evaluation Framework

A comprehensive TypeScript-based evaluation framework for AI agents using the AG UI protocol.

## Features

✅ **Multi-Model Comparison** - Test across Claude Sonnet 4, 4.5, and Haiku 4.5
✅ **Comprehensive Metrics** - Accuracy, latency (P50/P95/P99), cost tracking
✅ **AG UI Protocol** - Native integration with AG UI HTTP endpoints
✅ **HTML Reports** - Dark-themed comparison tables matching industry standards
✅ **Interactive Test Viewer** - Searchable, filterable test cases with expand/collapse
✅ **PPL Validation** - Syntax checking and semantic similarity for OpenSearch PPL
✅ **50 Test Cases** - Complete text-to-PPL benchmark suite
✅ **CLI Interface** - Simple command-line interface for running evaluations
✅ **Test Range Selection** - Run specific test indices or ranges (e.g., `--tests 5-10`)
✅ **Failed Tests Tracking** - Automatically save and re-run only failed tests

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Your AG UI Agent

Make sure your AG UI agent is running (e.g., at `http://localhost:3000`).

### 3. Run Evaluation

```bash
# All tests
npm run eval -- run --benchmark benchmarks/text_to_ppl/test_cases.json --models sonnet-4,sonnet-4.5,haiku-4.5 --parallel

# Quick test (5 cases, single model)
npm run eval:quick

# Full evaluation (50 cases, all 3 models)
npm run eval:text-to-ppl

# Custom evaluation
npm run eval -- run \
  --benchmark benchmarks/text_to_ppl/test_cases.json \
  --models claude-sonnet-4,claude-sonnet-4.5,claude-haiku-4.5 \
  --limit 10
```

### 4. View Results

Open the generated HTML reports:

**Multi-Model Comparison** (`reports/multi-model-comparison.html`):
- **Model Cost Comparison** - Avg, min, max, and total cost per model
- **Model Latency Comparison** - Avg, min, max, P50, P95 latency
- **Model Accuracy Comparison** - Success rate, exact match, syntax valid, semantic similarity

**Test Cases Viewer** (`reports/test-cases-{model-name}.html`):
- **Interactive Test Case Browser** - Expandable cards for each test case
- **Search & Filter** - Search by text, filter by status/difficulty/category
- **Side-by-Side Comparison** - Expected vs actual output with syntax highlighting
- **Detailed Metrics** - Latency, cost, exact match, semantic similarity per test
- **Visual Status Indicators** - Color-coded pass/fail badges

## CLI Usage

```bash
# List available commands
npm run eval -- help

# List available models
npm run list:models

# List available agents
npm run list:agents

# Run with filters
npm run eval -- run \
  --benchmark benchmarks/text_to_ppl/test_cases.json \
  --models claude-sonnet-4 \
  --difficulty easy \
  --limit 5
```

## Advanced Usage

### Running Specific Test Ranges

Use the `--tests` flag to run specific test indices or ranges. This is useful for:
- **Skipping tests that always pass** (e.g., the first 5 tests)
- **Focusing on specific failing tests** without running the entire suite
- **Testing incremental changes** on a subset of tests

```bash
# Run tests 5 through 10 (skip first 5 tests)
npm run eval -- run \
  --benchmark benchmarks/text_to_ppl/test_cases.json \
  --models haiku-4.5 \
  --tests 5-10

# Run specific tests by index
npm run eval -- run \
  --benchmark benchmarks/text_to_ppl/test_cases.json \
  --models haiku-4.5 \
  --tests 5,10,15

# Run combined ranges and specific tests
npm run eval -- run \
  --benchmark benchmarks/text_to_ppl/test_cases.json \
  --models haiku-4.5 \
  --tests 5,10,15-20

# Using the convenience script
npm run eval:range -- 5-10
```

**Test Indices:**
- Test indices are **0-based** (first test is index 0)
- Ranges are **inclusive** (5-10 includes tests 5, 6, 7, 8, 9, 10)
- Can combine individual tests and ranges with commas

### Re-running Failed Tests

The framework automatically tracks failed tests after each evaluation run. Use the `--failed-only` flag to re-run only the tests that failed in the previous run.

```bash
# First run - some tests may fail
npm run eval -- run \
  --benchmark benchmarks/text_to_ppl/test_cases.json \
  --models haiku-4.5

# Failed tests are saved to: reports/.failed-tests-haiku-4.5.json

# Re-run only the failed tests
npm run eval -- run \
  --benchmark benchmarks/text_to_ppl/test_cases.json \
  --models haiku-4.5 \
  --failed-only

# Using the convenience script
npm run eval:failed
```

**Failed Tests Tracking:**
- Failed test IDs are automatically saved to `reports/.failed-tests-{model}.json`
- Each model has its own failed tests file
- Combines with other filters (e.g., `--failed-only --difficulty hard`)
- If no tests failed, you'll see: `✅ No failed tests found in previous run!`

### Combining Filters

You can combine the new flags with existing filters for powerful test selection:

```bash
# Re-run failed tests that are also marked as "hard"
npm run eval -- run \
  --benchmark benchmarks/text_to_ppl/test_cases.json \
  --models haiku-4.5 \
  --failed-only \
  --difficulty hard

# Run specific test range with category filter
npm run eval -- run \
  --benchmark benchmarks/text_to_ppl/test_cases.json \
  --models sonnet-4 \
  --tests 10-20 \
  --category text-to-ppl
```

## Configuration

### Agent Endpoints

Edit `config/agents.yaml`:

```yaml
agents:
  - name: osd-agents-local
    endpoint: http://localhost:3000  # Your AG UI endpoint
    timeout_ms: 60000
    models:
      - claude-sonnet-4
      - claude-sonnet-4.5
      - claude-haiku-4.5
```

### Model Pricing

Edit `config/pricing.yaml` to update token costs:

```yaml
pricing:
  claude-sonnet-4:
    input_per_1k: 0.003   # $3 per 1M input tokens
    output_per_1k: 0.015  # $15 per 1M output tokens
```

## Architecture

```
src/eval_framework/
├── cli.ts                         # CLI entry point
├── runner.ts                      # Core data models
├── config/
│   └── config_loader.ts           # YAML configuration
├── clients/
│   └── ag_ui_client.ts            # AG UI HTTP + SSE streaming
├── executors/
│   └── agent_executor.ts          # Test execution with retries
├── evaluators/
│   └── deterministic_evaluator.ts # PPL syntax + semantic validation
├── metrics/
│   └── metrics_calculator.ts      # Percentiles + cost aggregation
├── reporters/
│   └── html_reporter.ts           # Dark-themed HTML reports
└── runners/
    └── multi_model_runner.ts      # Multi-model orchestration
```

## Example Output

```
📊 MULTI-MODEL COMPARISON SUMMARY
================================================================================

💰 Cost Comparison:
────────────────────────────────────────────────────────────────────────────
Model                     Avg Cost         Total Cost
────────────────────────────────────────────────────────────────────────────
Claude Sonnet 4           $0.0234          $1.1700
Claude Sonnet 4.5         $0.0245          $1.2250
Claude Haiku 4.5          $0.0089          $0.4450

⏱  Latency Comparison (ms):
────────────────────────────────────────────────────────────────────────────
Model                     Avg        P50        P95
────────────────────────────────────────────────────────────────────────────
Claude Sonnet 4           2340       2200       3100
Claude Sonnet 4.5         2180       2050       2900
Claude Haiku 4.5          1560       1450       2100

✅ Accuracy Comparison:
────────────────────────────────────────────────────────────────────────────
Model                     Success Rate    Syntax Valid
────────────────────────────────────────────────────────────────────────────
Claude Sonnet 4           94.0%          96.0%
Claude Sonnet 4.5         96.0%          98.0%
Claude Haiku 4.5          88.0%          92.0%

🏆 Winners:
  💰 Lowest Cost: Claude Haiku 4.5
  ⚡ Fastest: Claude Haiku 4.5
  ✅ Most Accurate: Claude Sonnet 4.5
```

## Test Cases Viewer

The framework generates an interactive test cases viewer for detailed inspection of each test execution.

### Features

**Summary Dashboard**
- Pass/fail counts and pass rate
- Total test cases executed
- Visual cards with key metrics

**Interactive Filtering**
- 🔍 **Search** - Full-text search across all test content
- ✅/❌ **Status Filter** - Show only passed or failed tests
- 🎯 **Difficulty Filter** - Filter by easy/medium/hard
- 📂 **Category Filter** - Filter by test category
- **Keyboard Shortcut** - Press Ctrl/Cmd+F to focus search

**Expandable Test Cards**
Each test case displays:
- Test ID with status badge (✅ PASS / ❌ FAIL)
- Difficulty badge (color-coded)
- Quick metrics: latency and cost
- Click to expand for full details

**Detailed Test View** (when expanded):
- 🎯 **Query** - The natural language input
- 📋 **Context** - Index and available fields
- ✨ **Expected Output** - Reference PPL query
- 🤖 **Actual Output** - Agent-generated PPL query
- 📊 **Evaluation Metrics**:
  - Exact match status
  - Syntax validation result
  - Semantic similarity score
  - Execution latency
  - API cost

**Side-by-Side Comparison**
- Expected vs actual output in adjacent columns
- Color-coded borders (green for pass, red for fail)
- Syntax highlighting for better readability

### Usage

The test cases report is automatically generated for each model:

```bash
npm run eval:quick
# Opens: reports/test-cases-claude-haiku-4.5.html

npm run eval:text-to-ppl
# Opens: reports/test-cases-claude-sonnet-4.html
#        reports/test-cases-claude-sonnet-4.5.html
#        reports/test-cases-claude-haiku-4.5.html
```

Click any test case card to expand and view detailed information.

## Test Cases

### Text-to-PPL Benchmark (50 cases)

Located in `benchmarks/text_to_ppl/test_cases.json`:

- **Basic Filters** (10 cases) - Simple WHERE clauses
- **Aggregations** (10 cases) - stats, count, avg, sum
- **Time Filters** (10 cases) - Timestamp-based queries
- **Sorting** (10 cases) - ORDER BY operations
- **Pattern Matching** (10 cases) - LIKE, regex patterns

Example test case:

```json
{
  "id": "text-to-ppl-001",
  "category": "text-to-ppl",
  "difficulty": "easy",
  "input": {
    "query": "Generate a PPL query to show all ERROR logs in the last hour",
    "context": {
      "task": "generate_ppl_query",
      "index": "ai-agent-logs*",
      "available_fields": ["timestamp", "level", "message"]
    }
  },
  "expected_output": {
    "ppl_query": "source=ai-agent-logs* | where level='ERROR' AND timestamp > now() - 1h"
  },
  "evaluation_criteria": {
    "primary_metric": "syntax_valid",
    "syntax_valid": true
  }
}
```

**Important:** For PPL generation tests, explicitly instruct the agent to "Generate a PPL query" in the query field and include `"task": "generate_ppl_query"` in the context. This ensures the agent generates PPL syntax rather than executing queries.

## Evaluation Metrics

### Accuracy Metrics
- **Success Rate** - Percentage of tests passing primary metric
- **Exact Match Rate** - Percentage of exact string matches
- **Syntax Valid Rate** - Percentage passing syntax validation
- **Semantic Similarity** - Token-based Jaccard similarity (0-1)
  - Calculated as: intersection_size / union_size of normalized tokens
  - Queries are normalized (lowercase, whitespace, operators)
  - Score of 1.0 = identical queries, 0.0 = completely different
  - Note: This is a simplified implementation; for production, consider using embeddings

### Latency Metrics
- **Average, Min, Max** - Basic latency statistics
- **P50, P95, P99** - Percentile latencies for SLA tracking

### Cost Metrics
- **Total Cost** - Sum across all tests
- **Average Cost** - Cost per test case
- **Min/Max Cost** - Range of costs observed

## PPL Query Extraction

The framework uses a multi-pattern extraction strategy to reliably extract PPL queries from agent responses:

1. **Code Blocks** - Looks for queries in markdown code blocks:
   ```
   ```ppl
   source=logs-* | where level='ERROR'
   ```
   ```

2. **Inline Code** - Extracts queries wrapped in backticks:
   ```
   `source=logs-* | where level='ERROR'`
   ```

3. **Plain Text** - Matches PPL patterns in plain text with pipe support:
   ```
   source=logs-* | where level='ERROR' | stats count()
   ```

The extractor tries each pattern in order and returns the first match. This ensures reliable extraction regardless of how the agent formats its response.

## Troubleshooting

### Agent Server Not Running

If you see the evaluation pausing or timing out, ensure your AG UI agent server is running:

```bash
# The agent must be accessible at the configured endpoint
# Default: http://localhost:3000
```

Check `config/agents.yaml` to verify the endpoint matches your running server.

### Token Usage Warnings

If you see warnings about token usage estimation:
```
Token usage not found in events, using rough estimation based on character count
```

This means the AG UI response doesn't include token usage in the events. The framework will estimate tokens based on character count (≈4 chars per token). To get accurate token counts, ensure your AG UI server returns token usage in the RUN_FINISHED event.

### Model Names

The framework supports both full and short model names:

**Full names:**
- `claude-sonnet-4` - Claude Sonnet 4
- `claude-sonnet-4.5` - Claude Sonnet 4.5
- `claude-haiku-4.5` - Claude Haiku 4.5

**Short aliases (convenient):**
- `sonnet-4` - Same as claude-sonnet-4
- `sonnet-4.5` - Same as claude-sonnet-4.5
- `haiku-4.5` - Same as claude-haiku-4.5

Both styles work identically:
```bash
# These are equivalent
npm run eval:quick -- --models claude-sonnet-4
npm run eval:quick -- --models sonnet-4

# Mix and match
npm run eval -- run --benchmark benchmarks/text_to_ppl/test_cases.json --models sonnet-4,haiku-4.5
```

## Development

### Build

```bash
npm run build
```

### Clean

```bash
npm run clean
```

### Add New Benchmark

1. Create test cases JSON in `benchmarks/your-category/test_cases.json`
2. Follow the schema in `benchmark_schema.json`
3. Run: `npm run eval -- run --benchmark benchmarks/your-category/test_cases.json --models claude-haiku-4.5`

## License

Apache 2.0

## Contributing

This is currently in the `agent-evals-proposal` package and may become an independent repository at https://github.com/ag-ui-protocol/ag-ui/middlewares/.
