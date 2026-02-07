/**
 * Security Types - OpenClaw-inspired Security Model
 *
 * Device pairing, token authentication, review gates, and exec approvals.
 */

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  publicKey: string;
  pairedAt: Date;
  lastUsedAt: Date;
  trusted: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export type DeviceType = 'cli' | 'web' | 'mobile' | 'api';

export interface PairingRequest {
  id: string;
  deviceName: string;
  deviceType: DeviceType;
  publicKey: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  expiresAt: Date;
  status: PairingStatus;
}

export type PairingStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface AuthToken {
  token: string;
  deviceId: string;
  userId: string;
  type: TokenType;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
  scopes: string[];
}

export type TokenType = 'access' | 'refresh' | 'session';

export interface ReviewGate {
  id: string;
  type: ReviewType;
  title: string;
  description: string;
  requester: {
    deviceId: string;
    userId: string;
  };
  payload: unknown;
  status: ReviewStatus;
  createdAt: Date;
  expiresAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
}

export type ReviewType = 'tool_execution' | 'file_write' | 'email_send' | 'api_call' | 'config_change';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ExecApproval {
  id: string;
  command: string;
  args: string[];
  workingDirectory: string;
  environment: Record<string, string>;
  requester: {
    deviceId: string;
    userId: string;
  };
  status: ReviewStatus;
  createdAt: Date;
  expiresAt: Date;
  riskLevel: RiskLevel;
  riskFactors: string[];
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityConfig {
  devicePairingEnabled: boolean;
  pairingExpiryMinutes: number;
  tokenExpiryMinutes: number;
  refreshTokenExpiryDays: number;
  requireApprovalFor: ReviewType[];
  execApprovalRequired: boolean;
  maxFailedLogins: number;
  lockoutDurationMinutes: number;
  allowedIPs?: string[];
}

export interface SecurityAuditLog {
  id: string;
  timestamp: Date;
  event: SecurityEvent;
  deviceId?: string;
  userId?: string;
  ipAddress?: string;
  details: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
}

export type SecurityEvent =
  | 'device_paired'
  | 'device_unpaired'
  | 'login_success'
  | 'login_failure'
  | 'token_issued'
  | 'token_revoked'
  | 'review_requested'
  | 'review_approved'
  | 'review_rejected'
  | 'exec_approved'
  | 'exec_rejected'
  | 'config_changed'
  | 'suspicious_activity';

export interface SecurityStats {
  totalDevices: number;
  activeTokens: number;
  pendingReviews: number;
  failedLoginsLast24h: number;
  lockedAccounts: number;
}
