/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BedrockRuntimeClient, CountTokensCommand } from '@aws-sdk/client-bedrock-runtime';
import { Logger } from './logger';

/**
 * BedrockTokenCounter for accurate token counting using AWS Bedrock API
 * Uses the CountTokens API to get exact token counts for prompts
 */
export class BedrockTokenCounter {
  private static client: BedrockRuntimeClient;
  private static logger = new Logger();

  /**
   * Initialize the Bedrock client (lazy initialization)
   */
  private static getClient(): BedrockRuntimeClient {
    if (!this.client) {
      const region = process.env.AWS_REGION || 'us-east-1';
      this.client = new BedrockRuntimeClient({ region });
    }
    return this.client;
  }

  /**
   * Count tokens in a text string using Bedrock CountTokens API
   * Uses the Converse API format for accurate counting
   *
   * @param text - The text content to count tokens for
   * @param modelId - The model ID to use for token counting
   * @returns Promise<number> - The number of tokens, or -1 on error
   */
  public static async countTokens(text: string, modelId: string): Promise<number> {
    if (!text || text.length === 0) {
      return 0;
    }

    try {
      const command = new CountTokensCommand({
        modelId,
        input: {
          converse: {
            // Count tokens in system prompt format
            system: [{ text }],
            messages: [], // Empty messages array for system prompt counting
          },
        },
      });

      const client = this.getClient();
      const response = await client.send(command);

      if (response.inputTokens !== undefined) {
        return response.inputTokens;
      }

      this.logger.warn('CountTokens API returned undefined inputTokens', {
        modelId,
        textLength: text.length,
      });
      return this.fallbackEstimate(text);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to count tokens via Bedrock API, using fallback estimate', {
        error: errorMessage,
        modelId,
        textLength: text.length,
      });
      return this.fallbackEstimate(text);
    }
  }

  /**
   * Fallback token estimation using simple character-based heuristic
   * ~4 characters per token for English text
   */
  private static fallbackEstimate(text: string): number {
    const CHARS_PER_TOKEN = 4;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Count tokens for multiple text sections and return breakdown
   * Useful for analyzing different parts of a prompt
   *
   * @param sections - Record of section names to text content
   * @param modelId - The model ID to use for token counting
   * @returns Promise with breakdown and total token counts
   */
  public static async countTokensBreakdown(
    sections: Record<string, string>,
    modelId: string
  ): Promise<{
    breakdown: Record<string, number>;
    total: number;
  }> {
    const breakdown: Record<string, number> = {};
    let total = 0;

    for (const [key, text] of Object.entries(sections)) {
      const tokens = await this.countTokens(text, modelId);
      breakdown[key] = tokens;
      total += tokens;
    }

    return { breakdown, total };
  }

  /**
   * Calculate the difference and percentage increase between two token counts
   */
  public static getTokenDiff(
    before: number,
    after: number
  ): {
    diff: number;
    percentIncrease: number;
  } {
    const diff = after - before;
    const percentIncrease = before > 0 ? (diff / before) * 100 : 0;

    return {
      diff,
      percentIncrease: Math.round(percentIncrease * 100) / 100, // Round to 2 decimals
    };
  }
}
