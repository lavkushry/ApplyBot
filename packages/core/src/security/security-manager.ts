/**
 * Security Manager - OpenClaw-inspired Security Model
 *
 * Manages device pairing, token authentication, review gates, and exec approvals.
 */

import { EventEmitter } from 'events';
import type {
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

export interface SecurityManagerOptions {
  config?: Partial<SecurityConfig>;
}

export class SecurityManager extends EventEmitter {
  private config: SecurityConfig;
  private devices = new Map<string, Device>();
  private pairingRequests = new Map<string, PairingRequest>();
  private tokens = new Map<string, AuthToken>();
  private reviewGates = new Map<string, ReviewGate>();
  private execApprovals = new Map<string, ExecApproval>();
  private auditLogs: SecurityAuditLog[] = [];
  private failedLogins = new Map<string, number>();
  private lockedAccounts = new Set<string>();

  constructor(options: SecurityManagerOptions = {}) {
    super();

    this.config = {
      devicePairingEnabled: true,
      pairingExpiryMinutes: 10,
      tokenExpiryMinutes: 60,
      refreshTokenExpiryDays: 7,
      requireApprovalFor: ['file_write', 'email_send', 'config_change'],
      execApprovalRequired: true,
      maxFailedLogins: 5,
      lockoutDurationMinutes: 30,
      ...options.config,
    };

    // Start cleanup interval
    setInterval(() => this.cleanupExpired(), 60000);
  }

  // Device Pairing

  /**
   * Create a pairing request
   */
  createPairingRequest(
    deviceName: string,
    deviceType: DeviceType,
    publicKey: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): PairingRequest {
    if (!this.config.devicePairingEnabled) {
      throw new Error('Device pairing is disabled');
    }

    const request: PairingRequest = {
      id: this.generateId('pair'),
      deviceName,
      deviceType,
      publicKey,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.pairingExpiryMinutes * 60000),
      status: 'pending',
    };

    this.pairingRequests.set(request.id, request);

    this.logAudit('device_paired', {
      pairingRequestId: request.id,
      deviceName,
      deviceType,
      ipAddress: metadata?.ipAddress,
    });

    this.emit('pairing_requested', request);

    return request;
  }

  /**
   * Approve a pairing request
   */
  approvePairing(requestId: string, approvedBy: string): Device | null {
    const request = this.pairingRequests.get(requestId);
    if (!request || request.status !== 'pending') {
      return null;
    }

    if (new Date() > request.expiresAt) {
      request.status = 'expired';
      return null;
    }

    request.status = 'approved';

    const device: Device = {
      id: this.generateId('dev'),
      name: request.deviceName,
      type: request.deviceType,
      publicKey: request.publicKey,
      pairedAt: new Date(),
      lastUsedAt: new Date(),
      trusted: true,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    };

    this.devices.set(device.id, device);

    this.logAudit('device_paired', {
      deviceId: device.id,
      deviceName: device.name,
      approvedBy,
    });

    this.emit('device_paired', device);

    return device;
  }

  /**
   * Reject a pairing request
   */
  rejectPairing(requestId: string, rejectedBy: string): boolean {
    const request = this.pairingRequests.get(requestId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.status = 'rejected';

    this.logAudit('device_unpaired', {
      pairingRequestId: requestId,
      rejectedBy,
    });

    this.emit('pairing_rejected', request);

    return true;
  }

  /**
   * Get a device by ID
   */
  getDevice(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * List all paired devices
   */
  listDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  /**
   * Unpair a device
   */
  unpairDevice(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;

    this.devices.delete(deviceId);

    // Revoke all tokens for this device
    this.revokeDeviceTokens(deviceId);

    this.logAudit('device_unpaired', { deviceId, deviceName: device.name });

    this.emit('device_unpaired', device);

    return true;
  }

  // Token Management

  /**
   * Create an access token
   */
  createToken(
    deviceId: string,
    userId: string,
    type: TokenType = 'access',
    scopes: string[] = []
  ): AuthToken | null {
    const device = this.devices.get(deviceId);
    if (!device) return null;

    // Check if account is locked
    if (this.lockedAccounts.has(userId)) {
      return null;
    }

    const token: AuthToken = {
      token: this.generateToken(),
      deviceId,
      userId,
      type,
      createdAt: new Date(),
      expiresAt: this.calculateExpiry(type),
      lastUsedAt: new Date(),
      scopes,
    };

    this.tokens.set(token.token, token);

    // Update device last used
    device.lastUsedAt = new Date();

    this.logAudit('token_issued', {
      deviceId,
      userId,
      tokenType: type,
      scopes,
    });

    this.emit('token_issued', token);

    return token;
  }

  /**
   * Validate a token
   */
  validateToken(token: string): AuthToken | null {
    const authToken = this.tokens.get(token);
    if (!authToken) return null;

    if (new Date() > authToken.expiresAt) {
      this.tokens.delete(token);
      return null;
    }

    // Update last used
    authToken.lastUsedAt = new Date();

    return authToken;
  }

  /**
   * Revoke a token
   */
  revokeToken(token: string): boolean {
    const authToken = this.tokens.get(token);
    if (!authToken) return false;

    this.tokens.delete(token);

    this.logAudit('token_revoked', {
      deviceId: authToken.deviceId,
      userId: authToken.userId,
    });

    this.emit('token_revoked', authToken);

    return true;
  }

  /**
   * Revoke all tokens for a device
   */
  revokeDeviceTokens(deviceId: string): number {
    let count = 0;
    for (const [token, authToken] of this.tokens.entries()) {
      if (authToken.deviceId === deviceId) {
        this.tokens.delete(token);
        count++;
      }
    }
    return count;
  }

  // Review Gates

  /**
   * Create a review gate
   */
  createReviewGate(
    type: ReviewType,
    title: string,
    description: string,
    payload: unknown,
    requester: { deviceId: string; userId: string }
  ): ReviewGate | null {
    // Check if approval is required for this type
    if (!this.config.requireApprovalFor.includes(type)) {
      return null;
    }

    const gate: ReviewGate = {
      id: this.generateId('review'),
      type,
      title,
      description,
      payload,
      requester,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000), // 1 hour expiry
    };

    this.reviewGates.set(gate.id, gate);

    this.logAudit('review_requested', {
      reviewId: gate.id,
      type,
      title,
      requester: requester.deviceId,
    });

    this.emit('review_requested', gate);

    return gate;
  }

  /**
   * Approve a review gate
   */
  approveReview(reviewId: string, approvedBy: string): ReviewGate | null {
    const gate = this.reviewGates.get(reviewId);
    if (!gate || gate.status !== 'pending') {
      return null;
    }

    if (new Date() > gate.expiresAt) {
      gate.status = 'expired';
      return null;
    }

    gate.status = 'approved';
    gate.approvedBy = approvedBy;
    gate.approvedAt = new Date();

    this.logAudit('review_approved', {
      reviewId: gate.id,
      type: gate.type,
      approvedBy,
    });

    this.emit('review_approved', gate);

    return gate;
  }

  /**
   * Reject a review gate
   */
  rejectReview(
    reviewId: string,
    rejectedBy: string,
    reason?: string
  ): ReviewGate | null {
    const gate = this.reviewGates.get(reviewId);
    if (!gate || gate.status !== 'pending') {
      return null;
    }

    gate.status = 'rejected';
    gate.rejectedBy = rejectedBy;
    gate.rejectedAt = new Date();
    gate.rejectionReason = reason;

    this.logAudit('review_rejected', {
      reviewId: gate.id,
      type: gate.type,
      rejectedBy,
      reason,
    });

    this.emit('review_rejected', gate);

    return gate;
  }

  /**
   * Get pending reviews
   */
  getPendingReviews(): ReviewGate[] {
    return Array.from(this.reviewGates.values()).filter(
      (r) => r.status === 'pending' && new Date() < r.expiresAt
    );
  }

  // Exec Approvals

  /**
   * Request exec approval
   */
  requestExecApproval(
    command: string,
    args: string[],
    workingDirectory: string,
    environment: Record<string, string>,
    requester: { deviceId: string; userId: string }
  ): ExecApproval | null {
    if (!this.config.execApprovalRequired) {
      return null;
    }

    const riskAssessment = this.assessRisk(command, args);

    const approval: ExecApproval = {
      id: this.generateId('exec'),
      command,
      args,
      workingDirectory,
      environment,
      requester,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 300000), // 5 minute expiry
      riskLevel: riskAssessment.level,
      riskFactors: riskAssessment.factors,
    };

    this.execApprovals.set(approval.id, approval);

    this.logAudit('review_requested', {
      execId: approval.id,
      command,
      riskLevel: riskAssessment.level,
    });

    this.emit('exec_requested', approval);

    return approval;
  }

  /**
   * Approve exec
   */
  approveExec(execId: string, approvedBy: string): ExecApproval | null {
    const approval = this.execApprovals.get(execId);
    if (!approval || approval.status !== 'pending') {
      return null;
    }

    if (new Date() > approval.expiresAt) {
      approval.status = 'expired';
      return null;
    }

    approval.status = 'approved';

    this.logAudit('exec_approved', {
      execId: approval.id,
      command: approval.command,
      approvedBy,
    });

    this.emit('exec_approved', approval);

    return approval;
  }

  /**
   * Reject exec
   */
  rejectExec(
    execId: string,
    rejectedBy: string,
    reason?: string
  ): ExecApproval | null {
    const approval = this.execApprovals.get(execId);
    if (!approval || approval.status !== 'pending') {
      return null;
    }

    approval.status = 'rejected';

    this.logAudit('exec_rejected', {
      execId: approval.id,
      command: approval.command,
      rejectedBy,
      reason,
    });

    this.emit('exec_rejected', approval);

    return approval;
  }

  // Audit Logging

  /**
   * Get audit logs
   */
  getAuditLogs(options?: {
    event?: SecurityEvent;
    deviceId?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }): SecurityAuditLog[] {
    let logs = [...this.auditLogs];

    if (options?.event) {
      logs = logs.filter((l) => l.event === options.event);
    }
    if (options?.deviceId) {
      logs = logs.filter((l) => l.deviceId === options.deviceId);
    }
    if (options?.userId) {
      logs = logs.filter((l) => l.userId === options.userId);
    }
    if (options?.startDate) {
      logs = logs.filter((l) => l.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      logs = logs.filter((l) => l.timestamp <= options.endDate!);
    }

    return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get security stats
   */
  getStats(): SecurityStats {
    const now = new Date();
    const last24h = new Date(now.getTime() - 86400000);

    return {
      totalDevices: this.devices.size,
      activeTokens: Array.from(this.tokens.values()).filter(
        (t) => t.expiresAt > now
      ).length,
      pendingReviews: this.getPendingReviews().length,
      failedLoginsLast24h: Array.from(this.failedLogins.values()).reduce(
        (sum, count) => sum + count,
        0
      ),
      lockedAccounts: this.lockedAccounts.size,
    };
  }

  // Private methods

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateToken(): string {
    return `tok_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  private calculateExpiry(type: TokenType): Date {
    const now = new Date();
    switch (type) {
      case 'access':
        return new Date(now.getTime() + this.config.tokenExpiryMinutes * 60000);
      case 'refresh':
        return new Date(
          now.getTime() + this.config.refreshTokenExpiryDays * 86400000
        );
      case 'session':
        return new Date(now.getTime() + 86400000); // 24 hours
      default:
        return new Date(now.getTime() + 3600000); // 1 hour
    }
  }

  private assessRisk(
    command: string,
    args: string[]
  ): { level: RiskLevel; factors: string[] } {
    const factors: string[] = [];
    let level: RiskLevel = 'low';

    const dangerousCommands = ['rm', 'dd', 'mkfs', 'format', 'del', 'rd'];
    const systemCommands = ['sudo', 'su', 'powershell', 'cmd'];
    const networkCommands = ['curl', 'wget', 'nc', 'netcat'];

    const cmdLower = command.toLowerCase();
    const argsLower = args.join(' ').toLowerCase();

    if (dangerousCommands.some((c) => cmdLower.includes(c))) {
      factors.push('Potentially destructive command');
      level = 'critical';
    }

    if (systemCommands.some((c) => cmdLower.includes(c))) {
      factors.push('System-level command');
      level = level === 'low' ? 'high' : level;
    }

    if (networkCommands.some((c) => cmdLower.includes(c))) {
      factors.push('Network operation');
      if (level === 'low') level = 'medium';
    }

    if (argsLower.includes('>') || argsLower.includes('|')) {
      factors.push('Command chaining/redirection');
      if (level === 'low') level = 'medium';
    }

    if (factors.length === 0) {
      factors.push('Standard command');
    }

    return { level, factors };
  }

  private logAudit(
    event: SecurityEvent,
    details: Record<string, unknown>,
    success: boolean = true,
    errorMessage?: string
  ): void {
    const log: SecurityAuditLog = {
      id: this.generateId('audit'),
      timestamp: new Date(),
      event,
      details,
      success,
      errorMessage,
    };

    this.auditLogs.push(log);

    // Keep only last 10000 logs
    if (this.auditLogs.length > 10000) {
      this.auditLogs = this.auditLogs.slice(-10000);
    }
  }

  private cleanupExpired(): void {
    const now = new Date();

    // Clean up expired tokens
    for (const [token, authToken] of this.tokens.entries()) {
      if (authToken.expiresAt < now) {
        this.tokens.delete(token);
      }
    }

    // Clean up expired pairing requests
    for (const [id, request] of this.pairingRequests.entries()) {
      if (request.expiresAt < now && request.status === 'pending') {
        request.status = 'expired';
      }
    }

    // Clean up expired reviews
    for (const [id, review] of this.reviewGates.entries()) {
      if (review.expiresAt < now && review.status === 'pending') {
        review.status = 'expired';
      }
    }

    // Clean up expired exec approvals
    for (const [id, approval] of this.execApprovals.entries()) {
      if (approval.expiresAt < now && approval.status === 'pending') {
        approval.status = 'expired';
      }
    }
  }
}
