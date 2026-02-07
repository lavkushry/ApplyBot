/**
 * Memory Manager - OpenClaw-inspired Memory System
 * 
 * Markdown-based memory with hybrid vector search (BM25 + vector)
 * Stores memories in memory/YYYY-MM-DD.md files with MEMORY.md consolidation
 */

import type {
  MemoryEntry,
  MemoryType,
  MemorySearchResult,
  MemorySearchOptions,
  MemoryStats,
  MemoryConfig,
  DailyMemory,
  ConsolidatedMemory,
} from './types.js';

export interface MemoryManagerOptions {
  config?: Partial<MemoryConfig>;
  memoryDir?: string;
}

export class MemoryManager {
  private config: MemoryConfig;
  private memoryDir: string;
  private entries = new Map<string, MemoryEntry>();
  private vectors = new Map<string, number[]>();
  private invertedIndex = new Map<string, Set<string>>();
  private documentFrequencies = new Map<string, number>();
  private totalDocuments = 0;

  constructor(options: MemoryManagerOptions = {}) {
    this.config = {
      maxEntries: 10000,
      maxEntryLength: 10000,
      autoSummarizeThreshold: 100,
      enableVectorSearch: true,
      enableBM25: true,
      vectorDimension: 384, // Default for small embedding models
      defaultHybridWeights: {
        vector: 0.5,
        bm25: 0.5,
      },
      ...options.config,
    };

    this.memoryDir = options.memoryDir || './memory';
  }

  /**
   * Add a memory entry
   */
  addEntry(
    content: string,
    type: MemoryType = 'observation',
    options: {
      tags?: string[];
      source?: string;
      sessionId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): MemoryEntry {
    // Validate content length
    if (content.length > this.config.maxEntryLength) {
      content = content.substring(0, this.config.maxEntryLength) + '...';
    }

    const entry: MemoryEntry = {
      id: this.generateEntryId(),
      content,
      timestamp: new Date(),
      type,
      tags: options.tags || [],
      source: options.source,
      sessionId: options.sessionId,
      metadata: options.metadata,
    };

    // Store entry
    this.entries.set(entry.id, entry);

    // Update BM25 index
    if (this.config.enableBM25) {
      this.updateBM25Index(entry);
    }

    // Generate and store vector (simplified - in real implementation, use embedding model)
    if (this.config.enableVectorSearch) {
      const vector = this.generateSimpleVector(content);
      this.vectors.set(entry.id, vector);
    }

    // Enforce max entries limit
    if (this.entries.size > this.config.maxEntries) {
      this.pruneOldestEntries(1);
    }

    return entry;
  }

  /**
   * Search memories using hybrid BM25 + vector search
   */
  search(options: MemorySearchOptions): MemorySearchResult[] {
    const {
      query,
      limit = 10,
      types,
      tags,
      startDate,
      endDate,
      minScore = 0.0,
      hybrid = true,
      vectorWeight = this.config.defaultHybridWeights.vector,
      bm25Weight = this.config.defaultHybridWeights.bm25,
    } = options;

    let candidates = Array.from(this.entries.values());

    // Filter by type
    if (types && types.length > 0) {
      candidates = candidates.filter(e => types.includes(e.type));
    }

    // Filter by tags
    if (tags && tags.length > 0) {
      candidates = candidates.filter(e => tags.some(tag => e.tags.includes(tag)));
    }

    // Filter by date range
    if (startDate) {
      candidates = candidates.filter(e => e.timestamp >= startDate);
    }
    if (endDate) {
      candidates = candidates.filter(e => e.timestamp <= endDate);
    }

    // Score candidates
    const results: MemorySearchResult[] = [];

    for (const entry of candidates) {
      let score = 0;
      let vectorScore: number | undefined;
      let bm25Score: number | undefined;

      if (hybrid && this.config.enableVectorSearch && this.config.enableBM25) {
        vectorScore = this.calculateVectorScore(query, entry);
        bm25Score = this.calculateBM25Score(query, entry);
        score = vectorWeight * vectorScore + bm25Weight * bm25Score;
      } else if (this.config.enableVectorSearch) {
        vectorScore = this.calculateVectorScore(query, entry);
        score = vectorScore;
      } else if (this.config.enableBM25) {
        bm25Score = this.calculateBM25Score(query, entry);
        score = bm25Score;
      } else {
        // Fallback to simple text matching
        score = this.calculateTextScore(query, entry);
      }

      if (score >= minScore) {
        results.push({
          entry,
          score,
          vectorScore,
          bm25Score,
        });
      }
    }

    // Sort by score descending and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get a memory entry by ID
   */
  getEntry(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Get all entries for a session
   */
  getSessionEntries(sessionId: string): MemoryEntry[] {
    return Array.from(this.entries.values())
      .filter(e => e.sessionId === sessionId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get entries by type
   */
  getEntriesByType(type: MemoryType): MemoryEntry[] {
    return Array.from(this.entries.values())
      .filter(e => e.type === type)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get entries by tag
   */
  getEntriesByTag(tag: string): MemoryEntry[] {
    return Array.from(this.entries.values())
      .filter(e => e.tags.includes(tag))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Delete an entry
   */
  deleteEntry(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;

    // Remove from indices
    this.entries.delete(id);
    this.vectors.delete(id);
    this.removeFromBM25Index(entry);

    return true;
  }

  /**
   * Get memory statistics
   */
  getStats(): MemoryStats {
    const entries = Array.from(this.entries.values());
    
    const entriesByType: Record<MemoryType, number> = {
      conversation: 0,
      observation: 0,
      insight: 0,
      decision: 0,
      feedback: 0,
      task: 0,
      error: 0,
    };

    const entriesByTag: Record<string, number> = {};
    let totalLength = 0;
    let oldestEntry: Date | undefined;
    let newestEntry: Date | undefined;

    for (const entry of entries) {
      entriesByType[entry.type]++;
      totalLength += entry.content.length;

      for (const tag of entry.tags) {
        entriesByTag[tag] = (entriesByTag[tag] || 0) + 1;
      }

      if (!oldestEntry || entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp;
      }
      if (!newestEntry || entry.timestamp > newestEntry) {
        newestEntry = entry.timestamp;
      }
    }

    return {
      totalEntries: entries.length,
      entriesByType,
      entriesByTag,
      oldestEntry,
      newestEntry,
      averageEntryLength: entries.length > 0 ? totalLength / entries.length : 0,
      indexSize: this.entries.size + this.vectors.size + this.invertedIndex.size,
    };
  }

  /**
   * Get daily memory for a specific date
   */
  getDailyMemory(date: Date): DailyMemory {
    const dateStr = this.formatDate(date);
    const entries = Array.from(this.entries.values())
      .filter(e => this.formatDate(e.timestamp) === dateStr)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      date: dateStr,
      filePath: `${this.memoryDir}/${dateStr}.md`,
      entries,
    };
  }

  /**
   * Get consolidated memory (all entries summarized)
   */
  getConsolidatedMemory(): ConsolidatedMemory {
    const entries = Array.from(this.entries.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Generate simple summary (in real implementation, use LLM)
    const typeCounts = this.getStats().entriesByType;
    const summary = `Memory contains ${entries.length} entries: ` +
      Object.entries(typeCounts)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${count} ${type}`)
        .join(', ');

    // Extract key insights (simplified)
    const keyInsights = entries
      .filter(e => e.type === 'insight' || e.type === 'decision')
      .slice(0, 10)
      .map(e => e.content.substring(0, 200));

    return {
      entries,
      lastUpdated: new Date(),
      summary,
      keyInsights,
    };
  }

  /**
   * Clear all memories
   */
  clear(): void {
    this.entries.clear();
    this.vectors.clear();
    this.invertedIndex.clear();
    this.documentFrequencies.clear();
    this.totalDocuments = 0;
  }

  // Private methods

  private generateEntryId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private generateSimpleVector(content: string): number[] {
    // Simplified vector generation - in real implementation, use an embedding model
    // This creates a simple hash-based vector for demonstration
    const vector: number[] = new Array(this.config.vectorDimension).fill(0);
    
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      vector[i % this.config.vectorDimension] += char / 255;
    }

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      return vector.map(v => v / magnitude);
    }
    return vector;
  }

  private calculateVectorScore(query: string, entry: MemoryEntry): number {
    const queryVector = this.generateSimpleVector(query);
    const entryVector = this.vectors.get(entry.id);
    
    if (!entryVector) return 0;

    // Cosine similarity
    let dotProduct = 0;
    let queryMagnitude = 0;
    let entryMagnitude = 0;

    for (let i = 0; i < queryVector.length; i++) {
      dotProduct += queryVector[i] * entryVector[i];
      queryMagnitude += queryVector[i] * queryVector[i];
      entryMagnitude += entryVector[i] * entryVector[i];
    }

    queryMagnitude = Math.sqrt(queryMagnitude);
    entryMagnitude = Math.sqrt(entryMagnitude);

    if (queryMagnitude === 0 || entryMagnitude === 0) return 0;

    return dotProduct / (queryMagnitude * entryMagnitude);
  }

  private updateBM25Index(entry: MemoryEntry): void {
    const tokens = this.tokenize(entry.content);
    const uniqueTokens = new Set(tokens);

    for (const token of uniqueTokens) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set());
      }
      this.invertedIndex.get(token)!.add(entry.id);
      this.documentFrequencies.set(token, (this.documentFrequencies.get(token) || 0) + 1);
    }

    this.totalDocuments++;
  }

  private removeFromBM25Index(entry: MemoryEntry): void {
    const tokens = this.tokenize(entry.content);
    const uniqueTokens = new Set(tokens);

    for (const token of uniqueTokens) {
      const entrySet = this.invertedIndex.get(token);
      if (entrySet) {
        entrySet.delete(entry.id);
        if (entrySet.size === 0) {
          this.invertedIndex.delete(token);
          this.documentFrequencies.delete(token);
        } else {
          this.documentFrequencies.set(token, (this.documentFrequencies.get(token) || 1) - 1);
        }
      }
    }

    this.totalDocuments--;
  }

  private calculateBM25Score(query: string, entry: MemoryEntry): number {
    const k1 = 1.5;
    const b = 0.75;
    const queryTokens = this.tokenize(query);
    const entryTokens = this.tokenize(entry.content);
    
    const avgDocLength = this.totalDocuments > 0
      ? Array.from(this.entries.values()).reduce((sum, e) => sum + this.tokenize(e.content).length, 0) / this.totalDocuments
      : 1;

    let score = 0;

    for (const token of queryTokens) {
      const df = this.documentFrequencies.get(token) || 0;
      const idf = Math.log((this.totalDocuments - df + 0.5) / (df + 0.5) + 1);
      
      const tf = entryTokens.filter(t => t === token).length;
      const docLength = entryTokens.length;
      
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
      
      score += idf * (numerator / denominator);
    }

    return score;
  }

  private calculateTextScore(query: string, entry: MemoryEntry): number {
    const queryLower = query.toLowerCase();
    const contentLower = entry.content.toLowerCase();
    
    if (contentLower.includes(queryLower)) {
      return 1.0;
    }

    const queryTokens = this.tokenize(query);
    const contentTokens = this.tokenize(entry.content);
    
    let matches = 0;
    for (const token of queryTokens) {
      if (contentTokens.includes(token)) {
        matches++;
      }
    }

    return matches / queryTokens.length;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  private pruneOldestEntries(count: number): void {
    const sorted = Array.from(this.entries.entries())
      .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());

    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      const [id] = sorted[i];
      this.deleteEntry(id);
    }
  }
}
