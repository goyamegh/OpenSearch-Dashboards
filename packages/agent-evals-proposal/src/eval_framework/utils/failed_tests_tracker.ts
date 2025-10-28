/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Failed Tests Tracker
 *
 * Manages tracking and persistence of failed test cases to enable re-running only failed tests.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TestCase, ComparisonResult } from '../runner';

/**
 * Failed tests metadata stored in JSON file
 */
export interface FailedTestsData {
  timestamp: string;
  model_name: string;
  agent_name: string;
  benchmark_name: string;
  total_tests: number;
  failed_count: number;
  failed_test_ids: string[];
}

/**
 * Utility class for tracking and loading failed test cases
 */
export class FailedTestsTracker {
  private static readonly FAILED_TESTS_DIR = './reports';
  private static readonly FAILED_TESTS_PREFIX = '.failed-tests';

  /**
   * Save failed test IDs to a JSON file
   *
   * @param failedTestIds Array of failed test case IDs
   * @param metadata Additional metadata about the test run
   * @param modelName Model name to use in filename
   */
  static saveFailedTests(
    failedTestIds: string[],
    metadata: {
      model_name: string;
      agent_name: string;
      benchmark_name: string;
      total_tests: number;
    },
    modelName?: string
  ): string {
    // Ensure reports directory exists
    if (!fs.existsSync(this.FAILED_TESTS_DIR)) {
      fs.mkdirSync(this.FAILED_TESTS_DIR, { recursive: true });
    }

    // Create filename with model name if provided
    const filename = modelName
      ? `${this.FAILED_TESTS_PREFIX}-${modelName}.json`
      : `${this.FAILED_TESTS_PREFIX}.json`;
    const filePath = path.join(this.FAILED_TESTS_DIR, filename);

    // Prepare data
    const data: FailedTestsData = {
      timestamp: new Date().toISOString(),
      model_name: metadata.model_name,
      agent_name: metadata.agent_name,
      benchmark_name: metadata.benchmark_name,
      total_tests: metadata.total_tests,
      failed_count: failedTestIds.length,
      failed_test_ids: failedTestIds,
    };

    // Write to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

    // eslint-disable-next-line no-console
    console.log(`\n💾 Saved ${failedTestIds.length} failed test IDs to ${filePath}`);

    return filePath;
  }

  /**
   * Load failed test IDs from a JSON file
   *
   * @param modelName Optional model name to load model-specific failed tests
   * @returns Array of failed test IDs
   */
  static loadFailedTests(modelName?: string): string[] {
    // Determine filename
    const filename = modelName
      ? `${this.FAILED_TESTS_PREFIX}-${modelName}.json`
      : `${this.FAILED_TESTS_PREFIX}.json`;
    const filePath = path.join(this.FAILED_TESTS_DIR, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `No failed tests file found at ${filePath}. ` +
          `Run evaluation first to generate failed tests file.`
      );
    }

    // Read and parse file
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data: FailedTestsData = JSON.parse(fileContent);

    // eslint-disable-next-line no-console
    console.log(`\n📂 Loaded ${data.failed_count} failed test IDs from ${filePath}`);
    // eslint-disable-next-line no-console
    console.log(`   Last run: ${data.timestamp}`);
    // eslint-disable-next-line no-console
    console.log(`   Model: ${data.model_name}`);
    // eslint-disable-next-line no-console
    console.log(`   Agent: ${data.agent_name}\n`);

    return data.failed_test_ids;
  }

  /**
   * Convert failed test IDs to test indices based on all test cases
   *
   * @param allTestCases All test cases from the benchmark
   * @param failedTestIds Failed test IDs to find
   * @returns Array of test indices (0-based)
   */
  static getFailedTestIndices(allTestCases: TestCase[], failedTestIds: string[]): number[] {
    const indices: number[] = [];

    failedTestIds.forEach((testId) => {
      const index = allTestCases.findIndex((tc) => tc.id === testId);
      if (index !== -1) {
        indices.push(index);
      } else {
        // eslint-disable-next-line no-console
        console.warn(`⚠️  Warning: Failed test ID "${testId}" not found in test cases`);
      }
    });

    return indices.sort((a, b) => a - b);
  }

  /**
   * Extract failed test IDs from comparison results
   *
   * @param testCases Array of test cases
   * @param comparisonResults Array of comparison results
   * @returns Array of failed test IDs
   */
  static extractFailedTestIds(
    testCases: TestCase[],
    comparisonResults: ComparisonResult[]
  ): string[] {
    const failedIds: string[] = [];

    comparisonResults.forEach((result, index) => {
      if (!result.success) {
        failedIds.push(testCases[index].id);
      }
    });

    return failedIds;
  }

  /**
   * Check if a failed tests file exists for a given model
   *
   * @param modelName Optional model name
   * @returns True if file exists
   */
  static hasFailedTestsFile(modelName?: string): boolean {
    const filename = modelName
      ? `${this.FAILED_TESTS_PREFIX}-${modelName}.json`
      : `${this.FAILED_TESTS_PREFIX}.json`;
    const filePath = path.join(this.FAILED_TESTS_DIR, filename);

    return fs.existsSync(filePath);
  }

  /**
   * List all available failed tests files
   *
   * @returns Array of model names that have failed tests files
   */
  static listFailedTestsFiles(): string[] {
    if (!fs.existsSync(this.FAILED_TESTS_DIR)) {
      return [];
    }

    const files = fs.readdirSync(this.FAILED_TESTS_DIR);
    const failedTestsFiles = files.filter(
      (file) => file.startsWith(this.FAILED_TESTS_PREFIX) && file.endsWith('.json')
    );

    return failedTestsFiles.map((file) => {
      // Extract model name from filename
      const match = file.match(new RegExp(`${this.FAILED_TESTS_PREFIX}-(.+)\\.json`));
      return match ? match[1] : 'default';
    });
  }
}
