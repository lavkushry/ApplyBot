/**
 * Plugin System Types
 * Inspired by OpenClaw's plugin architecture
 */

export interface PluginContext {
  config: Record<string, unknown>;
  services: Map<string, unknown>;
  hooks: HookRegistry;
  logger: Logger;
}

export interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

export interface HookRegistry {
  register<T = unknown>(hookPoint: string, handler: HookHandler<T>): void;
  unregister<T = unknown>(hookPoint: string, handler: HookHandler<T>): void;
  execute<T = unknown>(hookPoint: string, context: T): Promise<T>;
}

export type HookHandler<T = unknown> = (context: T) => Promise<T> | T;

export interface Plugin {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly author?: string;
  readonly dependencies?: string[];
  
  initialize(context: PluginContext): Promise<void>;
  destroy?(): Promise<void>;
}

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  main: string;
  dependencies?: string[];
  capabilities?: string[];
  configSchema?: Record<string, unknown>;
}

export interface PluginManagerOptions {
  pluginDirs: string[];
  builtinPlugins?: Plugin[];
  autoLoad?: boolean;
  strictMode?: boolean;
}

export type PluginState = 'unloaded' | 'loading' | 'loaded' | 'initialized' | 'error';

export interface LoadedPlugin {
  manifest: PluginManifest;
  instance: Plugin;
  state: PluginState;
  error?: Error;
  dependencies: string[];
}
