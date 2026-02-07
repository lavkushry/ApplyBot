import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import type {
  Plugin,
  PluginContext,
  PluginManifest,
  PluginManagerOptions,
  LoadedPlugin,
  PluginState,
  Logger,
} from './types.js';
import { HookRegistryImpl } from './hook-registry.js';

/**
 * Plugin Manager
 * Manages plugin lifecycle: discovery, loading, initialization
 */
export class PluginManager {
  private plugins = new Map<string, LoadedPlugin>();
  private context: PluginContext;
  private options: PluginManagerOptions;
  private logger: Logger;

  constructor(options: PluginManagerOptions) {
    this.options = {
      autoLoad: true,
      strictMode: false,
      ...options,
    };

    this.logger = this.createLogger();
    this.context = this.createContext();

    // Load builtin plugins
    if (options.builtinPlugins) {
      for (const plugin of options.builtinPlugins) {
        this.loadBuiltinPlugin(plugin);
      }
    }

    // Auto-load plugins from directories
    if (this.options.autoLoad) {
      this.discoverAndLoad();
    }
  }

  private createLogger(): Logger {
    return {
      debug: (msg, ...args) => console.debug(`[PluginManager] ${msg}`, ...args),
      info: (msg, ...args) => console.info(`[PluginManager] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[PluginManager] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[PluginManager] ${msg}`, ...args),
    };
  }

  private createContext(): PluginContext {
    return {
      config: {},
      services: new Map(),
      hooks: new HookRegistryImpl(),
      logger: this.logger,
    };
  }

  /**
   * Discover plugins in configured directories
   */
  discover(): PluginManifest[] {
    const manifests: PluginManifest[] = [];

    for (const dir of this.options.pluginDirs) {
      if (!existsSync(dir)) {
        this.logger.warn(`Plugin directory does not exist: ${dir}`);
        continue;
      }

      // Look for plugin.json or package.json files
      try {
        const entries = readFileSync(dir, { encoding: 'utf8' });
        // This is a simplified version - in production, you'd scan directories
        this.logger.debug(`Scanning plugin directory: ${dir}`);
      } catch {
        // Directory might not exist or be readable
        continue;
      }
    }

    return manifests;
  }

  /**
   * Discover and load all plugins
   */
  async discoverAndLoad(): Promise<void> {
    const manifests = this.discover();
    
    for (const manifest of manifests) {
      try {
        await this.load(manifest);
      } catch (error) {
        this.logger.error(`Failed to load plugin ${manifest.name}:`, error);
      }
    }
  }

  /**
   * Load a builtin plugin
   */
  private loadBuiltinPlugin(plugin: Plugin): void {
    const manifest: PluginManifest = {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      main: '<builtin>',
      dependencies: plugin.dependencies || [],
    };

    this.plugins.set(plugin.name, {
      manifest,
      instance: plugin,
      state: 'loaded',
      dependencies: plugin.dependencies || [],
    });

    this.logger.info(`Loaded builtin plugin: ${plugin.name}@${plugin.version}`);
  }

  /**
   * Load a plugin from manifest
   */
  async load(manifest: PluginManifest): Promise<void> {
    if (this.plugins.has(manifest.name)) {
      throw new Error(`Plugin ${manifest.name} is already loaded`);
    }

    // Check dependencies
    for (const dep of manifest.dependencies || []) {
      if (!this.plugins.has(dep)) {
        throw new Error(`Plugin ${manifest.name} requires ${dep} which is not loaded`);
      }
    }

    // Load plugin module
    const pluginPath = resolve(manifest.main);
    if (!existsSync(pluginPath)) {
      throw new Error(`Plugin main file not found: ${pluginPath}`);
    }

    // Dynamic import
    const module = await import(pluginPath);
    const PluginClass = module.default || module[manifest.name];
    
    if (!PluginClass) {
      throw new Error(`Plugin ${manifest.name} does not export a valid plugin class`);
    }

    const instance = new PluginClass() as Plugin;

    this.plugins.set(manifest.name, {
      manifest,
      instance,
      state: 'loaded',
      dependencies: manifest.dependencies || [],
    });

    this.logger.info(`Loaded plugin: ${manifest.name}@${manifest.version}`);
  }

  /**
   * Initialize all loaded plugins
   */
  async initialize(): Promise<void> {
    // Sort plugins by dependency order
    const sorted = this.sortByDependencies();

    for (const [name, plugin] of sorted) {
      try {
        plugin.state = 'loading';
        await plugin.instance.initialize(this.context);
        plugin.state = 'initialized';
        this.logger.info(`Initialized plugin: ${name}`);
      } catch (error) {
        plugin.state = 'error';
        plugin.error = error as Error;
        this.logger.error(`Failed to initialize plugin ${name}:`, error);
        
        if (this.options.strictMode) {
          throw error;
        }
      }
    }
  }

  /**
   * Destroy all plugins
   */
  async destroy(): Promise<void> {
    // Destroy in reverse dependency order
    const sorted = this.sortByDependencies().reverse();

    for (const [name, plugin] of sorted) {
      try {
        if (plugin.instance.destroy) {
          await plugin.instance.destroy();
        }
        this.logger.info(`Destroyed plugin: ${name}`);
      } catch (error) {
        this.logger.error(`Error destroying plugin ${name}:`, error);
      }
    }

    this.plugins.clear();
  }

  /**
   * Get a loaded plugin
   */
  get(name: string): Plugin | undefined {
    return this.plugins.get(name)?.instance;
  }

  /**
   * Check if a plugin is loaded
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get plugin state
   */
  getState(name: string): PluginState | undefined {
    return this.plugins.get(name)?.state;
  }

  /**
   * Get all loaded plugin names
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get plugin context (for use by plugins)
   */
  getContext(): PluginContext {
    return this.context;
  }

  /**
   * Sort plugins by dependency order (topological sort)
   */
  private sortByDependencies(): [string, LoadedPlugin][] {
    const visited = new Set<string>();
    const result: [string, LoadedPlugin][] = [];

    const visit = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);

      const plugin = this.plugins.get(name);
      if (!plugin) return;

      // Visit dependencies first
      for (const dep of plugin.dependencies) {
        visit(dep);
      }

      result.push([name, plugin]);
    };

    for (const name of this.plugins.keys()) {
      visit(name);
    }

    return result;
  }
}
