/**
 * Secrets Manager Implementation
 *
 * Implements PRD Section 14.2 - Secrets Storage.
 * Manages secure storage and redaction of sensitive data.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash, randomBytes } from 'crypto';

export interface Secret {
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, string>;
}

export interface SecretsConfig {
  storagePath: string;
  permissions: number;
  encryptionEnabled: boolean;
  redactionPatterns: RegExp[];
}

export interface RedactionRule {
  pattern: RegExp;
  replacement: string;
  description: string;
}

/**
 * Secrets Manager implementation following PRD 14.2
 */
export class SecretsManager {
  private config: SecretsConfig;
  private secrets = new Map<string, Secret>();
  private redactionRules: RedactionRule[] = [];
  private static instance: SecretsManager;

  private constructor(config?: Partial<SecretsConfig>) {
    this.config = {
      storagePath: join(homedir(), '.applypilot', 'credentials', 'secrets.json'),
      permissions: 0o600,
      encryptionEnabled: false, // Can be enabled for additional security
      redactionPatterns: [],
      ...config,
    };

    this.initializeRedactionRules();
    this.loadSecrets();
  }

  static getInstance(config?: Partial<SecretsConfig>): SecretsManager {
    if (!SecretsManager.instance) {
      SecretsManager.instance = new SecretsManager(config);
    }
    return SecretsManager.instance;
  }

  static resetInstance(): void {
    SecretsManager.instance = undefined as unknown as SecretsManager;
  }

  /**
   * Initialize default redaction rules
   */
  private initializeRedactionRules(): void {
    this.redactionRules = [
      {
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        replacement: '[EMAIL_REDACTED]',
        description: 'Email addresses',
      },
      {
        pattern: /\b(?:\d{3}-\d{2}-\d{4}|\d{9})\b/g,
        replacement: '[SSN_REDACTED]',
        description: 'Social Security Numbers',
      },
      {
        pattern: /\b(?:\d{4}[\s-]?){4}\b/g,
        replacement: '[CARD_REDACTED]',
        description: 'Credit card numbers',
      },
      {
        pattern: /sk-[a-zA-Z0-9]{48}/g,
        replacement: '[API_KEY_REDACTED]',
        description: 'OpenAI API keys',
      },
      {
        pattern: /[a-f0-9]{32,64}/gi,
        replacement: '[TOKEN_REDACTED]',
        description: 'Generic tokens and hashes',
      },
      {
        pattern: /password[:\s]*[^\s]+/gi,
        replacement: 'password: [PASSWORD_REDACTED]',
        description: 'Password fields',
      },
      {
        pattern: /api[_-]?key[:\s]*[^\s]+/gi,
        replacement: 'api_key: [API_KEY_REDACTED]',
        description: 'API key fields',
      },
      {
        pattern: /secret[:\s]*[^\s]+/gi,
        replacement: 'secret: [SECRET_REDACTED]',
        description: 'Secret fields',
      },
      {
        pattern: /token[:\s]*[^\s]+/gi,
        replacement: 'token: [TOKEN_REDACTED]',
        description: 'Token fields',
      },
      {
        pattern: /\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
        replacement: '[PHONE_REDACTED]',
        description: 'Phone numbers',
      },
    ];
  }

  /**
   * Load secrets from storage
   */
  private loadSecrets(): void {
    if (!existsSync(this.config.storagePath)) {
      this.ensureDirectory();
      return;
    }

    try {
      const content = readFileSync(this.config.storagePath, 'utf-8');
      const data = JSON.parse(content);

      for (const [key, secret] of Object.entries(data)) {
        this.secrets.set(key, secret as Secret);
      }
    } catch (error) {
      console.warn('Failed to load secrets, starting with empty store');
    }
  }

  /**
   * Save secrets to storage
   */
  private saveSecrets(): void {
    this.ensureDirectory();

    const data: Record<string, Secret> = {};
    for (const [key, secret] of this.secrets) {
      data[key] = secret;
    }

    const content = JSON.stringify(data, null, 2);
    writeFileSync(this.config.storagePath, content, { mode: this.config.permissions });
  }

  /**
   * Ensure credentials directory exists with proper permissions
   */
  private ensureDirectory(): void {
    const dir = join(homedir(), '.applypilot', 'credentials');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Set a secret
   */
  set(key: string, value: string, metadata?: Record<string, string>): void {
    const now = Date.now();
    const existing = this.secrets.get(key);

    const secret: Secret = {
      key,
      value,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      metadata,
    };

    this.secrets.set(key, secret);
    this.saveSecrets();
  }

  /**
   * Get a secret
   */
  get(key: string): string | undefined {
    return this.secrets.get(key)?.value;
  }

  /**
   * Check if a secret exists
   */
  has(key: string): boolean {
    return this.secrets.has(key);
  }

  /**
   * Delete a secret
   */
  delete(key: string): boolean {
    const deleted = this.secrets.delete(key);
    if (deleted) {
      this.saveSecrets();
    }
    return deleted;
  }

  /**
   * Get all secret keys (not values)
   */
  getKeys(): string[] {
    return Array.from(this.secrets.keys());
  }

  /**
   * Redact sensitive information from text
   */
  redact(text: string): string {
    let redacted = text;

    for (const rule of this.redactionRules) {
      redacted = redacted.replace(rule.pattern, rule.replacement);
    }

    // Also redact any stored secret values
    for (const [key, secret] of this.secrets) {
      if (secret.value.length > 4) {
        const escapedValue = secret.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(escapedValue, 'g');
        redacted = redacted.replace(pattern, `[${key.toUpperCase()}_REDACTED]`);
      }
    }

    return redacted;
  }

  /**
   * Add a custom redaction rule
   */
  addRedactionRule(pattern: RegExp, replacement: string, description: string): void {
    this.redactionRules.push({ pattern, replacement, description });
  }

  /**
   * Get all redaction rules
   */
  getRedactionRules(): RedactionRule[] {
    return [...this.redactionRules];
  }

  /**
   * Hash a value for comparison without storing
   */
  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * Generate a secure random token
   */
  generateToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Get storage path
   */
  getStoragePath(): string {
    return this.config.storagePath;
  }

  /**
   * Clear all secrets
   */
  clear(): void {
    this.secrets.clear();
    this.saveSecrets();
  }
}

/**
 * Convenience function to get secrets manager instance
 */
export function getSecretsManager(config?: Partial<SecretsConfig>): SecretsManager {
  return SecretsManager.getInstance(config);
}

/**
 * Redact sensitive information from text using default rules
 */
export function redactSensitiveInfo(text: string): string {
  return getSecretsManager().redact(text);
}
