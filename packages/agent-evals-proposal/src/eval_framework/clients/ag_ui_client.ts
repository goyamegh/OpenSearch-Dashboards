/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AG UI Client Wrapper
 *
 * Wraps @ag-ui/client to provide metrics collection (latency, token usage, cost)
 * for evaluation purposes.
 */

import {
  RunAgentInput,
  Message,
  BaseEvent,
  EventType,
  RunStartedEvent,
  RunErrorEvent,
  TextMessageContentEvent,
  ToolCallStartEvent,
  ToolCallArgsEvent,
} from '@ag-ui/core';
import fetch, { Response } from 'node-fetch';
import { ConfigLoader } from '../config/config_loader';

/**
 * Token usage information
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

/**
 * AG UI execution result with metrics
 */
export interface AGUIExecutionResult {
  success: boolean;
  output: {
    text?: string;
    ppl_query?: string;
    tools_used?: string[];
    reasoning?: string;
  };
  latency_ms: number;
  token_usage: TokenUsage;
  cost_usd: number;
  tool_calls_count: number; // Total number of tool calls made
  llm_calls_count: number; // Total number of LLM roundtrips
  tool_calls_by_type: Record<string, number>; // Breakdown of tool calls by tool name
  trace_id?: string;
  error?: string;
  events: BaseEvent[];
}

/**
 * Client configuration
 */
export interface AGUIClientConfig {
  endpoint: string;
  timeout_ms?: number;
  model_name: string;
  model_id?: string;
}

/**
 * AG UI HTTP Client with metrics collection
 */
export class AGUIClient {
  private config: AGUIClientConfig;

  constructor(config: AGUIClientConfig) {
    this.config = {
      timeout_ms: 60000,
      ...config,
    };
  }

  /**
   * Run agent with AG UI protocol and collect metrics
   */
  async runAgent(input: RunAgentInput): Promise<AGUIExecutionResult> {
    const startTime = Date.now();

    try {
      // Make HTTP POST request to AG UI endpoint with SSE streaming
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
        // @ts-ignore - node-fetch doesn't have timeout in types
        timeout: this.config.timeout_ms,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Parse SSE stream and collect events
      const events = await this.parseSSEStream(response);

      // Calculate latency
      const endTime = Date.now();
      const latencyMs = endTime - startTime;

      // Extract output and metrics from events
      const result = this.extractResultFromEvents(events, latencyMs);

      return result;
    } catch (error) {
      const endTime = Date.now();
      const latencyMs = endTime - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        output: {},
        latency_ms: latencyMs,
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
        events: [],
      };
    }
  }

  /**
   * Extract PPL query from execute_ppl_query tool call arguments
   * Returns the query from the LAST execute_ppl_query tool call, or undefined if none found
   */
  private extractPPLQueryFromToolCalls(events: BaseEvent[]): string | undefined {
    // Find all TOOL_CALL_START events for execute_ppl_query
    const toolStartEvents = events.filter(
      (e) => e.type === EventType.TOOL_CALL_START
    ) as ToolCallStartEvent[];

    const pplToolCalls = toolStartEvents.filter((e) => e.toolCallName === 'execute_ppl_query');

    if (pplToolCalls.length === 0) {
      return undefined; // No PPL tool call = will be marked as failure in evaluation
    }

    // Get the LAST execute_ppl_query call (as per user requirement)
    const lastPplCall = pplToolCalls[pplToolCalls.length - 1];

    // Find corresponding TOOL_CALL_ARGS event
    const argsEvent = events.find(
      (e) =>
        e.type === EventType.TOOL_CALL_ARGS &&
        (e as ToolCallArgsEvent).toolCallId === lastPplCall.toolCallId
    ) as ToolCallArgsEvent;

    if (!argsEvent) {
      return undefined;
    }

    try {
      // Parse the JSON args (delta contains JSON.stringify(input))
      const args = JSON.parse(argsEvent.delta);
      return args.query; // Extract query field
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to parse tool call args:', error);
      return undefined;
    }
  }

  /**
   * Count tool calls and LLM calls from events
   * Returns metrics including total counts and breakdown by tool type
   */
  private countCalls(
    events: BaseEvent[]
  ): {
    tool_calls_count: number;
    llm_calls_count: number;
    tool_calls_by_type: Record<string, number>;
  } {
    // Count tool calls from TOOL_CALL_START events
    const toolStartEvents = events.filter(
      (e) => e.type === EventType.TOOL_CALL_START
    ) as ToolCallStartEvent[];

    // Count LLM calls from TEXT_MESSAGE_START events
    const textStartEvents = events.filter((e) => e.type === EventType.TEXT_MESSAGE_START);

    // Build breakdown by tool type
    const toolCallsByType: Record<string, number> = {};
    toolStartEvents.forEach((e) => {
      const toolName = e.toolCallName;
      toolCallsByType[toolName] = (toolCallsByType[toolName] || 0) + 1;
    });

    return {
      tool_calls_count: toolStartEvents.length,
      llm_calls_count: textStartEvents.length,
      tool_calls_by_type: toolCallsByType,
    };
  }

  /**
   * Parse Server-Sent Events stream from response
   */
  private async parseSSEStream(response: Response): Promise<BaseEvent[]> {
    const events: BaseEvent[] = [];

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // Read stream line by line
    let buffer = '';

    for await (const chunk of response.body) {
      buffer += chunk.toString();

      // Process complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // Remove 'data: ' prefix
          try {
            const event = JSON.parse(data) as BaseEvent;
            events.push(event);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to parse SSE event:', data);
          }
        }
      }
    }

    return events;
  }

  /**
   * Extract result and metrics from AG UI events
   */
  private extractResultFromEvents(events: BaseEvent[], latencyMs: number): AGUIExecutionResult {
    // Find RUN_STARTED and RUN_ERROR events
    const runStarted = events.find((e) => e.type === EventType.RUN_STARTED) as RunStartedEvent;
    const runError = events.find((e) => e.type === EventType.RUN_ERROR) as RunErrorEvent;

    // Collect text content from TEXT_MESSAGE_CONTENT events
    const textEvents = events.filter(
      (e) => e.type === EventType.TEXT_MESSAGE_CONTENT
    ) as TextMessageContentEvent[];

    let fullText = '';
    textEvents.forEach((event) => {
      fullText += event.delta || '';
    });

    // Collect tool usage
    const toolStartEvents = events.filter(
      (e) => e.type === EventType.TOOL_CALL_START
    ) as ToolCallStartEvent[];
    const toolsUsed = toolStartEvents.map((e) => e.toolCallName);

    // Extract PPL query from execute_ppl_query tool call arguments
    // This is the preferred method - no fallback to text extraction
    const pplQuery = this.extractPPLQueryFromToolCalls(events);

    // Count tool calls and LLM calls for metrics
    const callMetrics = this.countCalls(events);

    // Extract token usage from events (if provided)
    // AG UI may include token usage in RUN_FINISHED or custom events
    const tokenUsage = this.extractTokenUsage(events);

    // Calculate cost using pricing config
    const costUsd = ConfigLoader.calculateCost(
      this.config.model_name,
      tokenUsage.input_tokens,
      tokenUsage.output_tokens
    );

    // Check for errors
    const success = !runError;
    const error = runError ? runError.message : undefined;

    return {
      success,
      output: {
        text: fullText,
        ppl_query: pplQuery,
        tools_used: toolsUsed.length > 0 ? toolsUsed : undefined,
        reasoning: fullText, // Use full text as reasoning for now
      },
      latency_ms: latencyMs,
      token_usage: tokenUsage,
      cost_usd: costUsd,
      tool_calls_count: callMetrics.tool_calls_count,
      llm_calls_count: callMetrics.llm_calls_count,
      tool_calls_by_type: callMetrics.tool_calls_by_type,
      trace_id: runStarted?.threadId,
      error,
      events,
    };
  }

  /**
   * Extract token usage from events
   * Note: Token usage extraction may need to be customized based on actual AG UI response format
   */
  private extractTokenUsage(events: BaseEvent[]): TokenUsage {
    // Try to find token usage in events
    // This is a placeholder - actual implementation depends on how AG UI reports tokens

    // Check for usage in RUN_FINISHED event (if extended)
    const runFinished = events.find((e) => e.type === EventType.RUN_FINISHED) as any;
    if (runFinished?.usage) {
      return {
        input_tokens: runFinished.usage.input_tokens || 0,
        output_tokens: runFinished.usage.output_tokens || 0,
        total_tokens:
          (runFinished.usage.input_tokens || 0) + (runFinished.usage.output_tokens || 0),
      };
    }

    // Check for custom usage events
    const usageEvent = events.find((e: any) => e.type === 'USAGE' || e.usage) as any;
    if (usageEvent?.usage) {
      return {
        input_tokens: usageEvent.usage.input_tokens || 0,
        output_tokens: usageEvent.usage.output_tokens || 0,
        total_tokens: (usageEvent.usage.input_tokens || 0) + (usageEvent.usage.output_tokens || 0),
      };
    }

    // Fallback: estimate tokens from text length (rough approximation: 1 token ≈ 4 characters)
    const textEvents = events.filter(
      (e) => e.type === EventType.TEXT_MESSAGE_CONTENT
    ) as TextMessageContentEvent[];

    let totalChars = 0;
    textEvents.forEach((event) => {
      totalChars += (event.delta || '').length;
    });

    const estimatedOutputTokens = Math.ceil(totalChars / 4);

    // eslint-disable-next-line no-console
    console.warn(
      'Token usage not found in events, using rough estimation based on character count'
    );

    return {
      input_tokens: 0, // Unable to estimate input tokens without request data
      output_tokens: estimatedOutputTokens,
      total_tokens: estimatedOutputTokens,
    };
  }

  /**
   * Create RunAgentInput from test case
   * Formats context to match production AG UI format with dataset info and sample data
   */
  static createRunAgentInput(query: string, context?: any, clientTools?: any[]): RunAgentInput {
    // Generate unique IDs for thread and run
    const threadId = `thread-${Date.now()}`;
    const runId = `run-${Date.now()}`;

    // Create user message with required id field
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: query,
    };

    // Build context array matching production format
    const contextArray: any[] = [];

    if (context) {
      // Add dataset context (Explore application page context)
      if (context.index || context.dataset) {
        const datasetInfo = context.dataset || {
          title: context.index,
          timeFieldName: context.timeFieldName || 'timestamp',
          type: 'INDEX_PATTERN',
          id: context.dataset?.id,
        };

        const exploreContext: any = {
          appId: 'explore',
          dataset: datasetInfo,
          query: { query: '', language: 'PPL' },
        };

        // Add timeRange if available
        if (context.timeRange) {
          exploreContext.timeRange = context.timeRange;
        }

        contextArray.push({
          description: 'Explore application page context',
          value: JSON.stringify(exploreContext),
        });
      }

      // Add sample data if available (Top 5 visible rows from data table)
      if (context.sample_data) {
        contextArray.push({
          description: 'Top 5 visible rows from data table',
          value: JSON.stringify(context.sample_data),
        });
      }

      // Add available fields if provided
      if (context.available_fields) {
        contextArray.push({
          description: 'Available fields in dataset',
          value: JSON.stringify(context.available_fields),
        });
      }
    }

    return {
      threadId,
      runId,
      messages: [userMessage],
      tools: clientTools || [],
      context: contextArray,
    };
  }
}

/**
 * Create AG UI client from agent config
 */
export function createAGUIClient(agentName: string, modelName: string): AGUIClient {
  // Load agent config
  const agent = ConfigLoader.getAgent(agentName);
  if (!agent) {
    throw new Error(`Agent not found: ${agentName}`);
  }

  // Load model config
  const modelConfig = ConfigLoader.getModelConfig(modelName);
  if (!modelConfig) {
    throw new Error(`Model not found: ${modelName}`);
  }

  return new AGUIClient({
    endpoint: agent.endpoint,
    timeout_ms: agent.timeout_ms,
    model_name: modelName,
    model_id: modelConfig.model_id,
  });
}
