/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { Logger } from '../../utils/logger';
import { BaseMCPClient } from '../../mcp';
import { BedrockTokenCounter } from '../../utils/token_counter';
import { getPrometheusMetricsEmitter } from '../../utils/metrics_emitter';
import { ModelConfigManager } from '../../config/model_config';

export class PromptManager {
  private logger: Logger;
  private mcpClients: Record<string, BaseMCPClient>;
  private baseSystemPrompt: string = '';

  constructor(logger: Logger, mcpClients: Record<string, BaseMCPClient>) {
    this.logger = logger;
    this.mcpClients = mcpClients;
  }

  /**
   * Load and enhance the system prompt with dynamic MCP tool information
   */
  async loadSystemPrompt(customSystemPrompt?: string): Promise<void> {
    if (customSystemPrompt) {
      this.baseSystemPrompt = await this.enhanceSystemPrompt(customSystemPrompt);
      this.logger.info('Using enhanced custom system prompt with dynamic content', {
        customPromptLength: customSystemPrompt.length,
        finalPromptLength: this.baseSystemPrompt.length,
        customPromptPreview: customSystemPrompt.substring(0, 200) + '...',
      });
    } else {
      // Always use dynamic system prompt that describes actual MCP tools
      this.baseSystemPrompt = await this.getDefaultSystemPrompt();
      this.logger.info('Using dynamic system prompt with MCP tools', {
        promptLength: this.baseSystemPrompt.length,
        connectedServers: Object.keys(this.mcpClients).length,
        promptPreview: this.baseSystemPrompt.substring(0, 200) + '...',
      });
    }
  }

  /**
   * Get the base system prompt (without client-specific data)
   */
  getBaseSystemPrompt(): string {
    return this.baseSystemPrompt;
  }

  /**
   * Inject client-specific data into the system prompt
   */
  injectClientDataIntoPrompt(
    clientState?: any,
    clientContext?: any[],
    clientTools?: any[]
  ): string {
    let prompt = this.baseSystemPrompt;

    // Inject client state with helpful usage instructions
    if (clientState) {
      const stateContent = `
## Current Session State
The following state is maintained and synchronized with the client:

\`\`\`json
${JSON.stringify(clientState, null, 2)}
\`\`\`

### How to Use State:
- This state persists across the conversation
- You can modify state values to track progress or store information
- State changes will be synchronized with the client via STATE_DELTA events
- Use state to maintain context between tool calls and responses
- Example: Track investigation steps, store intermediate results, maintain counters
- **Dataset**: If \`dataContext.dataset.title\` exists, use it as the index pattern for OpenSearch queries
- **Query**: The \`query\` field contains the current PPL query shown in the UI - modify it when users request query changes
`;
      prompt = prompt.replace('{{CLIENT_STATE}}', stateContent);
    } else {
      prompt = prompt.replace('{{CLIENT_STATE}}', '// No client state provided');
    }

    // Inject client context with usage guidance
    if (clientContext && clientContext.length > 0) {
      const contextContent = `
## Client Context
Additional context provided by the client for this session:

\`\`\`json
${JSON.stringify(clientContext, null, 2)}
\`\`\`

### How to Use Context:
- Context provides background information relevant to the current task
- May include user preferences, environment details, or session metadata
- Consider this context when making decisions or providing responses
- Context is read-only and should not be modified
`;
      prompt = prompt.replace('{{CLIENT_CONTEXT}}', contextContent);
    } else {
      prompt = prompt.replace('{{CLIENT_CONTEXT}}', '// No client context provided');
    }

    // Inject AG UI tools (client-executed tools)
    if (clientTools && clientTools.length > 0) {
      const toolsContent = `
## Client-Side Tools (AG UI Tools)
These tools are executed by the client interface:

${this.formatClientTools(clientTools)}

### Client Tool Execution Model:
- When you call these tools, an event is emitted to the client
- The request completes immediately without waiting for the result
- The client executes the tool and sends a new request with the result
- This allows for asynchronous, non-blocking tool execution
- Use these tools for UI interactions, state updates, and client-side operations
`;
      prompt = prompt.replace('{{AG_UI_TOOLS}}', toolsContent);
    } else {
      prompt = prompt.replace('{{AG_UI_TOOLS}}', '// No client tools provided');
    }

    return prompt;
  }

  private async getDefaultSystemPrompt(): Promise<string> {
    // Load observability agent template and inject dynamic MCP tool information
    const aiAgentPromptPath = join(__dirname, '../../prompts/observability_prompt.md');

    if (!existsSync(aiAgentPromptPath)) {
      this.logger.warn('observability_prompt.md not found, falling back to basic prompt');
      return this.getFallbackSystemPrompt();
    }

    try {
      const aiAgentPrompt = readFileSync(aiAgentPromptPath, 'utf-8');
      return await this.enhanceSystemPrompt(aiAgentPrompt);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to load observability_prompt.md', {
        error: errorMessage,
      });
      return this.getFallbackSystemPrompt();
    }
  }

  private async enhanceSystemPrompt(prompt: string): Promise<string> {
    // Get model ID for token counting
    const modelId = ModelConfigManager.getDefaultModel().modelId;
    const metricsEmitter = getPrometheusMetricsEmitter();

    // Count tokens BEFORE adding MCP tool descriptions
    const baseTokens = await BedrockTokenCounter.countTokens(prompt, modelId);

    // Replace template placeholders with dynamic content
    const toolDescriptions = this.generateToolDescriptions();
    const toolValidationRules = this.getToolValidationRules();

    // Calculate tool counts for metrics
    const mcpServerCount = Object.keys(this.mcpClients).length;
    let totalToolsCount = 0;
    for (const client of Object.values(this.mcpClients)) {
      totalToolsCount += client.getTools().length;
    }

    // Only replace MCP and validation placeholders during initialization
    // Client-specific placeholders (CLIENT_STATE, CLIENT_CONTEXT, AG_UI_TOOLS)
    // are preserved for runtime injection via injectClientDataIntoPrompt
    let enhancedPrompt = prompt.replace('{{MCP_TOOL_DESCRIPTIONS}}', toolDescriptions);

    // Only replace TOOL_PARAMETER_VALIDATION_RULES if the placeholder exists
    if (enhancedPrompt.includes('{{TOOL_PARAMETER_VALIDATION_RULES}}')) {
      enhancedPrompt = enhancedPrompt.replace(
        '{{TOOL_PARAMETER_VALIDATION_RULES}}',
        toolValidationRules
      );
    }

    // Count tokens AFTER adding MCP tool descriptions
    const enhancedTokens = await BedrockTokenCounter.countTokens(enhancedPrompt, modelId);

    // Calculate token overhead from tools
    const { diff: tokenDiff, percentIncrease } = BedrockTokenCounter.getTokenDiff(
      baseTokens,
      enhancedTokens
    );

    // Emit structured log with token breakdown
    this.logger.info('System prompt token counts', {
      base_tokens: baseTokens,
      enhanced_tokens: enhancedTokens,
      tool_overhead_tokens: tokenDiff,
      tool_overhead_percent: percentIncrease,
      mcp_servers_count: mcpServerCount,
      total_tools_count: totalToolsCount,
      model_id: modelId,
    });

    // Emit Prometheus metrics
    metricsEmitter.emitGauge('langgraph_system_prompt_tokens_total', baseTokens, {
      prompt_type: 'base',
      model_id: modelId,
    });

    metricsEmitter.emitGauge('langgraph_system_prompt_tokens_total', enhancedTokens, {
      prompt_type: 'enhanced',
      model_id: modelId,
    });

    metricsEmitter.emitGauge('langgraph_system_prompt_tool_overhead_tokens', tokenDiff, {
      model_id: modelId,
      servers_count: mcpServerCount.toString(),
      tools_count: totalToolsCount.toString(),
    });

    return enhancedPrompt;
  }

  private formatClientTools(tools: any[]): string {
    return tools
      .map((tool) => {
        const params = tool.parameters
          ? `\n  Parameters: ${JSON.stringify(tool.parameters, null, 2)}`
          : '\n  Parameters: None';
        return `- **${tool.name}**: ${tool.description || 'No description'}${params}`;
      })
      .join('\n');
  }

  private getFallbackSystemPrompt(): string {
    // Fallback prompt if claudecode.md cannot be loaded
    const toolDescriptions = this.generateToolDescriptions();
    const openSearchContext = this.getOpenSearchClusterContext();

    return `You are ReAct Agent, an AI assistant specialized in helping with software engineering tasks using the ReAct (Reasoning + Acting) pattern.

You have access to the following tools through MCP (Model Context Protocol) servers:

${toolDescriptions}

${openSearchContext}

Key behaviors:
- Be concise and direct
- Focus on the specific task at hand
- Use available tools when appropriate
- Provide clear, actionable responses
- When asked about your tools, list ONLY the MCP tools shown above

${this.getToolValidationRules()}`;
  }

  private getToolValidationRules(): string {
    return `
CRITICAL: Tool Parameter Validation and Self-Correction

When using tools, you MUST follow this validation process:

1. ANALYZE TOOL SCHEMA: Before calling any tool, carefully examine its description and parameter requirements
   - Pay special attention to REQUIRED PARAMETERS listed in the tool description
   - Review parameter types and constraints
   - Ensure you understand what each parameter expects

2. PARAMETER VALIDATION: Before making a tool call, verify:
   - All required parameters are provided
   - Parameter values are in the correct format
   - No required parameters are null, undefined, or empty

3. SELF-CORRECTION FLOW: If a tool call fails due to parameter validation:
   - Immediately analyze the error message to identify missing or incorrect parameters
   - Review the tool's parameter requirements again
   - Ask the user for clarification if needed parameter values are not available in the context
   - Retry the tool call with the correct parameters
   - Do NOT make the same parameter mistake twice

4. MULTI-TURN CORRECTION: For complex tool interactions:
   - If you receive an error about missing parameters
   - Stop and identify what information you need
   - Either extract the required information from context or ask the user
   - Retry with complete parameter set

Example self-correction pattern:
- Tool call fails: "Missing required parameter: path"
- Response: "I need to provide the path parameter. Let me ask you for the file path or search for it in the context."
- Retry with correct parameters

Remember: Tool parameter validation errors should trigger immediate self-correction, not repeated failures.`;
  }

  private generateToolDescriptions(): string {
    if (Object.keys(this.mcpClients).length === 0) {
      return 'No MCP tools currently available.';
    }

    const descriptions: string[] = [];

    for (const [serverName, client] of Object.entries(this.mcpClients)) {
      const serverTools = client.getTools();
      if (serverTools.length > 0) {
        descriptions.push(`## ${serverName} server tools:`);

        for (const tool of serverTools) {
          let toolDescription = `- **${tool.name}**: ${
            tool.description || 'No description available'
          }`;

          if (tool.inputSchema.required && tool.inputSchema.required.length > 0) {
            toolDescription += `\n  - Required parameters: ${tool.inputSchema.required.join(', ')}`;
          }

          descriptions.push(toolDescription);
        }
        descriptions.push(''); // Add blank line between servers
      }
    }

    return descriptions.join('\n');
  }

  private getOpenSearchClusterContext(): string {
    // Check if OpenSearch MCP server is connected
    if (!this.mcpClients['opensearch-mcp-server']) {
      return '';
    }

    try {
      const clusters = this.getAvailableOpenSearchClusters();
      if (clusters.length === 0) {
        return '';
      }

      const clusterInfo = clusters.map((cluster) => `- ${cluster}`).join('\n');

      return `
OPENSEARCH CLUSTER INFORMATION:
You have access to OpenSearch clusters through the opensearch-mcp-server. Available clusters:
${clusterInfo}

IMPORTANT: When using OpenSearch tools, you MUST specify which cluster to use with the opensearch_cluster_name parameter.
- If the user mentions a specific cluster name, use that cluster
- If the user has previously specified a cluster in this conversation, continue using that cluster unless told otherwise
- If no cluster is specified, ask the user which cluster they want to use
- Remember the cluster selection throughout the conversation for consistency

Example: If user says "search the osd-ops cluster", use opensearch_cluster_name: "osd-ops" for subsequent OpenSearch operations.`;
    } catch (error) {
      this.logger.debug('Could not get OpenSearch cluster context', { error });
      return '';
    }
  }

  private getAvailableOpenSearchClusters(): string[] {
    try {
      // Get config path from MCP server configuration
      const opensearchConfig = this.mcpClients['opensearch-mcp-server']?.getConfig();
      if (!opensearchConfig?.args) {
        return [];
      }

      const configIndex = opensearchConfig.args.findIndex((arg) => arg === '--config');
      if (configIndex === -1 || configIndex + 1 >= opensearchConfig.args.length) {
        return [];
      }

      const configPath = join(process.cwd(), opensearchConfig.args[configIndex + 1]);
      if (!existsSync(configPath)) {
        return [];
      }

      const configContent = readFileSync(configPath, 'utf8');
      const config = yaml.load(configContent) as any;

      if (config?.clusters && typeof config.clusters === 'object') {
        return Object.keys(config.clusters);
      }

      return [];
    } catch (error) {
      this.logger.debug('Error reading OpenSearch clusters', { error });
      return [];
    }
  }
}
