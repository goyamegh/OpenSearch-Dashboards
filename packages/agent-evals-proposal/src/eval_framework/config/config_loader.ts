/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Agent configuration
 */
export interface AgentConfig {
  name: string;
  endpoint: string;
  description?: string;
  timeout_ms: number;
  enabled?: boolean;
  models: string[];
}

/**
 * Model configuration
 */
export interface ModelConfig {
  model_id: string;
  display_name: string;
  context_window: number;
  max_output_tokens: number;
}

/**
 * Complete agents configuration file structure
 */
export interface AgentsConfigFile {
  agents: AgentConfig[];
  models: Record<string, ModelConfig>;
  defaults: {
    timeout_ms: number;
    retry_attempts: number;
    retry_delay_ms: number;
  };
}

/**
 * Model pricing configuration
 */
export interface ModelPricing {
  input_per_1k: number;
  output_per_1k: number;
  model_id: string;
}

/**
 * Complete pricing configuration file structure
 */
export interface PricingConfigFile {
  pricing: Record<string, ModelPricing>;
  default: {
    input_per_1k: number;
    output_per_1k: number;
  };
}

/**
 * Configuration loader for agents and pricing
 */
export class ConfigLoader {
  private static agentsConfigCache?: AgentsConfigFile;
  private static pricingConfigCache?: PricingConfigFile;

  /**
   * Load agents configuration from YAML file
   */
  static loadAgentsConfig(configPath?: string): AgentsConfigFile {
    // Return cached config if available
    if (this.agentsConfigCache) {
      return this.agentsConfigCache;
    }

    const resolvedPath = configPath || path.join(__dirname, '../../../config/agents.yaml');

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Agents config file not found: ${resolvedPath}`);
    }

    try {
      const fileContents = fs.readFileSync(resolvedPath, 'utf8');
      const config = yaml.load(fileContents) as AgentsConfigFile;

      // Validate required fields
      if (!config.agents || !Array.isArray(config.agents)) {
        throw new Error('Invalid agents config: missing or invalid agents array');
      }

      if (!config.models || typeof config.models !== 'object') {
        throw new Error('Invalid agents config: missing or invalid models object');
      }

      // Apply defaults and validate each agent
      config.agents = config.agents.map((agent) => ({
        ...agent,
        timeout_ms: agent.timeout_ms || config.defaults?.timeout_ms || 30000,
        enabled: agent.enabled !== false, // Default to true
      }));

      // Cache and return
      this.agentsConfigCache = config;
      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load agents config: ${errorMessage}`);
    }
  }

  /**
   * Load pricing configuration from YAML file
   */
  static loadPricingConfig(configPath?: string): PricingConfigFile {
    // Return cached config if available
    if (this.pricingConfigCache) {
      return this.pricingConfigCache;
    }

    const resolvedPath = configPath || path.join(__dirname, '../../../config/pricing.yaml');

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Pricing config file not found: ${resolvedPath}`);
    }

    try {
      const fileContents = fs.readFileSync(resolvedPath, 'utf8');
      const config = yaml.load(fileContents) as PricingConfigFile;

      // Validate required fields
      if (!config.pricing || typeof config.pricing !== 'object') {
        throw new Error('Invalid pricing config: missing or invalid pricing object');
      }

      if (!config.default) {
        throw new Error('Invalid pricing config: missing default pricing');
      }

      // Cache and return
      this.pricingConfigCache = config;
      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load pricing config: ${errorMessage}`);
    }
  }

  /**
   * Get pricing for a specific model
   */
  static getModelPricing(modelName: string, config?: PricingConfigFile): ModelPricing {
    const pricingConfig = config || this.loadPricingConfig();

    if (pricingConfig.pricing[modelName]) {
      return pricingConfig.pricing[modelName];
    }

    // Return default pricing if model not found
    // eslint-disable-next-line no-console
    console.warn(`Pricing not found for model ${modelName}, using default pricing`);
    return {
      input_per_1k: pricingConfig.default.input_per_1k,
      output_per_1k: pricingConfig.default.output_per_1k,
      model_id: 'unknown',
    };
  }

  /**
   * Calculate cost from token usage
   */
  static calculateCost(
    modelName: string,
    inputTokens: number,
    outputTokens: number,
    config?: PricingConfigFile
  ): number {
    const pricing = this.getModelPricing(modelName, config);

    const inputCost = (inputTokens / 1000) * pricing.input_per_1k;
    const outputCost = (outputTokens / 1000) * pricing.output_per_1k;

    return inputCost + outputCost;
  }

  /**
   * Get all enabled agents
   */
  static getEnabledAgents(config?: AgentsConfigFile): AgentConfig[] {
    const agentsConfig = config || this.loadAgentsConfig();
    return agentsConfig.agents.filter((agent) => agent.enabled !== false);
  }

  /**
   * Get agent by name
   */
  static getAgent(agentName: string, config?: AgentsConfigFile): AgentConfig | undefined {
    const agentsConfig = config || this.loadAgentsConfig();
    return agentsConfig.agents.find((agent) => agent.name === agentName);
  }

  /**
   * Get model configuration
   */
  static getModelConfig(modelName: string, config?: AgentsConfigFile): ModelConfig | undefined {
    const agentsConfig = config || this.loadAgentsConfig();
    return agentsConfig.models[modelName];
  }

  /**
   * Get all model names
   */
  static getAllModelNames(config?: AgentsConfigFile): string[] {
    const agentsConfig = config || this.loadAgentsConfig();
    return Object.keys(agentsConfig.models);
  }

  /**
   * Clear cached configurations (useful for testing)
   */
  static clearCache(): void {
    this.agentsConfigCache = undefined;
    this.pricingConfigCache = undefined;
  }
}
