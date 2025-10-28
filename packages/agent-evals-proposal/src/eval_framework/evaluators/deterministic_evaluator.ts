/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Deterministic Evaluator
 *
 * Performs deterministic evaluation of agent outputs:
 * - PPL syntax validation
 * - Exact match comparison
 * - Semantic similarity (optional)
 * - Tool usage validation
 */

import { TestCase, ExecutionResult, ComparisonResult } from '../runner';

/**
 * Evaluator configuration
 */
export interface DeterministicEvaluatorConfig {
  enable_semantic_similarity?: boolean;
  semantic_similarity_threshold?: number;
  strict_tool_matching?: boolean;
}

/**
 * PPL Query Components (structured representation)
 */
interface PPLComponents {
  source: string;
  where?: WhereClause[];
  stats?: StatsClause;
  fields?: string[];
  sort?: SortClause;
  head?: number;
  tail?: number;
  dedup?: string[];
  eval?: EvalClause[];
  other?: string; // For complex clauses we don't fully parse
}

interface WhereClause {
  field: string;
  operator: string;
  value: string | number;
  connector?: 'and' | 'or';
  parenthesized?: boolean;
}

interface StatsClause {
  aggregations: Array<{ func: string; field?: string; alias?: string }>;
  groupBy?: string[];
}

interface SortClause {
  field: string;
  direction: 'asc' | 'desc';
}

interface EvalClause {
  alias: string;
  expression: string;
}

/**
 * Deterministic evaluator for agent outputs
 */
export class DeterministicEvaluator {
  private config: DeterministicEvaluatorConfig;

  constructor(config: DeterministicEvaluatorConfig = {}) {
    this.config = {
      enable_semantic_similarity: false,
      semantic_similarity_threshold: 0.8,
      strict_tool_matching: false,
      ...config,
    };
  }

  /**
   * Evaluate a single test case result
   */
  evaluate(testCase: TestCase, executionResult: ExecutionResult): ComparisonResult {
    const actual = executionResult.agent_output;
    const expected = testCase.expected_output;
    const criteria = testCase.evaluation_criteria;

    // eslint-disable-next-line no-console
    console.log(`Evaluating test case ${testCase.id}`);

    // Check for execution errors first
    if (executionResult.error) {
      return {
        test_case_id: testCase.id,
        success: false,
        exactMatch: false,
        syntaxValid: false,
        toolMatch: false,
        details: {
          error: executionResult.error,
          primary_metric: criteria.primary_metric,
        },
      };
    }

    // 1. Exact match check
    const exactMatch = this.checkExactMatch(actual, expected);

    // 2. PPL syntax validation
    const syntaxValid = this.validatePPLSyntax(actual.ppl_query || '', criteria.syntax_valid);

    // 3. Semantic similarity (if enabled)
    let semanticSimilarity: number | undefined;
    if (this.config.enable_semantic_similarity || criteria.semantically_correct) {
      semanticSimilarity = this.calculateSemanticSimilarity(
        actual.ppl_query || '',
        expected.ppl_query || ''
      );
    }

    // 4. Tool usage validation
    const toolMatch = this.validateToolUsage(
      actual.tools_used || [],
      expected.tools_used || [],
      this.config.strict_tool_matching || false
    );

    // 5. Determine overall success based on primary metric
    const success = this.determineSuccess(
      criteria.primary_metric,
      {
        exactMatch,
        syntaxValid,
        semanticSimilarity,
        toolMatch,
      },
      criteria
    );

    return {
      test_case_id: testCase.id,
      success,
      exactMatch,
      syntaxValid,
      semanticSimilarity,
      toolMatch,
      details: {
        primary_metric: criteria.primary_metric,
        actual_ppl: actual.ppl_query,
        expected_ppl: expected.ppl_query,
        actual_tools: actual.tools_used,
        expected_tools: expected.tools_used,
      },
    };
  }

  /**
   * Evaluate multiple test cases
   */
  evaluateBatch(testCases: TestCase[], executionResults: ExecutionResult[]): ComparisonResult[] {
    if (testCases.length !== executionResults.length) {
      throw new Error('Test cases and execution results length mismatch');
    }

    return testCases.map((testCase, index) => this.evaluate(testCase, executionResults[index]));
  }

  /**
   * Check if actual output exactly matches expected output
   */
  private checkExactMatch(actual: any, expected: any): boolean {
    // For PPL queries, normalize and compare
    const actualPPL = this.normalizePPL(actual.ppl_query || '');
    const expectedPPL = this.normalizePPL(expected.ppl_query || '');

    return actualPPL === expectedPPL;
  }

  /**
   * Validate PPL syntax
   */
  private validatePPLSyntax(query: string, shouldValidate?: boolean): boolean {
    if (!shouldValidate || !query) {
      return false;
    }

    // Basic PPL syntax validation
    const normalizedQuery = query.trim().toLowerCase();

    // Check for required 'source=' clause
    if (!normalizedQuery.includes('source=')) {
      return false;
    }

    // Check for common PPL patterns
    const pplKeywords = [
      'source',
      'where',
      'stats',
      'fields',
      'sort',
      'head',
      'tail',
      'dedup',
      'eval',
      'rename',
    ];

    // At least one PPL keyword should be present
    const hasKeyword = pplKeywords.some((keyword) => normalizedQuery.includes(keyword));

    if (!hasKeyword) {
      return false;
    }

    // Check for balanced parentheses and quotes
    if (!this.checkBalancedDelimiters(query)) {
      return false;
    }

    // Basic syntax is valid
    return true;
  }

  /**
   * Check balanced parentheses, brackets, and quotes
   */
  private checkBalancedDelimiters(text: string): boolean {
    const stack: string[] = [];
    const pairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
    };

    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Handle quotes
      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        continue;
      }
      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      // Skip if inside quotes
      if (inSingleQuote || inDoubleQuote) {
        continue;
      }

      // Check delimiters
      if (char in pairs) {
        stack.push(char);
      } else if (Object.values(pairs).includes(char)) {
        if (stack.length === 0) {
          return false; // Unmatched closing delimiter
        }
        const last = stack.pop()!;
        if (pairs[last] !== char) {
          return false; // Mismatched delimiter
        }
      }
    }

    // Check for unclosed quotes or delimiters
    return stack.length === 0 && !inSingleQuote && !inDoubleQuote;
  }

  /**
   * Calculate semantic similarity between two PPL queries
   * Enhanced with PPL-aware component-based comparison
   */
  private calculateSemanticSimilarity(query1: string, query2: string): number {
    // Normalize queries
    const norm1 = this.normalizePPL(query1);
    const norm2 = this.normalizePPL(query2);

    // Exact match after normalization
    if (norm1 === norm2) {
      return 1.0;
    }

    // Parse into components
    const comp1 = this.parseQueryComponents(query1);
    const comp2 = this.parseQueryComponents(query2);

    // Component weights (must sum to 1.0)
    const weights = {
      source: 0.15,
      where: 0.3,
      stats: 0.25,
      fields: 0.1,
      sort: 0.1,
      head: 0.05,
      tail: 0.05,
    };

    let totalScore = 0;

    // 1. Compare source (exact match)
    if (comp1.source === comp2.source) {
      totalScore += weights.source;
    } else if (comp1.source && comp2.source) {
      // Partial credit for similar sources
      const sourceSimilarity =
        comp1.source.includes(comp2.source) || comp2.source.includes(comp1.source) ? 0.5 : 0;
      totalScore += weights.source * sourceSimilarity;
    }

    // 2. Compare WHERE clauses
    if (comp1.where && comp2.where) {
      totalScore += weights.where * this.compareWhereClauses(comp1.where, comp2.where);
    } else if (!comp1.where && !comp2.where) {
      totalScore += weights.where; // Both have no where clause
    }

    // 3. Compare STATS clauses
    if (comp1.stats && comp2.stats) {
      totalScore += weights.stats * this.compareStatsClause(comp1.stats, comp2.stats);
    } else if (!comp1.stats && !comp2.stats) {
      totalScore += weights.stats; // Both have no stats
    }

    // 4. Compare FIELDS
    if (comp1.fields && comp2.fields) {
      totalScore += weights.fields * this.compareFieldsList(comp1.fields, comp2.fields);
    } else if (!comp1.fields && !comp2.fields) {
      totalScore += weights.fields; // Both have no fields
    }

    // 5. Compare SORT
    if (comp1.sort && comp2.sort) {
      const sortMatch =
        comp1.sort.field === comp2.sort.field && comp1.sort.direction === comp2.sort.direction;
      totalScore += weights.sort * (sortMatch ? 1.0 : 0.5);
    } else if (!comp1.sort && !comp2.sort) {
      totalScore += weights.sort; // Both have no sort
    }

    // 6. Compare HEAD
    if (comp1.head !== undefined && comp2.head !== undefined) {
      totalScore += weights.head * (comp1.head === comp2.head ? 1.0 : 0.0);
    } else if (comp1.head === undefined && comp2.head === undefined) {
      totalScore += weights.head;
    }

    // 7. Compare TAIL
    if (comp1.tail !== undefined && comp2.tail !== undefined) {
      totalScore += weights.tail * (comp1.tail === comp2.tail ? 1.0 : 0.0);
    } else if (comp1.tail === undefined && comp2.tail === undefined) {
      totalScore += weights.tail;
    }

    return totalScore;
  }

  /**
   * Normalize PPL query for comparison
   * Enhanced to handle quotes, operators, and more spacing variations
   */
  private normalizePPL(query: string): string {
    return query
      .toLowerCase()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/"/g, "'") // Normalize double quotes to single
      .replace(/\s*=\s*/g, '=') // Remove spaces around =
      .replace(/\s*!=\s*/g, '!=') // Remove spaces around !=
      .replace(/\s*>=\s*/g, '>=') // Remove spaces around >=
      .replace(/\s*<=\s*/g, '<=') // Remove spaces around <=
      .replace(/\s*>\s*/g, '>') // Remove spaces around >
      .replace(/\s*<\s*/g, '<') // Remove spaces around <
      .replace(/\s*\|\s*/g, '|') // Remove spaces around |
      .replace(/\s*,\s*/g, ',') // Remove spaces around commas
      .replace(/\s*\(\s*/g, '(') // Remove spaces after (
      .replace(/\s*\)\s*/g, ')') // Remove spaces before )
      .trim();
  }

  /**
   * Parse PPL query into structured components
   * Simplified parser focusing on the most common PPL patterns
   */
  private parseQueryComponents(query: string): PPLComponents {
    const normalized = this.normalizePPL(query);
    const components: PPLComponents = { source: '' };

    // Split by pipe to get clauses
    const clauses = normalized.split('|').map((c) => c.trim());

    for (const clause of clauses) {
      // Parse source clause
      if (clause.startsWith('source=')) {
        components.source = clause.substring(7).trim();
      }
      // Parse where clause
      else if (clause.startsWith('where ')) {
        const whereStr = clause.substring(6).trim();
        components.where = this.parseWhereClause(whereStr);
      }
      // Parse stats clause
      else if (clause.startsWith('stats ')) {
        components.stats = this.parseStatsClause(clause.substring(6).trim());
      }
      // Parse fields clause
      else if (clause.startsWith('fields ')) {
        components.fields = clause
          .substring(7)
          .split(',')
          .map((f) => f.trim());
      }
      // Parse sort clause
      else if (clause.startsWith('sort ')) {
        components.sort = this.parseSortClause(clause.substring(5).trim());
      }
      // Parse head clause
      else if (clause.startsWith('head ')) {
        components.head = parseInt(clause.substring(5).trim(), 10);
      }
      // Parse tail clause
      else if (clause.startsWith('tail ')) {
        components.tail = parseInt(clause.substring(5).trim(), 10);
      }
      // Parse dedup clause
      else if (clause.startsWith('dedup ')) {
        components.dedup = clause
          .substring(6)
          .split(',')
          .map((f) => f.trim());
      }
      // Other complex clauses
      else if (clause.length > 0) {
        components.other = (components.other || '') + ' | ' + clause;
      }
    }

    return components;
  }

  /**
   * Parse WHERE clause into structured conditions
   */
  private parseWhereClause(whereStr: string): WhereClause[] {
    const conditions: WhereClause[] = [];

    // Simple regex-based parsing for common patterns
    // Handles: field='value', field=123, field>100, etc.
    const conditionPattern = /(\w+)\s*(=|!=|>=|<=|>|<|like|in)\s*([^()]+?)(?:\s+(and|or)\s+|$)/gi;

    let match;
    while ((match = conditionPattern.exec(whereStr)) !== null) {
      conditions.push({
        field: match[1].trim(),
        operator: match[2].trim(),
        value: match[3].trim().replace(/['"]/g, ''),
        connector: match[4] ? (match[4].toLowerCase() as 'and' | 'or') : undefined,
      });
    }

    return conditions;
  }

  /**
   * Parse STATS clause
   */
  private parseStatsClause(statsStr: string): StatsClause {
    const stats: StatsClause = { aggregations: [] };

    // Check for 'by' clause
    const byIndex = statsStr.lastIndexOf(' by ');
    let aggsStr = statsStr;

    if (byIndex !== -1) {
      aggsStr = statsStr.substring(0, byIndex).trim();
      const groupByStr = statsStr.substring(byIndex + 4).trim();
      stats.groupBy = groupByStr.split(',').map((g) => g.trim());
    }

    // Parse aggregations: count(), avg(field), sum(field) as alias, etc.
    const aggPattern = /(\w+)\(([^)]*)\)(?:\s+as\s+(\w+))?/gi;
    let match;

    while ((match = aggPattern.exec(aggsStr)) !== null) {
      stats.aggregations.push({
        func: match[1].trim(),
        field: match[2] ? match[2].trim() : undefined,
        alias: match[3] ? match[3].trim() : undefined,
      });
    }

    return stats;
  }

  /**
   * Parse SORT clause
   */
  private parseSortClause(sortStr: string): SortClause {
    const parts = sortStr.trim().split(/\s+/);
    const direction = parts[0] === '-' || parts[0] === 'desc' ? 'desc' : 'asc';
    const field = parts[0] === '-' || parts[0] === '+' ? parts[1] : parts[0];

    return { field, direction };
  }

  /**
   * Compare WHERE clauses (order-agnostic)
   * Returns similarity score 0-1
   */
  private compareWhereClauses(clauses1: WhereClause[], clauses2: WhereClause[]): number {
    if (clauses1.length === 0 && clauses2.length === 0) return 1.0;
    if (clauses1.length === 0 || clauses2.length === 0) return 0.0;

    // Create normalized string representations
    const normalize = (clause: WhereClause) =>
      `${clause.field}${clause.operator}${clause.value}`.toLowerCase();

    const set1 = new Set(clauses1.map(normalize));
    const set2 = new Set(clauses2.map(normalize));

    // Calculate Jaccard similarity on conditions
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Compare STATS clauses (order-agnostic for aggregations and groupBy)
   * Returns similarity score 0-1
   */
  private compareStatsClause(stats1: StatsClause, stats2: StatsClause): number {
    let score = 0;
    let components = 0;

    // Compare aggregations (order-agnostic)
    if (stats1.aggregations.length > 0 || stats2.aggregations.length > 0) {
      components++;

      const normalize = (agg: { func: string; field?: string; alias?: string }) =>
        `${agg.func}(${agg.field || ''})`;

      const aggs1 = new Set(stats1.aggregations.map(normalize));
      const aggs2 = new Set(stats2.aggregations.map(normalize));

      const intersection = new Set([...aggs1].filter((x) => aggs2.has(x)));
      const union = new Set([...aggs1, ...aggs2]);

      if (union.size > 0) {
        score += intersection.size / union.size;
      }
    }

    // Compare groupBy fields (order-agnostic)
    if (stats1.groupBy || stats2.groupBy) {
      components++;

      const group1 = new Set(stats1.groupBy || []);
      const group2 = new Set(stats2.groupBy || []);

      const intersection = new Set([...group1].filter((x) => group2.has(x)));
      const union = new Set([...group1, ...group2]);

      if (union.size > 0) {
        score += intersection.size / union.size;
      } else if (group1.size === 0 && group2.size === 0) {
        score += 1.0; // Both have no groupBy
      }
    }

    return components > 0 ? score / components : 1.0;
  }

  /**
   * Compare field lists (order-agnostic)
   * Returns similarity score 0-1
   */
  private compareFieldsList(fields1: string[], fields2: string[]): number {
    if (fields1.length === 0 && fields2.length === 0) return 1.0;
    if (fields1.length === 0 || fields2.length === 0) return 0.0;

    const set1 = new Set(fields1);
    const set2 = new Set(fields2);

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Validate tool usage
   */
  private validateToolUsage(
    actualTools: string[],
    expectedTools: string[],
    strict: boolean
  ): boolean {
    if (expectedTools.length === 0) {
      return true; // No expected tools, always pass
    }

    if (strict) {
      // Strict mode: exact match of tools (order doesn't matter)
      if (actualTools.length !== expectedTools.length) {
        return false;
      }
      return expectedTools.every((tool) => actualTools.includes(tool));
    } else {
      // Lenient mode: actual tools should include all expected tools (but can have more)
      return expectedTools.every((tool) => actualTools.includes(tool));
    }
  }

  /**
   * Determine overall success based on primary metric
   */
  private determineSuccess(
    primaryMetric: string,
    results: {
      exactMatch: boolean;
      syntaxValid: boolean;
      semanticSimilarity?: number;
      toolMatch: boolean;
    },
    criteria: any
  ): boolean {
    switch (primaryMetric) {
      case 'exactMatch':
        return results.exactMatch;

      case 'syntaxValid':
        return results.syntaxValid;

      case 'semanticSimilarity':
        const threshold =
          criteria.semantic_similarity_threshold ||
          this.config.semantic_similarity_threshold ||
          0.8;
        return results.semanticSimilarity !== undefined && results.semanticSimilarity >= threshold;

      case 'tool_efficiency':
        return results.toolMatch;

      default:
        // Default: pass if syntax is valid
        return results.syntaxValid;
    }
  }

  /**
   * Get evaluation summary statistics
   */
  getSummary(
    results: ComparisonResult[]
  ): {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    exactMatchRate: number;
    syntaxValidRate: number;
    avgSemanticSimilarity: number;
  } {
    const total = results.length;
    const passed = results.filter((r) => r.success).length;
    const failed = total - passed;
    const passRate = total > 0 ? passed / total : 0;

    const exactMatchRate = total > 0 ? results.filter((r) => r.exactMatch).length / total : 0;

    const syntaxValidRate = total > 0 ? results.filter((r) => r.syntaxValid).length / total : 0;

    const similarities = results
      .map((r) => r.semanticSimilarity)
      .filter((s): s is number => s !== undefined);

    const avgSemanticSimilarity =
      similarities.length > 0
        ? similarities.reduce((sum, s) => sum + s, 0) / similarities.length
        : 0;

    return {
      total,
      passed,
      failed,
      passRate,
      exactMatchRate,
      syntaxValidRate,
      avgSemanticSimilarity,
    };
  }
}
