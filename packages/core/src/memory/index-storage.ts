/**
 * Memory Index Storage - Vector and BM25 Index Persistence
 *
 * Implements PRD section 13.9 - Memory Index Persistence.
 * Stores vector embeddings and BM25 indices to disk for fast startup.
 */

import { EventEmitter } from 'events';

export interface IndexStorageOptions {
  basePath: string;
  autoSaveIntervalMs: number;
  compressionEnabled: boolean;
  checksumValidation: boolean;
  incrementalUpdate: boolean;
}

export interface VectorIndex {
  version: string;
  documentCount: number;
  dimension: number;
  embeddings: Map<string, Float32Array>;
  metadata: Map<string, VectorMetadata>;
  updatedAt: string;
}

export interface VectorMetadata {
  filePath: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
}

export interface BM25Index {
  version: string;
  documentCount: number;
  termFrequency: Map<string, Map<string, number>>; // term -> docId -> freq
  documentFrequency: Map<string, number>; // term -> doc count
  documentLengths: Map<string, number>; // docId -> length
  avgDocumentLength: number;
  updatedAt: string;
}

export interface IndexMetadata {
  version: string;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  vectorDimension: number;
  checksums: {
    vectors: string;
    bm25: string;
  };
}

export interface IndexStorageStats {
  vectorIndexSize: number;
  bm25IndexSize: number;
  documentCount: number;
  lastUpdated: string;
  isDirty: boolean;
}

/**
 * Memory Index Storage Manager
 *
 * Handles:
 * - Vector embeddings persistence
 * - BM25 index persistence
 * - Incremental updates
 * - Checksum validation
 * - Background indexing
 */
export class IndexStorage extends EventEmitter {
  private options: IndexStorageOptions;
  private vectorIndex: VectorIndex;
  private bm25Index: BM25Index;
  private metadata: IndexMetadata;
  private isDirty = false;
  private autoSaveInterval?: NodeJS.Timeout;

  constructor(options: Partial<IndexStorageOptions> = {}) {
    super();

    this.options = {
      basePath: options.basePath || './.memory-index',
      autoSaveIntervalMs: options.autoSaveIntervalMs || 5 * 60 * 1000, // 5 minutes
      compressionEnabled: options.compressionEnabled ?? true,
      checksumValidation: options.checksumValidation ?? true,
      incrementalUpdate: options.incrementalUpdate ?? true,
    };

    // Initialize empty indices
    this.vectorIndex = this.createEmptyVectorIndex();
    this.bm25Index = this.createEmptyBM25Index();
    this.metadata = this.createEmptyMetadata();

    // Start auto-save if enabled
    if (this.options.autoSaveIntervalMs > 0) {
      this.startAutoSave();
    }
  }

  /**
   * Initialize and load existing indices
   */
  async initialize(): Promise<void> {
    this.emit('index:initializing');

    try {
      // Try to load existing indices
      const loaded = await this.loadIndices();

      if (loaded) {
        this.emit('index:loaded', {
          documentCount: this.vectorIndex.documentCount,
          vectorDimension: this.vectorIndex.dimension,
        });
      } else {
        this.emit('index:created');
      }
    } catch (error) {
      this.emit('index:error', error);
      // Continue with empty indices
    }
  }

  /**
   * Add document to indices
   */
  async addDocument(
    docId: string,
    content: string,
    embedding: Float32Array,
    metadata: VectorMetadata
  ): Promise<void> {
    // Add to vector index
    this.vectorIndex.embeddings.set(docId, embedding);
    this.vectorIndex.metadata.set(docId, metadata);
    this.vectorIndex.documentCount++;
    this.vectorIndex.updatedAt = new Date().toISOString();

    // Add to BM25 index
    this.addToBM25Index(docId, content);

    this.isDirty = true;

    this.emit('document:added', { docId, metadata });
  }

  /**
   * Remove document from indices
   */
  async removeDocument(docId: string): Promise<void> {
    // Remove from vector index
    this.vectorIndex.embeddings.delete(docId);
    this.vectorIndex.metadata.delete(docId);
    this.vectorIndex.documentCount = Math.max(0, this.vectorIndex.documentCount - 1);

    // Remove from BM25 index
    this.removeFromBM25Index(docId);

    this.isDirty = true;

    this.emit('document:removed', { docId });
  }

  /**
   * Update document in indices
   */
  async updateDocument(
    docId: string,
    content: string,
    embedding: Float32Array,
    metadata: VectorMetadata
  ): Promise<void> {
    // Remove old data
    await this.removeDocument(docId);

    // Add new data
    await this.addDocument(docId, content, embedding, metadata);

    this.emit('document:updated', { docId, metadata });
  }

  /**
   * Get vector embedding for document
   */
  getVector(docId: string): Float32Array | undefined {
    return this.vectorIndex.embeddings.get(docId);
  }

  /**
   * Get metadata for document
   */
  getMetadata(docId: string): VectorMetadata | undefined {
    return this.vectorIndex.metadata.get(docId);
  }

  /**
   * Get all document IDs
   */
  getDocumentIds(): string[] {
    return Array.from(this.vectorIndex.embeddings.keys());
  }

  /**
   * Get BM25 score for term in document
   */
  getBM25Score(term: string, docId: string): number {
    const tf = this.bm25Index.termFrequency.get(term)?.get(docId) || 0;
    const df = this.bm25Index.documentFrequency.get(term) || 0;
    const docLength = this.bm25Index.documentLengths.get(docId) || 0;
    const avgLength = this.bm25Index.avgDocumentLength || 1;

    // BM25 formula parameters
    const k1 = 1.5;
    const b = 0.75;

    // IDF calculation
    const N = this.bm25Index.documentCount;
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

    // TF normalization
    const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgLength)));

    return idf * tfNorm;
  }

  /**
   * Save indices to disk
   */
  async save(): Promise<void> {
    if (!this.isDirty) {
      return;
    }

    this.emit('index:saving');

    try {
      // Update metadata
      this.metadata.updatedAt = new Date().toISOString();
      this.metadata.documentCount = this.vectorIndex.documentCount;
      this.metadata.vectorDimension = this.vectorIndex.dimension;

      // Calculate checksums
      if (this.options.checksumValidation) {
        this.metadata.checksums = {
          vectors: await this.calculateChecksum(this.vectorIndex),
          bm25: await this.calculateChecksum(this.bm25Index),
        };
      }

      // Save indices
      await this.saveVectorIndex();
      await this.saveBM25Index();
      await this.saveMetadata();

      this.isDirty = false;

      this.emit('index:saved', {
        documentCount: this.vectorIndex.documentCount,
        timestamp: this.metadata.updatedAt,
      });
    } catch (error) {
      this.emit('index:saveError', error);
      throw error;
    }
  }

  /**
   * Load indices from disk
   */
  async loadIndices(): Promise<boolean> {
    try {
      // Load metadata first
      const metadataLoaded = await this.loadMetadata();
      if (!metadataLoaded) {
        return false;
      }

      // Load vector index
      const vectorLoaded = await this.loadVectorIndex();
      if (!vectorLoaded) {
        return false;
      }

      // Load BM25 index
      const bm25Loaded = await this.loadBM25Index();
      if (!bm25Loaded) {
        return false;
      }

      // Validate checksums
      if (this.options.checksumValidation) {
        const valid = await this.validateChecksums();
        if (!valid) {
          this.emit('index:checksumInvalid');
          return false;
        }
      }

      return true;
    } catch (error) {
      this.emit('index:loadError', error);
      return false;
    }
  }

  /**
   * Get storage statistics
   */
  getStats(): IndexStorageStats {
    return {
      vectorIndexSize: this.vectorIndex.embeddings.size,
      bm25IndexSize: this.bm25Index.documentCount,
      documentCount: this.vectorIndex.documentCount,
      lastUpdated: this.metadata.updatedAt,
      isDirty: this.isDirty,
    };
  }

  /**
   * Clear all indices
   */
  async clear(): Promise<void> {
    this.vectorIndex = this.createEmptyVectorIndex();
    this.bm25Index = this.createEmptyBM25Index();
    this.metadata = this.createEmptyMetadata();
    this.isDirty = true;

    // Delete files
    await this.deleteIndexFiles();

    this.emit('index:cleared');
  }

  /**
   * Dispose
   */
  async dispose(): Promise<void> {
    // Stop auto-save
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    // Final save
    await this.save();

    this.removeAllListeners();
  }

  // Private helper methods

  private createEmptyVectorIndex(): VectorIndex {
    return {
      version: '1.0',
      documentCount: 0,
      dimension: 384, // Default embedding dimension
      embeddings: new Map(),
      metadata: new Map(),
      updatedAt: new Date().toISOString(),
    };
  }

  private createEmptyBM25Index(): BM25Index {
    return {
      version: '1.0',
      documentCount: 0,
      termFrequency: new Map(),
      documentFrequency: new Map(),
      documentLengths: new Map(),
      avgDocumentLength: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  private createEmptyMetadata(): IndexMetadata {
    return {
      version: '1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      documentCount: 0,
      vectorDimension: 384,
      checksums: {
        vectors: '',
        bm25: '',
      },
    };
  }

  private addToBM25Index(docId: string, content: string): void {
    // Tokenize content
    const tokens = this.tokenize(content);
    const docLength = tokens.length;

    // Update document length
    this.bm25Index.documentLengths.set(docId, docLength);

    // Calculate term frequencies
    const termFreq = new Map<string, number>();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    // Update term frequency index
    for (const [term, freq] of termFreq) {
      if (!this.bm25Index.termFrequency.has(term)) {
        this.bm25Index.termFrequency.set(term, new Map());
      }
      this.bm25Index.termFrequency.get(term)!.set(docId, freq);

      // Update document frequency
      this.bm25Index.documentFrequency.set(
        term,
        (this.bm25Index.documentFrequency.get(term) || 0) + 1
      );
    }

    // Update average document length
    const totalLength = Array.from(this.bm25Index.documentLengths.values()).reduce((a, b) => a + b, 0);
    this.bm25Index.avgDocumentLength = totalLength / this.bm25Index.documentLengths.size;
    this.bm25Index.documentCount++;
    this.bm25Index.updatedAt = new Date().toISOString();
  }

  private removeFromBM25Index(docId: string): void {
    // Remove from term frequencies
    for (const [term, docFreqs] of this.bm25Index.termFrequency) {
      if (docFreqs.has(docId)) {
        docFreqs.delete(docId);
        // Update document frequency
        const df = this.bm25Index.documentFrequency.get(term) || 0;
        if (df > 1) {
          this.bm25Index.documentFrequency.set(term, df - 1);
        } else {
          this.bm25Index.documentFrequency.delete(term);
        }
      }
      // Clean up empty terms
      if (docFreqs.size === 0) {
        this.bm25Index.termFrequency.delete(term);
      }
    }

    // Remove document length
    this.bm25Index.documentLengths.delete(docId);

    // Update average document length
    if (this.bm25Index.documentLengths.size > 0) {
      const totalLength = Array.from(this.bm25Index.documentLengths.values()).reduce((a, b) => a + b, 0);
      this.bm25Index.avgDocumentLength = totalLength / this.bm25Index.documentLengths.size;
    } else {
      this.bm25Index.avgDocumentLength = 0;
    }

    this.bm25Index.documentCount = Math.max(0, this.bm25Index.documentCount - 1);
  }

  private tokenize(text: string): string[] {
    // Simple tokenization - in production, use a proper tokenizer
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private async calculateChecksum(data: unknown): Promise<string> {
    // In real implementation, use crypto.createHash
    // For now, return a simple hash
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private async validateChecksums(): Promise<boolean> {
    const vectorChecksum = await this.calculateChecksum(this.vectorIndex);
    const bm25Checksum = await this.calculateChecksum(this.bm25Index);

    return (
      vectorChecksum === this.metadata.checksums.vectors &&
      bm25Checksum === this.metadata.checksums.bm25
    );
  }

  private async saveVectorIndex(): Promise<void> {
    const path = `${this.options.basePath}/vectors.bin`;
    const data = this.serializeVectorIndex();
    await this.writeFile(path, data);
  }

  private async saveBM25Index(): Promise<void> {
    const path = `${this.options.basePath}/bm25.bin`;
    const data = this.serializeBM25Index();
    await this.writeFile(path, data);
  }

  private async saveMetadata(): Promise<void> {
    const path = `${this.options.basePath}/metadata.json`;
    await this.writeFile(path, JSON.stringify(this.metadata, null, 2));
  }

  private async loadVectorIndex(): Promise<boolean> {
    const path = `${this.options.basePath}/vectors.bin`;
    try {
      const data = await this.readFile(path);
      if (data) {
        this.vectorIndex = this.deserializeVectorIndex(data);
        return true;
      }
    } catch {
      // File doesn't exist or is corrupted
    }
    return false;
  }

  private async loadBM25Index(): Promise<boolean> {
    const path = `${this.options.basePath}/bm25.bin`;
    try {
      const data = await this.readFile(path);
      if (data) {
        this.bm25Index = this.deserializeBM25Index(data);
        return true;
      }
    } catch {
      // File doesn't exist or is corrupted
    }
    return false;
  }

  private async loadMetadata(): Promise<boolean> {
    const path = `${this.options.basePath}/metadata.json`;
    try {
      const data = await this.readFile(path);
      if (data) {
        this.metadata = JSON.parse(data);
        return true;
      }
    } catch {
      // File doesn't exist or is corrupted
    }
    return false;
  }

  private async deleteIndexFiles(): Promise<void> {
    await this.deleteFile(`${this.options.basePath}/vectors.bin`);
    await this.deleteFile(`${this.options.basePath}/bm25.bin`);
    await this.deleteFile(`${this.options.basePath}/metadata.json`);
  }

  private serializeVectorIndex(): string {
    // Convert Map to serializable object
    const obj = {
      version: this.vectorIndex.version,
      documentCount: this.vectorIndex.documentCount,
      dimension: this.vectorIndex.dimension,
      embeddings: Array.from(this.vectorIndex.embeddings.entries()).map(([id, vec]) => ({
        id,
        vector: Array.from(vec),
      })),
      metadata: Array.from(this.vectorIndex.metadata.entries()),
      updatedAt: this.vectorIndex.updatedAt,
    };
    return JSON.stringify(obj);
  }

  private deserializeVectorIndex(data: string): VectorIndex {
    const obj = JSON.parse(data);
    const embeddings = new Map<string, Float32Array>();

    for (const { id, vector } of obj.embeddings) {
      embeddings.set(id, new Float32Array(vector));
    }

    return {
      version: obj.version,
      documentCount: obj.documentCount,
      dimension: obj.dimension,
      embeddings,
      metadata: new Map(obj.metadata),
      updatedAt: obj.updatedAt,
    };
  }

  private serializeBM25Index(): string {
    // Convert Maps to serializable objects
    const termFreq: Record<string, Record<string, number>> = {};
    for (const [term, docFreqs] of this.bm25Index.termFrequency) {
      termFreq[term] = Object.fromEntries(docFreqs);
    }

    const obj = {
      version: this.bm25Index.version,
      documentCount: this.bm25Index.documentCount,
      termFrequency: termFreq,
      documentFrequency: Object.fromEntries(this.bm25Index.documentFrequency),
      documentLengths: Object.fromEntries(this.bm25Index.documentLengths),
      avgDocumentLength: this.bm25Index.avgDocumentLength,
      updatedAt: this.bm25Index.updatedAt,
    };

    return JSON.stringify(obj);
  }

  private deserializeBM25Index(data: string): BM25Index {
    const obj = JSON.parse(data);

    const termFrequency = new Map<string, Map<string, number>>();
    for (const [term, docFreqs] of Object.entries(obj.termFrequency)) {
      termFrequency.set(term, new Map(Object.entries(docFreqs as Record<string, number>)));
    }

    return {
      version: obj.version,
      documentCount: obj.documentCount,
      termFrequency,
      documentFrequency: new Map(Object.entries(obj.documentFrequency)),
      documentLengths: new Map(Object.entries(obj.documentLengths)),
      avgDocumentLength: obj.avgDocumentLength,
      updatedAt: obj.updatedAt,
    };
  }

  private startAutoSave(): void {
    this.autoSaveInterval = setInterval(() => {
      this.save().catch(() => {});
    }, this.options.autoSaveIntervalMs);
  }

  // File operations (simulated - would use fs in real implementation)
  private async readFile(path: string): Promise<string | null> {
    // In real implementation: fs.readFile(path, 'utf-8')
    return null;
  }

  private async writeFile(path: string, content: string): Promise<void> {
    // In real implementation: fs.writeFile(path, content)
    console.log(`Writing index file: ${path}`);
  }

  private async deleteFile(path: string): Promise<void> {
    // In real implementation: fs.unlink(path)
    console.log(`Deleting index file: ${path}`);
  }
}

// Export factory function
export function createIndexStorage(options?: Partial<IndexStorageOptions>): IndexStorage {
  return new IndexStorage(options);
}
