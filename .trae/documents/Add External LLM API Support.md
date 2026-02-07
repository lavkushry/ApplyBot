# Add External LLM API Support

## Overview
Add support for external LLM APIs (OpenAI, Anthropic, etc.) as an optional feature while maintaining local LLMs as the default.

## Changes Required

### 1. Update Configuration System
- Add external API providers to LLM config schema
- Add API key management (secure storage)
- Add provider selection logic

### 2. Create LLM Adapter Pattern
- Create base LLM adapter interface
- Implement Ollama adapter (existing)
- Implement OpenAI adapter
- Implement Anthropic adapter
- Add provider factory

### 3. Update Core Types
- Add external provider types
- Add API configuration types
- Add rate limiting configuration

### 4. Update CLI
- Add `applypilot config set-llm` command
- Add API key configuration commands
- Update doctor command to check API connectivity

### 5. Security Considerations
- Store API keys in OS keychain (not plaintext)
- Add warning when using external APIs
- Add cost estimation/tracking
- Keep local as default

### 6. Documentation Updates
- Update OSS_POLICY.md to clarify external APIs are optional
- Add API setup instructions
- Add privacy/cost warnings

## Supported External Providers
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Google (Gemini)
- Azure OpenAI

## Default Behavior
- Local LLM (Ollama) remains default
- External APIs require explicit opt-in
- Clear warnings about data leaving local machine

Ready to proceed?