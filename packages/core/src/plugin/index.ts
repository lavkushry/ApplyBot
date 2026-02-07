/**
 * Plugin System
 * Inspired by OpenClaw's extensible plugin architecture
 * 
 * Usage:
 * ```typescript
 * import { PluginManager, type Plugin, type PluginContext } from '@applypilot/core/plugin';
 * 
 * const manager = new PluginManager({
 *   pluginDirs: ['./plugins'],
 *   builtinPlugins: [myPlugin],
 * });
 * 
 * await manager.initialize();
 * 
 * // Use hooks
 * const context = manager.getContext();
 * context.hooks.register('before:tailor', async (data) => {
 *   // Modify data before tailoring
 *   return data;
 * });
 * ```
 */

export * from './types.js';
export { PluginManager } from './plugin-manager.js';
export { HookRegistryImpl } from './hook-registry.js';
export {
  ManifestLoader,
  getManifestLoader,
  loadManifest,
  validateManifest,
} from './manifest-loader.js';
export type {
  ApplyPilotPluginManifest,
  ConfigSchemaProperty,
  ManifestValidationResult,
} from './manifest-loader.js';
