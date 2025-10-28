/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dataset Loader
 *
 * Loads and validates benchmark datasets
 */

import * as fs from 'fs';
import * as path from 'path';
import { TestCase } from '../runner';

/**
 * Dataset loader filters
 */
export interface DatasetFilters {
  category?: string;
  subcategory?: string;
  difficulty?: string;
  tags?: string[];
  limit?: number;
  test_indices?: number[]; // Specific test indices to run (0-based)
}

/**
 * Loads and validates benchmark datasets
 */
export class DatasetLoader {
  /**
   * Load test cases from benchmark JSON file with optional filtering
   */
  async loadBenchmark(benchmarkPath: string, filters?: DatasetFilters): Promise<TestCase[]> {
    // eslint-disable-next-line no-console
    console.log(`Loading benchmark from ${benchmarkPath}`);

    // Check if file exists
    if (!fs.existsSync(benchmarkPath)) {
      throw new Error(`Benchmark file not found: ${benchmarkPath}`);
    }

    try {
      // Read and parse JSON file
      const fileContent = fs.readFileSync(benchmarkPath, 'utf-8');
      const data = JSON.parse(fileContent);

      // Extract test cases array
      let testCases: TestCase[] = [];
      if (Array.isArray(data)) {
        testCases = data;
      } else if (data.test_cases && Array.isArray(data.test_cases)) {
        testCases = data.test_cases;
      } else {
        throw new Error('Invalid benchmark format: expected array or object with test_cases');
      }

      // eslint-disable-next-line no-console
      console.log(`Loaded ${testCases.length} test cases from file`);

      // Apply filters
      if (filters) {
        testCases = this.applyFilters(testCases, filters);
        // eslint-disable-next-line no-console
        console.log(`After filtering: ${testCases.length} test cases`);
      }

      // Validate test cases
      testCases.forEach((testCase, index) => {
        if (!this.validateTestCase(testCase)) {
          // eslint-disable-next-line no-console
          console.warn(`Invalid test case at index ${index}: ${testCase.id}`);
        }
      });

      return testCases;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load benchmark: ${errorMessage}`);
    }
  }

  /**
   * Apply filters to test cases
   */
  private applyFilters(testCases: TestCase[], filters: DatasetFilters): TestCase[] {
    let filtered = testCases;

    // Filter by category
    if (filters.category) {
      filtered = filtered.filter((tc) => tc.category === filters.category);
    }

    // Filter by subcategory
    if (filters.subcategory) {
      filtered = filtered.filter((tc) => tc.subcategory === filters.subcategory);
    }

    // Filter by difficulty
    if (filters.difficulty) {
      filtered = filtered.filter((tc) => tc.difficulty === filters.difficulty);
    }

    // Filter by tags (must match all specified tags)
    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter((tc) => filters.tags!.every((tag) => tc.tags?.includes(tag)));
    }

    // Filter by test indices (specific tests to run)
    if (filters.test_indices && filters.test_indices.length > 0) {
      // Create a map of original indices before other filters were applied
      const originalIndices = new Map<string, number>();
      testCases.forEach((tc, index) => {
        originalIndices.set(tc.id, index);
      });

      // Filter to only include tests at specified indices
      filtered = filtered.filter((tc) => {
        const originalIndex = originalIndices.get(tc.id);
        return originalIndex !== undefined && filters.test_indices!.includes(originalIndex);
      });

      // eslint-disable-next-line no-console
      console.log(
        `  Filtered to ${filtered.length} tests based on indices: [${filters.test_indices.join(
          ', '
        )}]`
      );
    }

    // Apply limit (after index filtering)
    if (filters.limit && filters.limit > 0) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  /**
   * Validate test case structure
   */
  private validateTestCase(testCase: TestCase): boolean {
    // Check required fields
    if (!testCase.id || typeof testCase.id !== 'string') {
      return false;
    }

    if (!testCase.category || typeof testCase.category !== 'string') {
      return false;
    }

    if (!testCase.difficulty || typeof testCase.difficulty !== 'string') {
      return false;
    }

    if (!testCase.input || typeof testCase.input !== 'object') {
      return false;
    }

    if (!testCase.expected_output || typeof testCase.expected_output !== 'object') {
      return false;
    }

    if (!testCase.evaluation_criteria || typeof testCase.evaluation_criteria !== 'object') {
      return false;
    }

    return true;
  }

  /**
   * Get benchmark metadata
   */
  async getBenchmarkMetadata(benchmarkPath: string): Promise<Record<string, any>> {
    if (!fs.existsSync(benchmarkPath)) {
      throw new Error(`Benchmark file not found: ${benchmarkPath}`);
    }

    const fileContent = fs.readFileSync(benchmarkPath, 'utf-8');
    const data = JSON.parse(fileContent);

    return {
      name: path.basename(benchmarkPath, '.json'),
      version: data.version || '1.0.0',
      description: data.description,
      total_cases: Array.isArray(data) ? data.length : data.test_cases?.length || 0,
      categories: this.extractCategories(data),
      difficulties: this.extractDifficulties(data),
    };
  }

  /**
   * Extract unique categories from test cases
   */
  private extractCategories(data: any): string[] {
    const testCases = Array.isArray(data) ? data : data.test_cases || [];
    const categories = new Set<string>();
    testCases.forEach((tc: TestCase) => {
      if (tc.category) {
        categories.add(tc.category);
      }
    });
    return Array.from(categories);
  }

  /**
   * Extract unique difficulty levels from test cases
   */
  private extractDifficulties(data: any): string[] {
    const testCases = Array.isArray(data) ? data : data.test_cases || [];
    const difficulties = new Set<string>();
    testCases.forEach((tc: TestCase) => {
      if (tc.difficulty) {
        difficulties.add(tc.difficulty);
      }
    });
    return Array.from(difficulties);
  }
}
