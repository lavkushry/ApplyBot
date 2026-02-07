/**
 * Structured Logging Module
 *
 * Implements PRD Section 15.1 - Structured Logging.
 * JSONL formatted logs with PII redaction and contextual information.
 */

import { EventEmitter } from 'events';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { redactSensitiveInfo } from '../config/secrets-manager.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  component: string;
  message: string;
  sessionId?: string;
  jobId?: string;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  console: boolean;
  file: boolean;
  filePath: string;
  redactionEnabled: boolean;
  colorize: boolean;
  maxFileSize: number; // bytes
  maxFiles: number;
}

export interface LogContext {
  component: string;
  sessionId?: string;
  jobId?: string;
}

/**
 * Structured Logger implementation following PRD 15.1
 */
export class StructuredLogger extends EventEmitter {
  private static instance: StructuredLogger;
  private config: LoggerConfig;
  private context: LogContext;
  private currentFileSize: number = 0;

  private constructor(config?: Partial<LoggerConfig>, context?: Partial<LogContext>) {
    super();

    this.config = {
      level: 'info',
      console: true,
      file: true,
      filePath: join(homedir(), '.applypilot', 'logs', 'applypilot.log'),
      redactionEnabled: true,
      colorize: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      ...config,
    };

    this.context = {
      component: 'app',
      ...context,
    };

    this.ensureDirectory();
    this.initializeFileSize();
  }

  static getInstance(
    config?: Partial<LoggerConfig>,
    context?: Partial<LogContext>
  ): StructuredLogger {
    if (!StructuredLogger.instance) {
      StructuredLogger.instance = new StructuredLogger(config, context);
    }
    return StructuredLogger.instance;
  }

  static resetInstance(): void {
    StructuredLogger.instance = undefined as unknown as StructuredLogger;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Partial<LogContext>): StructuredLogger {
    const childLogger = new StructuredLogger(this.config, { ...this.context, ...context });
    return childLogger;
  }

  /**
   * Ensure log directory exists
   */
  private ensureDirectory(): void {
    const dir = join(homedir(), '.applypilot', 'logs');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Initialize current file size
   */
  private initializeFileSize(): void {
    if (existsSync(this.config.filePath)) {
      const stats = require('fs').statSync(this.config.filePath);
      this.currentFileSize = stats.size;
    }
  }

  /**
   * Check if log level is enabled
   */
  private isLevelEnabled(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];
    return levels.indexOf(level) >= levels.indexOf(this.config.level);
  }

  /**
   * Log a message
   */
  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.isLevelEnabled(level)) return;

    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      component: this.context.component,
      message: this.config.redactionEnabled ? redactSensitiveInfo(message) : message,
      sessionId: this.context.sessionId,
      jobId: this.context.jobId,
    };

    if (metadata) {
      entry.metadata = this.config.redactionEnabled ? this.redactMetadata(metadata) : metadata;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: this.config.redactionEnabled ? redactSensitiveInfo(error.message) : error.message,
        stack: error.stack,
      };
    }

    // Output to console
    if (this.config.console) {
      this.outputToConsole(entry);
    }

    // Output to file
    if (this.config.file) {
      this.outputToFile(entry);
    }

    this.emit('log', entry);
  }

  /**
   * Redact sensitive information in metadata
   */
  private redactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        redacted[key] = redactSensitiveInfo(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m', // Green
      warn: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
      fatal: '\x1b[35m', // Magenta
    };

    const reset = '\x1b[0m';
    const color = this.config.colorize ? colors[entry.level] : '';

    const context = [entry.component, entry.sessionId, entry.jobId].filter(Boolean).join(' | ');

    const output = `${color}[${entry.timestamp}] [${entry.level.toUpperCase()}] [${context}]${reset} ${entry.message}`;

    if (entry.level === 'error' || entry.level === 'fatal') {
      console.error(output);
      if (entry.error?.stack) {
        console.error(entry.error.stack);
      }
    } else if (entry.level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  /**
   * Output log entry to file in JSONL format
   */
  private outputToFile(entry: LogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    const lineSize = Buffer.byteLength(line, 'utf8');

    // Check if we need to rotate
    if (this.currentFileSize + lineSize > this.config.maxFileSize) {
      this.rotateFile();
    }

    try {
      appendFileSync(this.config.filePath, line);
      this.currentFileSize += lineSize;
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Rotate log file
   */
  private rotateFile(): void {
    const basePath = this.config.filePath;
    const ext = '.log';
    const baseName = basePath.replace(ext, '');

    // Rename existing files
    for (let i = this.config.maxFiles - 1; i > 0; i--) {
      const oldPath = i === 1 ? basePath : `${baseName}.${i - 1}${ext}`;
      const newPath = `${baseName}.${i}${ext}`;

      if (existsSync(oldPath)) {
        try {
          const content = require('fs').readFileSync(oldPath);
          writeFileSync(newPath, content);
        } catch (error) {
          // Ignore errors during rotation
        }
      }
    }

    // Reset current file
    this.currentFileSize = 0;
    writeFileSync(basePath, '');
  }

  /**
   * Debug level log
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  /**
   * Info level log
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  /**
   * Warn level log
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  /**
   * Error level log
   */
  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.log('error', message, metadata, error);
  }

  /**
   * Fatal level log
   */
  fatal(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.log('fatal', message, metadata, error);
  }

  /**
   * Update log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Get log file path
   */
  getLogPath(): string {
    return this.config.filePath;
  }
}

/**
 * Convenience function to get logger instance
 */
export function getLogger(
  config?: Partial<LoggerConfig>,
  context?: Partial<LogContext>
): StructuredLogger {
  return StructuredLogger.getInstance(config, context);
}

/**
 * Create a child logger with component context
 */
export function createLogger(
  component: string,
  sessionId?: string,
  jobId?: string
): StructuredLogger {
  return getLogger().child({ component, sessionId, jobId });
}

// Export default logger instance
export const logger = getLogger();
