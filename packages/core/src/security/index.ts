/**
 * Security Module - OpenClaw-inspired Security Model
 *
 * Device pairing, token authentication, review gates, and exec approvals.
 */

export { SecurityManager } from './security-manager.js';

export type {
  Device,
  DeviceType,
  PairingRequest,
  PairingStatus,
  AuthToken,
  TokenType,
  ReviewGate,
  ReviewType,
  ReviewStatus,
  ExecApproval,
  RiskLevel,
  SecurityConfig,
  SecurityAuditLog,
  SecurityEvent,
  SecurityStats,
} from './types.js';

export type { SecurityManagerOptions } from './security-manager.js';

// Keychain exports
export {
  KeychainManager,
  getKeychainManager,
  initializeKeychain,
  setPassword,
  getPassword,
  deletePassword,
  setAPIKey,
  getAPIKey,
  deleteAPIKey,
  setOAuthToken,
  getOAuthToken,
  deleteOAuthToken,
  detectPlatform,
} from './keychain.js';
export type {
  KeychainCredentials,
  SecureNote,
  KeychainPlatform,
} from './keychain.js';
