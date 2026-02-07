/**
 * Hot Reload Configuration Module
 *
 * Implements PRD section 16.6 - Hot-reload Configuration.
 * Watches configuration files and reloads settings without restart.
 */

import { EventEmitter } from 'events';
import { watch, type FSWatcher } from 'fs';
import { readFile, access } from 'fs/promises';
import * as path from 'path';

export interface HotReloadConfig {
  // Configuration file paths to watch
  configPaths: string[];
  // Debounce time in milliseconds
  debounceMs: number;
  // Whether to watch recursively
  recursive: boolean;
  // File patterns to watch (glob patterns)
  patterns: string[];
  // Whether hot reload is enabled
  enabled: boolean;
}

export interface ConfigChangeEvent {
  // Path of the changed file
  path: string;
  // Type of change
  type: 'created' | 'modified' | 'deleted';
  // Timestamp of the change
  timestamp: Date;
  // Previous configuration (if available)
  previousConfig?: unknown;
  // New configuration (if available)
  newConfig?: unknown;
}

export interface ConfigValidator<T = unknown> {
  // Validate configuration
  validate(config: unknown): { valid: boolean; errors: string[] };
  // Parse configuration from string
  parse(content: string): T;
  // Default configuration
  defaultConfig: T;
}

export class HotReloadManager extends EventEmitter {
  private config: HotReloadConfig;
  private watchers = new Map<string, FSWatcher>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private configCache = new Map<string, unknown>();
  private validators = new Map<string, ConfigValidator>();

  constructor(config: Partial<HotReloadConfig> = {}) {
    super();

    this.config = {
      configPaths: ['./config'],
      debounceMs: 1000,
      recursive: true,
      patterns: ['*.json', '*.yaml', '*.yml', '*.toml'],
      enabled: true,
      ...config,
    };
  }

  /**
   * Initialize hot reload watching
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    for (const configPath of this.config.configPaths) {
      await this.watchPath(configPath);
    }

    this.emit('initialized', { paths: this.config.configPaths });
  }

  /**
   * Register a validator for a specific config file
   */
  registerValidator(filePath: string, validator: ConfigValidator): void {
    this.validators.set(path.resolve(filePath), validator);
  }

  /**
   * Watch a specific configuration path
   */
  private async watchPath(configPath: string): Promise<void> {
    const resolvedPath = path.resolve(configPath);

    try {
      await access(resolvedPath);
    } catch {
      console.warn(`[HotReload] Config path does not exist: ${resolvedPath}`);
      return;
    }

    const watcher = watch(
      resolvedPath,
      { recursive: this.config.recursive },
      (eventType, filename) => {
        if (!filename) return;

        const fullPath = path.join(resolvedPath, filename);

        // Check if file matches patterns
        if (!this.matchesPatterns(filename)) {
          return;
        }

        this.handleFileChange(fullPath, eventType as 'rename' | 'change');
      }
    );

    this.watchers.set(resolvedPath, watcher);
    this.emit('watching', { path: resolvedPath });
  }

  /**
   * Handle file change events with debouncing
   */
  private handleFileChange(
    filePath: string,
    eventType: 'rename' | 'change'
  ): void {
    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(async () => {
      await this.processFileChange(filePath, eventType);
      this.debounceTimers.delete(filePath);
    }, this.config.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Process a file change after debounce
   */
  private async processFileChange(
    filePath: string,
    eventType: 'rename' | 'change'
  ): Promise<void> {
    const previousConfig = this.configCache.get(filePath);

    let changeType: ConfigChangeEvent['type'];

    if (eventType === 'rename') {
      // File was created or deleted
      try {
        await access(filePath);
        changeType = 'created';
      } catch {
        changeType = 'deleted';
        this.configCache.delete(filePath);
      }
    } else {
      changeType = 'modified';
    }

    let newConfig: unknown | undefined;

    // Load and validate new configuration
    if (changeType !== 'deleted') {
      try {
        newConfig = await this.loadConfig(filePath);

        // Validate if validator exists
        const validator = this.validators.get(filePath);
        if (validator) {
          const validation = validator.validate(newConfig);
          if (!validation.valid) {
            this.emit('validationError', {
              path: filePath,
              errors: validation.errors,
            });
            return;
          }
        }

        this.configCache.set(filePath, newConfig);
      } catch (error) {
        this.emit('loadError', {
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }

    const event: ConfigChangeEvent = {
      path: filePath,
      type: changeType,
      timestamp: new Date(),
      previousConfig,
      newConfig,
    };

    this.emit('configChanged', event);

    // Emit specific event based on file name
    const fileName = path.basename(filePath);
    this.emit(`configChanged:${fileName}`, event);
  }

  /**
   * Load configuration from file
   */
  private async loadConfig(filePath: string): Promise<unknown> {
    const content = await readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    // Use validator if available
    const validator = this.validators.get(filePath);
    if (validator) {
      return validator.parse(content);
    }

    // Default parsing based on extension
    switch (ext) {
      case '.json':
        return JSON.parse(content);
      case '.yaml':
      case '.yml':
        // In real implementation, use yaml parser
        throw new Error('YAML parsing not implemented');
      case '.toml':
        // In real implementation, use toml parser
        throw new Error('TOML parsing not implemented');
      default:
        return content;
    }
  }

  /**
   * Check if filename matches watch patterns
   */
  private matchesPatterns(filename: string): boolean {
    return this.config.patterns.some((pattern) => {
      // Simple glob matching
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
      );
      return regex.test(filename);
    });
  }

  /**
   * Get cached configuration for a file
   */
  getConfig(filePath: string): unknown | undefined {
    return this.configCache.get(path.resolve(filePath));
  }

  /**
   * Set configuration for a file (without triggering reload)
   */
  setConfig(filePath: string, config: unknown): void {
    this.configCache.set(path.resolve(filePath), config);
  }

  /**
   * Force reload of a specific configuration file
   */
  async reload(filePath: string): Promise<void> {
    const resolvedPath = path.resolve(filePath);
    await this.processFileChange(resolvedPath, 'change');
  }

  /**
   * Add a new path to watch
   */
  async addWatchPath(configPath: string): Promise<void> {
    const resolvedPath = path.resolve(configPath);

    if (this.watchers.has(resolvedPath)) {
      return;
    }

    this.config.configPaths.push(configPath);
    await this.watchPath(configPath);
  }

  /**
   * Remove a watched path
   */
  removeWatchPath(configPath: string): void {
    const resolvedPath = path.resolve(configPath);
    const watcher = this.watchers.get(resolvedPath);

    if (watcher) {
      watcher.close();
      this.watchers.delete(resolvedPath);
      this.emit('unwatched', { path: resolvedPath });
    }

    const index = this.config.configPaths.indexOf(configPath);
    if (index > -1) {
      this.config.configPaths.splice(index, 1);
    }
  }

  /**
   * Get all watched paths
   */
  getWatchedPaths(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * Get all cached configurations
   */
  getAllConfigs(): Map<string, unknown> {
    return new Map(this.configCache);
  }

  /**
   * Dispose and cleanup all watchers
   */
  dispose(): void {
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    // Clear cache
    this.configCache.clear();

    this.emit('disposed');
  }

  /**
   * Pause hot reloading
   */
  pause(): void {
    this.config.enabled = false;
    this.emit('paused');
  }

  /**
   * Resume hot reloading
   */
  async resume(): Promise<void> {
    this.config.enabled = true;
    await this.initialize();
    this.emit('resumed');
  }

  /**
   * Check if hot reload is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

// Singleton instance
let hotReloadInstance: HotReloadManager | null = null;

export function getHotReloadManager(
  config?: Partial<HotReloadConfig>
): HotReloadManager {
  if (!hotReloadInstance) {
    hotReloadInstance = new HotReloadManager(config);
  }
  return hotReloadInstance;
}

// Export convenience functions
export async function initializeHotReload(
  config?: Partial<HotReloadConfig>
): Promise<HotReloadManager> {
  const manager = getHotReloadManager(config);
  await manager.initialize();
  return manager;
}

export function disposeHotReload(): void {
  if (hotReloadInstance) {
    hotReloadInstance.dispose();
    hotReloadInstance = null;
  }
}
