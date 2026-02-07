/**
 * Plugin Manifest Loader
 *
 * Loads and validates applypilot.plugin.json manifest files.
 * Implements PRD section 16.5 - Plugin Architecture.
 */

import { readFile, access } from 'fs/promises';
import * as path from 'path';

export interface ApplyPilotPluginManifest {
  // Required fields
  name: string;
  version: string;
  main: string;

  // Optional metadata
  description?: string;
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;

  // Plugin capabilities
  capabilities?: string[];

  // Dependencies
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;

  // Configuration schema
  configSchema?: {
    type: 'object';
    properties: Record<string, ConfigSchemaProperty>;
    required?: string[];
  };

  // Hooks registration
  hooks?: {
    [hookPoint: string]: string;
  };

  // Portal connectors provided by this plugin
  portals?: string[];

  // Tools provided by this plugin
  tools?: string[];

  // Minimum ApplyPilot version required
  minimumApplyPilotVersion?: string;

  // Entry points for different environments
  entryPoints?: {
    node?: string;
    browser?: string;
    cli?: string;
  };

  // Plugin settings
  settings?: {
    // Whether the plugin can be disabled
    canDisable?: boolean;
    // Whether the plugin requires restart after config change
    requiresRestart?: boolean;
    // Default enabled state
    defaultEnabled?: boolean;
  };
}

export interface ConfigSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: ConfigSchemaProperty;
  properties?: Record<string, ConfigSchemaProperty>;
  required?: string[];
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifest?: ApplyPilotPluginManifest;
}

export class ManifestLoader {
  private readonly manifestFileName = 'applypilot.plugin.json';

  /**
   * Load manifest from a plugin directory
   */
  async load(pluginDir: string): Promise<ApplyPilotPluginManifest> {
    const manifestPath = path.join(pluginDir, this.manifestFileName);

    // Check if manifest exists
    try {
      await access(manifestPath);
    } catch {
      throw new Error(`Manifest not found: ${manifestPath}`);
    }

    // Read and parse manifest
    const content = await readFile(manifestPath, 'utf-8');
    let manifest: ApplyPilotPluginManifest;

    try {
      manifest = JSON.parse(content) as ApplyPilotPluginManifest;
    } catch (error) {
      throw new Error(`Invalid JSON in manifest: ${manifestPath}`);
    }

    // Validate manifest
    const validation = this.validate(manifest);
    if (!validation.valid) {
      throw new Error(
        `Invalid manifest: ${validation.errors.join(', ')}`
      );
    }

    // Resolve main entry path
    manifest.main = path.resolve(pluginDir, manifest.main);

    // Resolve entry points if specified
    if (manifest.entryPoints) {
      if (manifest.entryPoints.node) {
        manifest.entryPoints.node = path.resolve(pluginDir, manifest.entryPoints.node);
      }
      if (manifest.entryPoints.browser) {
        manifest.entryPoints.browser = path.resolve(pluginDir, manifest.entryPoints.browser);
      }
      if (manifest.entryPoints.cli) {
        manifest.entryPoints.cli = path.resolve(pluginDir, manifest.entryPoints.cli);
      }
    }

    return manifest;
  }

  /**
   * Validate manifest structure
   */
  validate(manifest: unknown): ManifestValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!manifest || typeof manifest !== 'object') {
      return { valid: false, errors: ['Manifest must be an object'], warnings: [] };
    }

    const m = manifest as ApplyPilotPluginManifest;

    // Required fields
    if (!m.name || typeof m.name !== 'string') {
      errors.push('Missing required field: name');
    } else if (!/^[a-z0-9-]+$/.test(m.name)) {
      errors.push('Plugin name must contain only lowercase letters, numbers, and hyphens');
    }

    if (!m.version || typeof m.version !== 'string') {
      errors.push('Missing required field: version');
    } else if (!this.isValidSemver(m.version)) {
      warnings.push('Version should follow semantic versioning (e.g., 1.0.0)');
    }

    if (!m.main || typeof m.main !== 'string') {
      errors.push('Missing required field: main');
    }

    // Optional fields validation
    if (m.description && typeof m.description !== 'string') {
      warnings.push('Description should be a string');
    }

    if (m.author && typeof m.author !== 'string') {
      warnings.push('Author should be a string');
    }

    if (m.capabilities && !Array.isArray(m.capabilities)) {
      errors.push('Capabilities must be an array');
    }

    if (m.dependencies && typeof m.dependencies !== 'object') {
      errors.push('Dependencies must be an object');
    }

    if (m.configSchema && m.configSchema.type !== 'object') {
      errors.push('Config schema type must be "object"');
    }

    if (m.hooks && typeof m.hooks !== 'object') {
      errors.push('Hooks must be an object');
    }

    if (m.minimumApplyPilotVersion && !this.isValidSemver(m.minimumApplyPilotVersion)) {
      warnings.push('minimumApplyPilotVersion should follow semantic versioning');
    }

    // Validate entry points
    if (m.entryPoints) {
      if (m.entryPoints.node && typeof m.entryPoints.node !== 'string') {
        errors.push('entryPoints.node must be a string');
      }
      if (m.entryPoints.browser && typeof m.entryPoints.browser !== 'string') {
        errors.push('entryPoints.browser must be a string');
      }
      if (m.entryPoints.cli && typeof m.entryPoints.cli !== 'string') {
        errors.push('entryPoints.cli must be a string');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      manifest: errors.length === 0 ? m : undefined,
    };
  }

  /**
   * Convert ApplyPilot manifest to internal PluginManifest format
   */
  convertToInternalManifest(manifest: ApplyPilotPluginManifest): PluginManifest {
    return {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      main: manifest.main,
      dependencies: manifest.dependencies ? Object.keys(manifest.dependencies) : undefined,
      capabilities: manifest.capabilities,
      configSchema: manifest.configSchema,
    };
  }

  /**
   * Check if a plugin directory has a manifest
   */
  async hasManifest(pluginDir: string): Promise<boolean> {
    const manifestPath = path.join(pluginDir, this.manifestFileName);
    try {
      await access(manifestPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get manifest file path
   */
  getManifestPath(pluginDir: string): string {
    return path.join(pluginDir, this.manifestFileName);
  }

  /**
   * Validate semantic version string
   */
  private isValidSemver(version: string): boolean {
    const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*))?(?:\+([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*))?$/;
    return semverRegex.test(version);
  }
}

// Singleton instance
let loaderInstance: ManifestLoader | null = null;

export function getManifestLoader(): ManifestLoader {
  if (!loaderInstance) {
    loaderInstance = new ManifestLoader();
  }
  return loaderInstance;
}

// Export convenience functions
export async function loadManifest(pluginDir: string): Promise<ApplyPilotPluginManifest> {
  return getManifestLoader().load(pluginDir);
}

export function validateManifest(manifest: unknown): ManifestValidationResult {
  return getManifestLoader().validate(manifest);
}
