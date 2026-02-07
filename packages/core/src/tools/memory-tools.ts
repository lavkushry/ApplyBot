/**
 * Memory Tools - Memory Search and Retrieval
 */

import type { ToolDefinition } from '../agent/types.js';
import type { ToolResult } from '../gateway/types.js';

export interface MemorySearchToolOptions {
  memoryManager?: unknown;
}

export interface MemoryGetToolOptions {
  memoryManager?: unknown;
  basePath?: string;
}

export function createMemorySearchTool(options: MemorySearchToolOptions = {}): ToolDefinition {
  return {
    name: 'memory_search',
    description: 'Search the memory system using hybrid BM25 + vector search.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        topK: { type: 'number', description: 'Maximum number of results' },
        filters: { type: 'string', description: 'Optional filters as JSON' },
        hybrid: { type: 'string', description: 'Use hybrid search (true/false)' },
      },
      required: ['query'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        const query = String(args.query || '');
        const topK = Number(args.topK || 10);

        if (!query.trim()) {
          return { toolCallId: 'memory_search', status: 'error', result: { error: 'Search query is required' }, executionTimeMs: Date.now() - startTime };
        }

        // Mock search results
        const results = [
          { file: 'MEMORY.md', score: 0.95, snippet: 'User prefers dark mode', lineRange: [15, 15] },
          { file: 'USER.md', score: 0.87, snippet: 'Name: Aaditya', lineRange: [3, 6] },
        ];

        return {
          toolCallId: 'memory_search',
          status: 'success',
          result: { query, results, totalResults: results.length },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return { toolCallId: 'memory_search', status: 'error', result: { error: String(error) }, executionTimeMs: Date.now() - startTime };
      }
    },
  };
}

export function createMemoryGetTool(options: MemoryGetToolOptions = {}): ToolDefinition {
  const { basePath = '.' } = options;

  return {
    name: 'memory_get',
    description: 'Retrieve the full content of a memory file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to workspace' },
        lineRange: { type: 'string', description: 'Line range as JSON array [start, end]' },
      },
      required: ['path'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        const relativePath = String(args.path || '');
        
        if (!relativePath.trim()) {
          return { toolCallId: 'memory_get', status: 'error', result: { error: 'File path is required' }, executionTimeMs: Date.now() - startTime };
        }

        // Mock file content
        const content = `# ${relativePath}\n\nMock content for ${relativePath}`;

        return {
          toolCallId: 'memory_get',
          status: 'success',
          result: { content, path: relativePath, fullPath: `${basePath}/${relativePath}`, stats: { lines: 3, chars: content.length } },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return { toolCallId: 'memory_get', status: 'error', result: { error: String(error) }, executionTimeMs: Date.now() - startTime };
      }
    },
  };
}
