/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client Tools Definitions
 *
 * Standard client-side tools that mimic production AG UI environment.
 * These tools are passed to the agent during evaluation to match real-world usage.
 */

import { Tool } from '@ag-ui/core';

/**
 * Standard client tools available in production environment
 *
 * These tools are provided by the client (UI) and allow the agent to:
 * - Execute PPL queries in the query bar
 * - Create visualizations like timeseries graphs
 */
export const CLIENT_TOOLS: Tool[] = [
  {
    name: 'execute_ppl_query',
    description:
      'Update the query bar with a PPL (Piped Processing Language) query and optionally execute it. ' +
      'Use this tool to construct and run queries against OpenSearch data.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'The PPL query to set in the query bar. Must follow PPL syntax (e.g., source=index_name | where field=value | stats count()).',
        },
        autoExecute: {
          type: 'boolean',
          description:
            'Whether to automatically execute the query after setting it in the query bar. Default is true.',
        },
        description: {
          type: 'string',
          description:
            'Optional human-readable description of what the query does. Helps users understand the query intent.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'graph_timeseries_data',
    description:
      'Create a timeseries graph visualization from provided data. ' +
      'Use this tool to visualize temporal data like metrics over time.',
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description:
            'Timeseries data in Prometheus format or simple array format. ' +
            'Should contain timestamps and corresponding values.',
        },
        query: {
          type: 'string',
          description:
            'Optional query that was used to generate this data. Helps users understand data source.',
        },
        title: {
          type: 'string',
          description: 'Optional title for the graph visualization.',
        },
        xAxisLabel: {
          type: 'string',
          description: 'Optional label for the X-axis (typically time).',
        },
        yAxisLabel: {
          type: 'string',
          description: 'Optional label for the Y-axis (typically metric value).',
        },
        description: {
          type: 'string',
          description: 'Optional description of what the graph shows.',
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata about the data source and generation.',
          properties: {
            timestamp: {
              type: 'number',
              description: 'Unix timestamp when data was generated.',
            },
            source: {
              type: 'string',
              description: 'Data source name (e.g., Prometheus, OpenSearch).',
            },
            start_time: {
              type: 'string',
              description: 'Start time of the data range (ISO 8601 format).',
            },
            end_time: {
              type: 'string',
              description: 'End time of the data range (ISO 8601 format).',
            },
            step: {
              type: 'string',
              description: 'Step interval for the data (e.g., "1m", "5m", "1h").',
            },
          },
        },
      },
      required: ['data'],
    },
  },
];
