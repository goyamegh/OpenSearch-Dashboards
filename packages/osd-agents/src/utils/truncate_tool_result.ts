/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simple utility to truncate tool results to prevent Bedrock API input size errors
 */

// Environment variables for context management
export const LOG_PREVIEW_MAX_LENGTH = parseInt(process.env.LOG_PREVIEW_MAX_LENGTH || '500', 10);
export const MAX_TOOL_RESULT_LENGTH = parseInt(process.env.MAX_TOOL_RESULT_LENGTH || '5000', 10);
export const MAX_TOTAL_CONTEXT_CHARS = parseInt(
  process.env.MAX_TOTAL_CONTEXT_CHARS || '200000',
  10
);

/**
 * Truncate a tool result to a maximum length
 * TODO: In future, implement Bedrock-based summarization instead of simple truncation
 */
export function truncateToolResult(
  result: any,
  maxLength: number = MAX_TOOL_RESULT_LENGTH
): string {
  const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

  if (resultStr.length <= maxLength) {
    return resultStr;
  }

  // Simple truncation with indicator
  return (
    resultStr.substring(0, maxLength) +
    `\n\n[Output truncated - ${resultStr.length - maxLength} characters removed]`
  );
}

/**
 * Calculate total character count across all messages
 */
export function getTotalContextSize(messages: any[]): number {
  return messages.reduce((total, msg) => {
    if (Array.isArray(msg.content)) {
      return (
        total +
        msg.content.reduce((msgTotal: number, block: any) => {
          if (block.text) return msgTotal + block.text.length;
          if (block.toolUse) return msgTotal + JSON.stringify(block.toolUse).length;
          if (block.toolResult) return msgTotal + JSON.stringify(block.toolResult).length;
          return msgTotal;
        }, 0)
      );
    }
    return total + (msg.content || '').toString().length;
  }, 0);
}

/**
 * Ensure messages stay within context limit by truncating oldest messages
 * Keeps system prompt and latest user message intact
 */
export function ensureContextLimit(
  messages: any[],
  maxChars: number
): {
  messages: any[];
  truncated: boolean;
  originalSize: number;
  newSize: number;
} {
  const totalSize = getTotalContextSize(messages);

  if (totalSize <= maxChars) {
    return { messages, truncated: false, originalSize: totalSize, newSize: totalSize };
  }

  // Strategy: Keep first message (system context) and last message (current user input)
  // Truncate from the middle
  const result: any[] = [];
  let currentSize = 0;
  const reserve = maxChars * 0.2; // Reserve 20% for system and latest message

  // Keep last message
  const lastMessage = messages[messages.length - 1];
  const lastMessageSize = getTotalContextSize([lastMessage]);

  // Add messages from newest to oldest until we hit the limit
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgSize = getTotalContextSize([messages[i]]);
    if (currentSize + msgSize <= maxChars - reserve) {
      result.unshift(messages[i]);
      currentSize += msgSize;
    } else {
      break;
    }
  }

  const newSize = getTotalContextSize(result);
  return { messages: result, truncated: true, originalSize: totalSize, newSize };
}
