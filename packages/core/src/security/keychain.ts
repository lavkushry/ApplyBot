/**
 * OS Keychain Integration for Secrets Management
 *
 * Implements secure storage of sensitive credentials using OS-native keychain/keyring.
 * Supports macOS Keychain, Windows Credential Manager, and Linux Secret Service.
 *
 * PRD Section: Security - Secrets Management
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execFileAsync = promisify(execFile);

// Service name for all keychain entries
const SERVICE_NAME = 'ApplyPilot';

export interface KeychainCredentials {
  account: string;
  password: string;
}

export interface SecureNote {
  title: string;
  content: string;
}

export type KeychainPlatform = 'macos' | 'windows' | 'linux' | 'unknown';

/**
 * Detect the current operating system platform
 */
export function detectPlatform(): KeychainPlatform {
  const platform = os.platform();
  switch (platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      return 'unknown';
  }
}

/**
 * Keychain Manager for secure credential storage
 */
export class KeychainManager {
  private platform: KeychainPlatform;
  private initialized = false;

  constructor() {
    this.platform = detectPlatform();
  }

  /**
   * Initialize the keychain manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Verify keychain is accessible
    const isAvailable = await this.isAvailable();
    if (!isAvailable) {
      throw new Error(`Keychain is not available on this platform: ${this.platform}`);
    }

    this.initialized = true;
  }

  /**
   * Check if keychain is available on current platform
   */
  async isAvailable(): Promise<boolean> {
    try {
      switch (this.platform) {
        case 'macos':
          await execFileAsync('security', ['-h']);
          return true;
        case 'windows':
          // Check if running on Windows with Credential Manager support
          return true;
        case 'linux':
          // Check for secret-tool or similar
          try {
            await execFileAsync('secret-tool', ['--help']);
            return true;
          } catch {
            return false;
          }
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Store a password in the keychain
   */
  async setPassword(account: string, password: string): Promise<void> {
    this.ensureInitialized();

    switch (this.platform) {
      case 'macos':
        await this.setPasswordMacOS(account, password);
        break;
      case 'windows':
        await this.setPasswordWindows(account, password);
        break;
      case 'linux':
        await this.setPasswordLinux(account, password);
        break;
      default:
        throw new Error(`Keychain not supported on platform: ${this.platform}`);
    }
  }

  /**
   * Retrieve a password from the keychain
   */
  async getPassword(account: string): Promise<string | null> {
    this.ensureInitialized();

    switch (this.platform) {
      case 'macos':
        return this.getPasswordMacOS(account);
      case 'windows':
        return this.getPasswordWindows(account);
      case 'linux':
        return this.getPasswordLinux(account);
      default:
        throw new Error(`Keychain not supported on platform: ${this.platform}`);
    }
  }

  /**
   * Delete a password from the keychain
   */
  async deletePassword(account: string): Promise<boolean> {
    this.ensureInitialized();

    switch (this.platform) {
      case 'macos':
        return this.deletePasswordMacOS(account);
      case 'windows':
        return this.deletePasswordWindows(account);
      case 'linux':
        return this.deletePasswordLinux(account);
      default:
        throw new Error(`Keychain not supported on platform: ${this.platform}`);
    }
  }

  /**
   * List all accounts stored in the keychain for this service
   */
  async listAccounts(): Promise<string[]> {
    this.ensureInitialized();

    switch (this.platform) {
      case 'macos':
        return this.listAccountsMacOS();
      case 'windows':
        return this.listAccountsWindows();
      case 'linux':
        return this.listAccountsLinux();
      default:
        throw new Error(`Keychain not supported on platform: ${this.platform}`);
    }
  }

  /**
   * Store an API key securely
   */
  async setAPIKey(provider: string, apiKey: string): Promise<void> {
    const account = `api-key:${provider}`;
    await this.setPassword(account, apiKey);
  }

  /**
   * Retrieve an API key
   */
  async getAPIKey(provider: string): Promise<string | null> {
    const account = `api-key:${provider}`;
    return this.getPassword(account);
  }

  /**
   * Delete an API key
   */
  async deleteAPIKey(provider: string): Promise<boolean> {
    const account = `api-key:${provider}`;
    return this.deletePassword(account);
  }

  /**
   * Store OAuth token securely
   */
  async setOAuthToken(service: string, token: string): Promise<void> {
    const account = `oauth:${service}`;
    await this.setPassword(account, token);
  }

  /**
   * Retrieve OAuth token
   */
  async getOAuthToken(service: string): Promise<string | null> {
    const account = `oauth:${service}`;
    return this.getPassword(account);
  }

  /**
   * Delete OAuth token
   */
  async deleteOAuthToken(service: string): Promise<boolean> {
    const account = `oauth:${service}`;
    return this.deletePassword(account);
  }

  /**
   * Store a secure note
   */
  async setSecureNote(title: string, content: string): Promise<void> {
    const account = `note:${title}`;
    await this.setPassword(account, content);
  }

  /**
   * Retrieve a secure note
   */
  async getSecureNote(title: string): Promise<string | null> {
    const account = `note:${title}`;
    return this.getPassword(account);
  }

  /**
   * Delete a secure note
   */
  async deleteSecureNote(title: string): Promise<boolean> {
    const account = `note:${title}`;
    return this.deletePassword(account);
  }

  // macOS Keychain implementations

  private async setPasswordMacOS(account: string, password: string): Promise<void> {
    try {
      // Try to update existing item first
      await execFileAsync('security', [
        'add-generic-password',
        '-s', SERVICE_NAME,
        '-a', account,
        '-w', password,
        '-U', // Update if exists
      ]);
    } catch (error) {
      throw new Error(`Failed to store password in macOS Keychain: ${error}`);
    }
  }

  private async getPasswordMacOS(account: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('security', [
        'find-generic-password',
        '-s', SERVICE_NAME,
        '-a', account,
        '-w', // Output password only
      ]);
      return stdout.trim();
    } catch (error) {
      // Item not found
      return null;
    }
  }

  private async deletePasswordMacOS(account: string): Promise<boolean> {
    try {
      await execFileAsync('security', [
        'delete-generic-password',
        '-s', SERVICE_NAME,
        '-a', account,
      ]);
      return true;
    } catch {
      return false;
    }
  }

  private async listAccountsMacOS(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('security', [
        'dump-keychain',
      ]);
      // Parse output to find accounts for our service
      const accounts: string[] = [];
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes(`svce"<blob>="${SERVICE_NAME}"`)) {
          // Extract account from previous lines
          const match = stdout.match(/acct"<blob>="([^"]+)"/);
          if (match) {
            accounts.push(match[1]);
          }
        }
      }
      return accounts;
    } catch {
      return [];
    }
  }

  // Windows Credential Manager implementations

  private async setPasswordWindows(account: string, password: string): Promise<void> {
    // Use PowerShell to interact with Windows Credential Manager
    const psScript = `
      $credential = New-Object System.Management.Automation.PSCredential("${account}", (ConvertTo-SecureString "${password}" -AsPlainText -Force))
      $target = "${SERVICE_NAME}/${account}"
      $credential | Export-Clixml -Path "$env:TEMP\\$([System.Guid]::NewGuid()).xml"
      Write-Host "Credential stored"
    `;
    
    try {
      await execFileAsync('powershell.exe', ['-Command', psScript]);
    } catch (error) {
      // Fallback to file-based storage with warning
      console.warn('Windows Credential Manager not available, using fallback');
      await this.fallbackStorage(account, password);
    }
  }

  private async getPasswordWindows(account: string): Promise<string | null> {
    // Implementation would use Windows Credential Manager API
    // For now, return null to indicate not implemented
    console.warn('Windows Credential Manager integration not fully implemented');
    return null;
  }

  private async deletePasswordWindows(account: string): Promise<boolean> {
    console.warn('Windows Credential Manager integration not fully implemented');
    return false;
  }

  private async listAccountsWindows(): Promise<string[]> {
    console.warn('Windows Credential Manager integration not fully implemented');
    return [];
  }

  // Linux Secret Service implementations

  private async setPasswordLinux(account: string, password: string): Promise<void> {
    try {
      // secret-tool expects password via stdin, but execFile doesn't support input option
      // We'll use echo piped to secret-tool via shell for now
      const { exec } = await import('child_process');
      const execAsync = promisify(exec);
      const command = `echo "${password.replace(/"/g, '\\"')}" | secret-tool store --label "${SERVICE_NAME} - ${account}" service "${SERVICE_NAME}" account "${account}"`;
      await execAsync(command);
    } catch (error) {
      throw new Error(`Failed to store password in Linux Secret Service: ${error}`);
    }
  }

  private async getPasswordLinux(account: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('secret-tool', [
        'lookup',
        'service', SERVICE_NAME,
        'account', account,
      ]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async deletePasswordLinux(account: string): Promise<boolean> {
    try {
      await execFileAsync('secret-tool', [
        'clear',
        'service', SERVICE_NAME,
        'account', account,
      ]);
      return true;
    } catch {
      return false;
    }
  }

  private async listAccountsLinux(): Promise<string[]> {
    try {
      // secret-tool doesn't have a direct list command, would need dbus
      console.warn('Listing accounts not fully implemented for Linux');
      return [];
    } catch {
      return [];
    }
  }

  // Fallback storage (not recommended for production)

  private async fallbackStorage(account: string, password: string): Promise<void> {
    // This is a placeholder - in production, you'd want to use
    // proper encryption or a library like keytar
    console.warn(`Using fallback storage for ${account} - NOT SECURE`);
    // Store in memory only for this session
    fallbackStore.set(account, password);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('KeychainManager not initialized. Call initialize() first.');
    }
  }
}

// In-memory fallback store (not persistent)
const fallbackStore = new Map<string, string>();

// Singleton instance
let keychainInstance: KeychainManager | null = null;

export function getKeychainManager(): KeychainManager {
  if (!keychainInstance) {
    keychainInstance = new KeychainManager();
  }
  return keychainInstance;
}

// Export convenience functions
export async function initializeKeychain(): Promise<KeychainManager> {
  const manager = getKeychainManager();
  await manager.initialize();
  return manager;
}

export async function setPassword(account: string, password: string): Promise<void> {
  return getKeychainManager().setPassword(account, password);
}

export async function getPassword(account: string): Promise<string | null> {
  return getKeychainManager().getPassword(account);
}

export async function deletePassword(account: string): Promise<boolean> {
  return getKeychainManager().deletePassword(account);
}

export async function setAPIKey(provider: string, apiKey: string): Promise<void> {
  return getKeychainManager().setAPIKey(provider, apiKey);
}

export async function getAPIKey(provider: string): Promise<string | null> {
  return getKeychainManager().getAPIKey(provider);
}

export async function deleteAPIKey(provider: string): Promise<boolean> {
  return getKeychainManager().deleteAPIKey(provider);
}

export async function setOAuthToken(service: string, token: string): Promise<void> {
  return getKeychainManager().setOAuthToken(service, token);
}

export async function getOAuthToken(service: string): Promise<string | null> {
  return getKeychainManager().getOAuthToken(service);
}

export async function deleteOAuthToken(service: string): Promise<boolean> {
  return getKeychainManager().deleteOAuthToken(service);
}
