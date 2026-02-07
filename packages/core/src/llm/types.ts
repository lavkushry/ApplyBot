import type { LLMProvider } from '../config/index.js';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost?: number; // in USD
  model: string;
  provider: LLMProvider;
}

export interface LLMStreamChunk {
  content: string;
  done: boolean;
}

export interface LLMConfig {
  provider: LLMProvider;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  organization?: string;
}

export type StreamHandler = (chunk: LLMStreamChunk) => void;

export interface LLMHealthCheck {
  available: boolean;
  error?: string;
  latency?: number;
  model?: string;
}