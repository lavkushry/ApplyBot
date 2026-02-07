# Open Source Policy

ApplyPilot is committed to being 100% open-source. External API usage is **optional** and **disabled by default**.

## Dependency Allowlist

### Allowed Licenses

- MIT
- Apache-2.0
- BSD-2-Clause
- BSD-3-Clause
- ISC
- MPL-2.0

### Conditionally Allowed (with review)

- GPL-3.0 (copyleft considerations)
- AGPL-3.0 (copyleft considerations)

### Prohibited

- Proprietary/Commercial licenses
- SSPL (Server Side Public License)
- Any license requiring network disclosure

## LLM Provider Policy

### Default: Local-First (Recommended)

By default, ApplyPilot uses **only local LLMs**:

- ✅ Ollama (localhost) - **DEFAULT**
- ✅ llama.cpp (localhost)

### Optional: External APIs

Users **may opt-in** to use external APIs:

- ⚠️ OpenAI API (requires API key, data leaves machine)
- ⚠️ Anthropic API (requires API key, data leaves machine)
- ⚠️ Google Vertex AI (requires API key, data leaves machine)
- ⚠️ Azure OpenAI (requires API key, data leaves machine)

**Important:** When using external APIs:
- Job descriptions and profile data are sent to external servers
- API costs apply
- Privacy implications exist
- Must set API key via environment variables

### No Vendor Lock-in

ApplyPilot's adapter pattern ensures:
- Easy switching between providers
- No proprietary API dependencies in core code
- Local LLMs remain fully functional without external APIs

## Model Weights (Local)

Only models with acceptable open licenses are supported for local use:

- ✅ Llama 3 (Meta License)
- ✅ Mistral (Apache 2.0)
- ✅ Gemma (Gemma Terms of Use)
- ✅ Phi-3 (MIT)
- ❌ GPT-4 (proprietary - via API only)
- ❌ Claude (proprietary - via API only)

## Adding New Dependencies

When adding a new dependency:

1. Check license compatibility
2. Run `bun run licenses:scan`
3. Update `THIRD_PARTY_LICENSES.md`
4. Get approval for GPL/AGPL dependencies

## License Verification

```bash
# Scan all dependencies
bun run licenses:scan

# Check for violations
bun run licenses:check
```