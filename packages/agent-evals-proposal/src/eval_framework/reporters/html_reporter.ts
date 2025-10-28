/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * HTML Reporter
 *
 * Generates HTML reports matching the screenshot format with:
 * - Model Cost Comparison Table
 * - Model Latency Comparison Table
 * - Detailed test results
 * - Dark theme styling
 */

import * as fs from 'fs';
import * as path from 'path';
import { EvaluationResults, Metrics } from '../runner';
import { Exporter } from '../runner';

/**
 * Model comparison data for reports
 */
export interface ModelComparisonData {
  model_name: string;
  display_name: string;
  metrics: Metrics;
  test_count: number;
}

/**
 * HTML reporter configuration
 */
export interface HTMLReporterConfig {
  output_dir?: string;
  output_filename?: string;
  include_detailed_results?: boolean;
  dark_theme?: boolean;
}

/**
 * Generates HTML evaluation reports
 */
export class HTMLReporter extends Exporter {
  private config: HTMLReporterConfig;

  constructor(config: HTMLReporterConfig = {}) {
    super();
    this.config = {
      output_dir: './reports',
      output_filename: 'evaluation-report.html',
      include_detailed_results: true,
      dark_theme: true,
      ...config,
    };
  }

  /**
   * Export evaluation results as HTML report
   */
  async exportResults(results: EvaluationResults): Promise<boolean> {
    try {
      // Ensure output directory exists
      if (!fs.existsSync(this.config.output_dir!)) {
        fs.mkdirSync(this.config.output_dir!, { recursive: true });
      }

      // Generate HTML content
      const html = this.generateHTML(
        [
          {
            model_name: results.model_name,
            display_name: results.model_name,
            metrics: results.metrics,
            test_count: results.test_cases.length,
          },
        ],
        results
      );

      // Write to file
      const outputPath = path.join(this.config.output_dir!, this.config.output_filename!);
      fs.writeFileSync(outputPath, html, 'utf-8');

      const absolutePath = path.resolve(outputPath);
      const fileUrl = `file://${absolutePath}`;
      // eslint-disable-next-line no-console
      console.log(`\n📊 HTML report generated:`);
      // eslint-disable-next-line no-console
      console.log(`   ${fileUrl}\n`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error(`Failed to export HTML report: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Export multi-model comparison report
   */
  async exportMultiModelReport(
    modelsData: ModelComparisonData[],
    outputFilename: string = 'multi-model-comparison.html'
  ): Promise<boolean> {
    try {
      // Ensure output directory exists
      if (!fs.existsSync(this.config.output_dir!)) {
        fs.mkdirSync(this.config.output_dir!, { recursive: true });
      }

      // Generate HTML content
      const html = this.generateHTML(modelsData);

      // Write to file
      const outputPath = path.join(this.config.output_dir!, outputFilename);
      fs.writeFileSync(outputPath, html, 'utf-8');

      const absolutePath = path.resolve(outputPath);
      const fileUrl = `file://${absolutePath}`;
      // eslint-disable-next-line no-console
      console.log(`\n📊 Multi-model HTML report generated:`);
      // eslint-disable-next-line no-console
      console.log(`   ${fileUrl}\n`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error(`Failed to export multi-model HTML report: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Export detailed test cases viewer page
   */
  async exportTestCasesReport(
    results: EvaluationResults,
    outputFilename: string = 'test-cases.html'
  ): Promise<boolean> {
    try {
      // Ensure output directory exists
      if (!fs.existsSync(this.config.output_dir!)) {
        fs.mkdirSync(this.config.output_dir!, { recursive: true });
      }

      // Generate HTML content
      const html = this.generateTestCasesHTML(results);

      // Write to file
      const outputPath = path.join(this.config.output_dir!, outputFilename);
      fs.writeFileSync(outputPath, html, 'utf-8');

      const absolutePath = path.resolve(outputPath);
      const fileUrl = `file://${absolutePath}`;
      // eslint-disable-next-line no-console
      console.log(`\n📋 Test cases report generated:`);
      // eslint-disable-next-line no-console
      console.log(`   ${fileUrl}\n`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error(`Failed to export test cases report: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Generate complete HTML document
   */
  private generateHTML(
    modelsData: ModelComparisonData[],
    detailedResults?: EvaluationResults
  ): string {
    const title =
      modelsData.length > 1 ? 'Multi-Model Evaluation Comparison' : 'Agent Evaluation Report';

    const timestamp = new Date().toLocaleString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    ${this.generateStyles()}
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>${title}</h1>
            <p class="timestamp">Generated: ${timestamp}</p>
        </header>

        ${this.generateCostComparisonTable(modelsData)}
        ${this.generateLatencyComparisonTable(modelsData)}
        ${this.generateAccuracyComparisonTable(modelsData)}
        ${this.generateEfficiencyComparisonTable(modelsData)}
        ${
          detailedResults && this.config.include_detailed_results
            ? this.generateDetailedResults(detailedResults)
            : ''
        }
    </div>

    ${this.generateScripts()}
</body>
</html>`;
  }

  /**
   * Generate CSS styles (dark theme)
   */
  private generateStyles(): string {
    return `<style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a1a;
            color: #e0e0e0;
            line-height: 1.6;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        .header {
            background: #2d2d2d;
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 30px;
            border: 1px solid #404040;
        }

        .header h1 {
            color: #ffffff;
            margin-bottom: 10px;
            font-size: 2rem;
        }

        .timestamp {
            color: #888;
            font-size: 0.9rem;
        }

        .section {
            background: #2d2d2d;
            padding: 25px;
            border-radius: 8px;
            margin-bottom: 25px;
            border: 1px solid #404040;
        }

        .section-title {
            color: #ffffff;
            font-size: 1.5rem;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
        }

        .section-title::before {
            content: '';
            display: inline-block;
            width: 4px;
            height: 24px;
            background: #4CAF50;
            margin-right: 12px;
            border-radius: 2px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            background: #252525;
            border-radius: 8px;
            overflow: hidden;
        }

        thead {
            background: #1a1a1a;
        }

        th, td {
            padding: 12px 16px;
            text-align: left;
            border-bottom: 1px solid #404040;
        }

        th {
            color: #ffffff;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.85rem;
            letter-spacing: 0.5px;
        }

        td {
            color: #e0e0e0;
        }

        tr:last-child td {
            border-bottom: none;
        }

        tbody tr:hover {
            background: #2d2d2d;
        }

        .model-name {
            font-weight: 600;
            color: #4CAF50;
        }

        .metric-value {
            font-family: 'Courier New', monospace;
        }

        .cost-value {
            color: #FFA726;
        }

        .latency-value {
            color: #42A5F5;
        }

        .accuracy-value {
            color: #66BB6A;
        }

        .success-badge {
            background: #4CAF50;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.85rem;
            display: inline-block;
        }

        .failure-badge {
            background: #F44336;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.85rem;
            display: inline-block;
        }

        .test-details {
            margin-top: 30px;
        }

        .test-case {
            background: #252525;
            padding: 20px;
            border-radius: 6px;
            margin-bottom: 15px;
            border-left: 4px solid #4CAF50;
        }

        .test-case.failed {
            border-left-color: #F44336;
        }

        .test-case-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .test-case-id {
            font-weight: 600;
            color: #4CAF50;
        }

        .test-case-content {
            color: #b0b0b0;
            font-size: 0.95rem;
        }

        .code-block {
            background: #1a1a1a;
            padding: 12px;
            border-radius: 4px;
            margin-top: 10px;
            overflow-x: auto;
        }

        .code-block code {
            font-family: 'Courier New', monospace;
            color: #b0b0b0;
            font-size: 0.9rem;
        }

        @media (max-width: 768px) {
            body {
                padding: 10px;
            }

            .header {
                padding: 20px;
            }

            .section {
                padding: 15px;
            }

            table {
                font-size: 0.85rem;
            }

            th, td {
                padding: 8px 10px;
            }
        }
    </style>`;
  }

  /**
   * Generate Model Cost Comparison Table
   */
  private generateCostComparisonTable(modelsData: ModelComparisonData[]): string {
    const rows = modelsData
      .map((data) => {
        const metrics = data.metrics;
        return `<tr>
            <td class="model-name">${data.display_name}</td>
            <td class="metric-value">${data.test_count}</td>
            <td class="metric-value cost-value">$${metrics.avgCostPerTest.toFixed(4)}</td>
            <td class="metric-value cost-value">$${metrics.minCostUsd.toFixed(4)}</td>
            <td class="metric-value cost-value">$${metrics.maxCostUsd.toFixed(4)}</td>
            <td class="metric-value cost-value">$${metrics.totalCostUsd.toFixed(4)}</td>
        </tr>`;
      })
      .join('');

    return `<div class="section">
        <h2 class="section-title">Model Cost Comparison</h2>
        <table>
            <thead>
                <tr>
                    <th>Model</th>
                    <th>Tests</th>
                    <th>Avg Cost</th>
                    <th>Min Cost</th>
                    <th>Max Cost</th>
                    <th>Total Cost</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    </div>`;
  }

  /**
   * Generate Model Latency Comparison Table
   */
  private generateLatencyComparisonTable(modelsData: ModelComparisonData[]): string {
    const rows = modelsData
      .map((data) => {
        const metrics = data.metrics;
        return `<tr>
            <td class="model-name">${data.display_name}</td>
            <td class="metric-value latency-value">${(metrics.avgLatencyMs / 1000).toFixed(2)}</td>
            <td class="metric-value latency-value">${(metrics.minLatencyMs / 1000).toFixed(2)}</td>
            <td class="metric-value latency-value">${(metrics.maxLatencyMs / 1000).toFixed(2)}</td>
            <td class="metric-value latency-value">${(metrics.p50LatencyMs / 1000).toFixed(2)}</td>
            <td class="metric-value latency-value">${(metrics.p95LatencyMs / 1000).toFixed(2)}</td>
        </tr>`;
      })
      .join('');

    return `<div class="section">
        <h2 class="section-title">Model Latency Comparison</h2>
        <table>
            <thead>
                <tr>
                    <th>Model</th>
                    <th>Avg (s)</th>
                    <th>Min (s)</th>
                    <th>Max (s)</th>
                    <th>P50 (s)</th>
                    <th>P95 (s)</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    </div>`;
  }

  /**
   * Generate Model Accuracy Comparison Table
   */
  private generateAccuracyComparisonTable(modelsData: ModelComparisonData[]): string {
    const rows = modelsData
      .map((data) => {
        const metrics = data.metrics;
        return `<tr>
            <td class="model-name">${data.display_name}</td>
            <td class="metric-value accuracy-value">${(metrics.successRate * 100).toFixed(1)}%</td>
            <td class="metric-value accuracy-value">${(metrics.exactMatchRate * 100).toFixed(
              1
            )}%</td>
            <td class="metric-value accuracy-value">${(metrics.syntaxValidRate * 100).toFixed(
              1
            )}%</td>
            <td class="metric-value accuracy-value">${metrics.avgSemanticSimilarity.toFixed(2)}</td>
        </tr>`;
      })
      .join('');

    return `<div class="section">
        <h2 class="section-title">Model Accuracy Comparison</h2>
        <table>
            <thead>
                <tr>
                    <th>Model</th>
                    <th>Success Rate</th>
                    <th>Exact Match</th>
                    <th>Syntax Valid</th>
                    <th>Semantic Similarity</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    </div>`;
  }

  /**
   * Generate Model Efficiency Comparison Table
   */
  private generateEfficiencyComparisonTable(modelsData: ModelComparisonData[]): string {
    const rows = modelsData
      .map((data) => {
        const metrics = data.metrics;
        return `<tr>
            <td class="model-name">${data.display_name}</td>
            <td class="metric-value">${metrics.avgToolCalls.toFixed(1)}</td>
            <td class="metric-value">${metrics.minToolCalls}</td>
            <td class="metric-value">${metrics.maxToolCalls}</td>
            <td class="metric-value">${metrics.avgLlmCalls.toFixed(1)}</td>
            <td class="metric-value">${metrics.minLlmCalls}</td>
            <td class="metric-value">${metrics.maxLlmCalls}</td>
        </tr>`;
      })
      .join('');

    return `<div class="section">
        <h2 class="section-title">Model Efficiency Comparison</h2>
        <table>
            <thead>
                <tr>
                    <th>Model</th>
                    <th>Avg Tool Calls</th>
                    <th>Min Tool Calls</th>
                    <th>Max Tool Calls</th>
                    <th>Avg LLM Calls</th>
                    <th>Min LLM Calls</th>
                    <th>Max LLM Calls</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    </div>`;
  }

  /**
   * Generate detailed test results section
   */
  private generateDetailedResults(results: EvaluationResults): string {
    const testRows = results.test_cases
      .map((testCase, index) => {
        const execution = results.execution_results[index];
        const comparison = results.comparison_results[index];

        const statusBadge = comparison.success
          ? '<span class="success-badge">PASS</span>'
          : '<span class="failure-badge">FAIL</span>';

        const testClass = comparison.success ? '' : 'failed';

        return `<div class="test-case ${testClass}">
            <div class="test-case-header">
                <span class="test-case-id">${testCase.id}</span>
                ${statusBadge}
            </div>
            <div class="test-case-content">
                <p><strong>Query:</strong> ${testCase.input.query}</p>
                <p><strong>Difficulty:</strong> ${testCase.difficulty}</p>
                <p><strong>Latency:</strong> ${execution.latency_ms}ms</p>
                <p><strong>Cost:</strong> $${execution.cost_usd.toFixed(4)}</p>
                <p><strong>Tool Calls:</strong> ${execution.tool_calls_count || 0} ${
          execution.tool_calls_by_type
            ? `(${Object.entries(execution.tool_calls_by_type)
                .map(([name, count]) => `${name}: ${count}`)
                .join(', ')})`
            : ''
        }</p>
                <p><strong>LLM Calls:</strong> ${execution.llm_calls_count || 0}</p>
                ${
                  execution.error
                    ? `<p style="color: #F44336;"><strong>Error:</strong> ${execution.error}</p>`
                    : ''
                }
                <div class="code-block">
                    <strong>Expected PPL:</strong>
                    <code>${testCase.expected_output.ppl_query || 'N/A'}</code>
                </div>
                <div class="code-block">
                    <strong>Actual PPL:</strong>
                    <code>${
                      execution.agent_output.ppl_query ||
                      execution.agent_output.query ||
                      JSON.stringify(execution.agent_output, null, 2)
                    }</code>
                </div>
            </div>
        </div>`;
      })
      .join('');

    return `<div class="section">
        <h2 class="section-title">Detailed Test Results</h2>
        <div class="test-details">
            ${testRows}
        </div>
    </div>`;
  }

  /**
   * Generate JavaScript for interactive features
   */
  private generateScripts(): string {
    return `<script>
        // Add any interactive features here
        // eslint-disable-next-line no-console
        console.log('Evaluation report loaded');
    </script>`;
  }

  /**
   * Generate complete test cases HTML viewer
   */
  private generateTestCasesHTML(results: EvaluationResults): string {
    const timestamp = new Date().toLocaleString();
    const passCount = results.comparison_results.filter((r) => r.success).length;
    const failCount = results.comparison_results.filter((r) => !r.success).length;
    const passRate = ((passCount / results.test_cases.length) * 100).toFixed(1);

    // Get unique difficulties and categories for filters
    const difficulties = Array.from(new Set(results.test_cases.map((tc) => tc.difficulty)));
    const categories = Array.from(new Set(results.test_cases.map((tc) => tc.category)));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Cases - ${results.model_name}</title>
    ${this.generateTestCasesStyles()}
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>📋 Test Cases Execution Report</h1>
            <div class="header-info">
                <div class="info-item">
                    <span class="label">Model:</span>
                    <span class="value">${results.model_name}</span>
                </div>
                <div class="info-item">
                    <span class="label">Agent:</span>
                    <span class="value">${results.agent_name}</span>
                </div>
                <div class="info-item">
                    <span class="label">Generated:</span>
                    <span class="value">${timestamp}</span>
                </div>
            </div>
        </header>

        <div class="summary-cards">
            <div class="summary-card">
                <div class="card-icon">✅</div>
                <div class="card-content">
                    <div class="card-value">${passCount}</div>
                    <div class="card-label">Passed</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="card-icon">❌</div>
                <div class="card-content">
                    <div class="card-value">${failCount}</div>
                    <div class="card-label">Failed</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="card-icon">📊</div>
                <div class="card-content">
                    <div class="card-value">${passRate}%</div>
                    <div class="card-label">Pass Rate</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="card-icon">📝</div>
                <div class="card-content">
                    <div class="card-value">${results.test_cases.length}</div>
                    <div class="card-label">Total Tests</div>
                </div>
            </div>
        </div>

        <div class="filters-section">
            <div class="search-box">
                <input type="text" id="searchInput" placeholder="🔍 Search test cases..." />
            </div>
            <div class="filter-controls">
                <div class="filter-group">
                    <label>Status:</label>
                    <select id="statusFilter">
                        <option value="all">All</option>
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Difficulty:</label>
                    <select id="difficultyFilter">
                        <option value="all">All</option>
                        ${difficulties.map((d) => `<option value="${d}">${d}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Category:</label>
                    <select id="categoryFilter">
                        <option value="all">All</option>
                        ${categories.map((c) => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <button id="resetFilters" class="reset-btn">Reset</button>
            </div>
        </div>

        <div class="test-cases-container" id="testCasesContainer">
            ${this.generateTestCaseCards(results)}
        </div>
    </div>

    ${this.generateTestCasesScripts()}
</body>
</html>`;
  }

  /**
   * Generate test case cards
   */
  private generateTestCaseCards(results: EvaluationResults): string {
    return results.test_cases
      .map((testCase, index) => {
        const execution = results.execution_results[index];
        const comparison = results.comparison_results[index];
        const status = comparison.success ? 'pass' : 'fail';
        const statusIcon = comparison.success ? '✅' : '❌';
        const statusText = comparison.success ? 'PASS' : 'FAIL';

        return `<div class="test-card" data-status="${status}" data-difficulty="${
          testCase.difficulty
        }" data-category="${testCase.category}">
            <div class="test-card-header" onclick="toggleCard(this)">
                <div class="test-card-title">
                    <span class="status-icon ${status}">${statusIcon}</span>
                    <span class="test-id">${testCase.id}</span>
                    <span class="badge difficulty-${testCase.difficulty}">${
          testCase.difficulty
        }</span>
                </div>
                <div class="test-card-metrics">
                    <span class="metric">⏱️ ${execution.latency_ms}ms</span>
                    <span class="metric">💰 $${execution.cost_usd.toFixed(4)}</span>
                    <span class="expand-icon">▼</span>
                </div>
            </div>
            <div class="test-card-body">
                <div class="test-section">
                    <h4>🎯 Query</h4>
                    <div class="query-text">${testCase.input.query}</div>
                </div>

                ${
                  testCase.input.context
                    ? `<div class="test-section">
                    <h4>📋 Context</h4>
                    <div class="context-info">
                        ${
                          testCase.input.context.index
                            ? `<div><strong>Index:</strong> ${testCase.input.context.index}</div>`
                            : ''
                        }
                        ${
                          testCase.input.context.available_fields
                            ? `<div><strong>Fields:</strong> ${testCase.input.context.available_fields.join(
                                ', '
                              )}</div>`
                            : ''
                        }
                    </div>
                </div>`
                    : ''
                }

                <div class="comparison-section">
                    <div class="comparison-column">
                        <h4>✨ Expected Output</h4>
                        <div class="code-block expected">
                            <pre>${this.escapeHtml(
                              testCase.expected_output.ppl_query || 'N/A'
                            )}</pre>
                        </div>
                    </div>
                    <div class="comparison-column">
                        <h4>🤖 Actual Output</h4>
                        <div class="code-block actual ${status}">
                            <pre>${this.escapeHtml(
                              execution.agent_output.ppl_query ||
                                execution.agent_output.query ||
                                execution.error ||
                                JSON.stringify(execution.agent_output, null, 2)
                            )}</pre>
                        </div>
                    </div>
                </div>

                ${
                  execution.error
                    ? `<div class="test-section error-section">
                    <h4>⚠️ Error</h4>
                    <div class="error-text">${execution.error}</div>
                </div>`
                    : ''
                }

                <div class="test-section">
                    <h4>📊 Evaluation Metrics</h4>
                    <div class="metrics-grid">
                        <div class="metric-item">
                            <span class="metric-label">Status:</span>
                            <span class="metric-value status-${status}">${statusText}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">Exact Match:</span>
                            <span class="metric-value">${comparison.exactMatch ? '✅' : '❌'}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">Syntax Valid:</span>
                            <span class="metric-value">${
                              comparison.syntaxValid ? '✅' : '❌'
                            }</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">Semantic Similarity:</span>
                            <span class="metric-value">${
                              comparison.semanticSimilarity?.toFixed(2) || 'N/A'
                            }</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">Latency:</span>
                            <span class="metric-value">${execution.latency_ms}ms</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">Cost:</span>
                            <span class="metric-value">$${execution.cost_usd.toFixed(4)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
      })
      .join('');
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Generate CSS styles for test cases viewer
   */
  private generateTestCasesStyles(): string {
    return `<style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a1a;
            color: #e0e0e0;
            line-height: 1.6;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        .header {
            background: linear-gradient(135deg, #2d2d2d 0%, #1f1f1f 100%);
            padding: 30px;
            border-radius: 12px;
            margin-bottom: 30px;
            border: 1px solid #404040;
        }

        .header h1 {
            color: #ffffff;
            margin-bottom: 15px;
            font-size: 2rem;
        }

        .header-info {
            display: flex;
            gap: 30px;
            flex-wrap: wrap;
        }

        .info-item {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .info-item .label {
            color: #888;
            font-size: 0.9rem;
        }

        .info-item .value {
            color: #4CAF50;
            font-weight: 600;
        }

        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .summary-card {
            background: #2d2d2d;
            padding: 25px;
            border-radius: 12px;
            border: 1px solid #404040;
            display: flex;
            align-items: center;
            gap: 15px;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .summary-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .card-icon {
            font-size: 2.5rem;
        }

        .card-content {
            flex: 1;
        }

        .card-value {
            font-size: 2rem;
            font-weight: 700;
            color: #4CAF50;
        }

        .card-label {
            color: #888;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .filters-section {
            background: #2d2d2d;
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 30px;
            border: 1px solid #404040;
        }

        .search-box {
            margin-bottom: 15px;
        }

        .search-box input {
            width: 100%;
            padding: 12px 20px;
            background: #1a1a1a;
            border: 2px solid #404040;
            border-radius: 8px;
            color: #e0e0e0;
            font-size: 1rem;
            transition: border-color 0.3s;
        }

        .search-box input:focus {
            outline: none;
            border-color: #4CAF50;
        }

        .filter-controls {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            align-items: center;
        }

        .filter-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .filter-group label {
            color: #888;
            font-size: 0.9rem;
        }

        .filter-group select {
            padding: 8px 15px;
            background: #1a1a1a;
            border: 1px solid #404040;
            border-radius: 6px;
            color: #e0e0e0;
            cursor: pointer;
            transition: border-color 0.3s;
        }

        .filter-group select:focus {
            outline: none;
            border-color: #4CAF50;
        }

        .reset-btn {
            padding: 8px 20px;
            background: #404040;
            border: none;
            border-radius: 6px;
            color: #e0e0e0;
            cursor: pointer;
            font-weight: 600;
            transition: background 0.3s;
        }

        .reset-btn:hover {
            background: #4CAF50;
        }

        .test-cases-container {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .test-card {
            background: #2d2d2d;
            border-radius: 12px;
            border: 1px solid #404040;
            overflow: hidden;
            transition: box-shadow 0.3s;
        }

        .test-card:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .test-card[data-status="pass"] {
            border-left: 4px solid #4CAF50;
        }

        .test-card[data-status="fail"] {
            border-left: 4px solid #F44336;
        }

        .test-card-header {
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            user-select: none;
            transition: background 0.2s;
        }

        .test-card-header:hover {
            background: #252525;
        }

        .test-card-title {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .status-icon {
            font-size: 1.5rem;
        }

        .test-id {
            font-weight: 600;
            color: #4CAF50;
            font-size: 1.1rem;
        }

        .badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
        }

        .difficulty-easy {
            background: #4CAF50;
            color: white;
        }

        .difficulty-medium {
            background: #FFA726;
            color: white;
        }

        .difficulty-hard {
            background: #F44336;
            color: white;
        }

        .test-card-metrics {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .metric {
            color: #888;
            font-size: 0.9rem;
        }

        .expand-icon {
            color: #4CAF50;
            font-size: 1.2rem;
            transition: transform 0.3s;
        }

        .test-card.expanded .expand-icon {
            transform: rotate(180deg);
        }

        .test-card-body {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }

        .test-card.expanded .test-card-body {
            max-height: 5000px;
            padding: 0 20px 20px 20px;
        }

        .test-section {
            margin-bottom: 20px;
        }

        .test-section h4 {
            color: #ffffff;
            margin-bottom: 10px;
            font-size: 1rem;
        }

        .query-text {
            background: #1a1a1a;
            padding: 15px;
            border-radius: 8px;
            color: #e0e0e0;
            border-left: 3px solid #4CAF50;
        }

        .context-info {
            background: #1a1a1a;
            padding: 15px;
            border-radius: 8px;
            color: #b0b0b0;
        }

        .context-info div {
            margin-bottom: 8px;
        }

        .context-info strong {
            color: #4CAF50;
            margin-right: 8px;
        }

        .comparison-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }

        .comparison-column h4 {
            margin-bottom: 10px;
        }

        .code-block {
            background: #1a1a1a;
            border-radius: 8px;
            overflow: hidden;
            border: 2px solid #404040;
        }

        .code-block.pass {
            border-color: #4CAF50;
        }

        .code-block.fail {
            border-color: #F44336;
        }

        .code-block pre {
            padding: 15px;
            margin: 0;
            font-family: 'Courier New', monospace;
            color: #e0e0e0;
            font-size: 0.9rem;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .error-section {
            background: #2d1a1a;
            padding: 15px;
            border-radius: 8px;
            border-left: 3px solid #F44336;
        }

        .error-text {
            color: #F44336;
            font-family: 'Courier New', monospace;
        }

        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            background: #1a1a1a;
            padding: 20px;
            border-radius: 8px;
        }

        .metric-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .metric-label {
            color: #888;
            font-size: 0.9rem;
        }

        .metric-value {
            font-weight: 600;
            color: #4CAF50;
        }

        .status-pass {
            color: #4CAF50;
        }

        .status-fail {
            color: #F44336;
        }

        @media (max-width: 768px) {
            .comparison-section {
                grid-template-columns: 1fr;
            }

            .filter-controls {
                flex-direction: column;
                align-items: stretch;
            }

            .filter-group {
                flex-direction: column;
                align-items: stretch;
            }

            .filter-group select {
                width: 100%;
            }
        }
    </style>`;
  }

  /**
   * Generate JavaScript for test cases interactivity
   */
  private generateTestCasesScripts(): string {
    return `<script>
        // Toggle card expansion
        function toggleCard(header) {
            const card = header.parentElement;
            card.classList.toggle('expanded');
        }

        // Filter functionality
        const searchInput = document.getElementById('searchInput');
        const statusFilter = document.getElementById('statusFilter');
        const difficultyFilter = document.getElementById('difficultyFilter');
        const categoryFilter = document.getElementById('categoryFilter');
        const resetBtn = document.getElementById('resetFilters');
        const testCards = document.querySelectorAll('.test-card');

        function applyFilters() {
            const searchTerm = searchInput.value.toLowerCase();
            const statusValue = statusFilter.value;
            const difficultyValue = difficultyFilter.value;
            const categoryValue = categoryFilter.value;

            testCards.forEach(card => {
                const cardText = card.textContent.toLowerCase();
                const cardStatus = card.dataset.status;
                const cardDifficulty = card.dataset.difficulty;
                const cardCategory = card.dataset.category;

                const matchesSearch = cardText.includes(searchTerm);
                const matchesStatus = statusValue === 'all' || cardStatus === statusValue;
                const matchesDifficulty = difficultyValue === 'all' || cardDifficulty === difficultyValue;
                const matchesCategory = categoryValue === 'all' || cardCategory === categoryValue;

                if (matchesSearch && matchesStatus && matchesDifficulty && matchesCategory) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        }

        // Event listeners
        searchInput.addEventListener('input', applyFilters);
        statusFilter.addEventListener('change', applyFilters);
        difficultyFilter.addEventListener('change', applyFilters);
        categoryFilter.addEventListener('change', applyFilters);

        resetBtn.addEventListener('click', () => {
            searchInput.value = '';
            statusFilter.value = 'all';
            difficultyFilter.value = 'all';
            categoryFilter.value = 'all';
            applyFilters();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + F to focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                searchInput.focus();
            }
        });

        // eslint-disable-next-line no-console
        console.log('Test cases viewer loaded');
    </script>`;
  }
}
