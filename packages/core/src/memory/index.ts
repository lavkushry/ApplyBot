/**
 * Memory System Module - OpenClaw-inspired Memory Architecture
 *
 * Markdown-based memory with hybrid vector search (BM25 + vector)
 */

export { MemoryManager } from './memory-manager.js';
export type {
  MemoryEntry,
  MemoryType,
  MemorySearchResult,
  MemorySearchOptions,
  MemoryIndex,
  VectorEmbedding,
  MemoryStats,
  MemoryConfig,
  MemoryFile,
  DailyMemory,
  ConsolidatedMemory,
} from './types.js';
export type { MemoryManagerOptions } from './memory-manager.js';

// Index Storage exports (PRD 13.9)
export {
  IndexStorage,
  createIndexStorage,
} from './index-storage.js';
export type {
  IndexStorageOptions,
  VectorIndex,
  VectorMetadata,
  BM25Index,
  IndexMetadata,
  IndexStorageStats,
} from './index-storage.js';
