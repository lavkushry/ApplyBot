/**
 * Memory System Types - OpenClaw-inspired Memory Architecture
 * 
 * Markdown-based memory with hybrid vector search (BM25 + vector)
 */

export interface MemoryEntry {
  id: string;
  content: string;
  timestamp: Date;
  type: MemoryType;
  tags: string[];
  source?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export type MemoryType = 
  | 'conversation'
  | 'observation'
  | 'insight'
  | 'decision'
  | 'feedback'
  | 'task'
  | 'error';

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  vectorScore?: number;
  bm25Score?: number;
}

export interface MemorySearchOptions {
  query: string;
  limit?: number;
  types?: MemoryType[];
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
  minScore?: number;
  hybrid?: boolean;
  vectorWeight?: number;
  bm25Weight?: number;
}

export interface MemoryIndex {
  entries: Map<string, MemoryEntry>;
  vectors?: Map<string, number[]>;
  invertedIndex?: Map<string, Set<string>>;
  documentFrequencies?: Map<string, number>;
}

export interface VectorEmbedding {
  id: string;
  vector: number[];
  entryId: string;
}

export interface MemoryStats {
  totalEntries: number;
  entriesByType: Record<MemoryType, number>;
  entriesByTag: Record<string, number>;
  oldestEntry?: Date;
  newestEntry?: Date;
  averageEntryLength: number;
  indexSize: number;
}

export interface MemoryConfig {
  maxEntries: number;
  maxEntryLength: number;
  autoSummarizeThreshold: number;
  enableVectorSearch: boolean;
  enableBM25: boolean;
  vectorDimension: number;
  defaultHybridWeights: {
    vector: number;
    bm25: number;
  };
}

export interface MemoryFile {
  date: string;
  entries: MemoryEntry[];
  summary?: string;
}

export interface DailyMemory {
  date: string;
  filePath: string;
  entries: MemoryEntry[];
  summary?: string;
}

export interface ConsolidatedMemory {
  entries: MemoryEntry[];
  lastUpdated: Date;
  summary: string;
  keyInsights: string[];
}
