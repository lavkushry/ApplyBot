# Model Licenses

ApplyPilot supports both **local** and **external** AI models.

## Local Models (Default, Recommended)

These models run on your machine - **no data leaves your computer**.

### Llama 3.1 (Meta)

- **License**: Llama 3.1 Community License Agreement
- **Commercial Use**: ✅ Allowed
- **Attribution**: Required
- **Size**: 8B, 70B, 405B parameters
- **Best For**: General purpose, good balance of quality and speed
- **Privacy**: ✅ 100% local

```bash
ollama pull llama3.1:8b
```

### Mistral (Mistral AI)

- **License**: Apache 2.0
- **Commercial Use**: ✅ Allowed
- **Attribution**: Not required but appreciated
- **Size**: 7B parameters
- **Best For**: Fast inference, permissive license
- **Privacy**: ✅ 100% local

```bash
ollama pull mistral:7b
```

### Gemma (Google)

- **License**: Gemma Terms of Use
- **Commercial Use**: ✅ Allowed
- **Attribution**: Required
- **Size**: 2B, 7B parameters
- **Best For**: Lightweight, efficient
- **Privacy**: ✅ 100% local

```bash
ollama pull gemma:7b
```

### Phi-3 (Microsoft)

- **License**: MIT
- **Commercial Use**: ✅ Allowed
- **Attribution**: Required
- **Size**: 3.8B parameters
- **Best For**: Small size, good performance
- **Privacy**: ✅ 100% local

```bash
ollama pull phi3:3.8b
```

---

## External API Models (Optional)

⚠️ **Warning**: Using these models sends your job descriptions and profile data to external servers.

### OpenAI

- **Models**: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- **Cost**: Pay per token
- **Privacy**: Data sent to OpenAI
- **Setup**: Set `OPENAI_API_KEY` environment variable

```bash
export OPENAI_API_KEY="your-key-here"
applypilot set-llm --provider openai --model gpt-4o
```

### Anthropic

- **Models**: Claude 3 Opus, Sonnet, Haiku
- **Cost**: Pay per token
- **Privacy**: Data sent to Anthropic
- **Setup**: Set `ANTHROPIC_API_KEY` environment variable

```bash
export ANTHROPIC_API_KEY="your-key-here"
applypilot set-llm --provider anthropic --model claude-3-sonnet-20240229
```

### Google (Coming Soon)

- **Models**: Gemini Pro
- **Cost**: Pay per token
- **Privacy**: Data sent to Google
- **Setup**: Set `GOOGLE_API_KEY` environment variable

---

## Model Selection Guide

| Model | Provider | Size | Speed | Quality | Privacy | Cost |
|-------|----------|------|-------|---------|---------|------|
| llama3.1:8b | Local | 8B | ⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Free | Free |
| mistral:7b | Local | 7B | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Free | Free |
| gemma:7b | Local | 7B | ⭐⭐⭐ | ⭐⭐⭐ | ✅ Free | Free |
| phi3:3.8b | Local | 3.8B | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ Free | Free |
| gpt-4o | OpenAI | Cloud | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⚠️ External | $$$ |
| claude-3-sonnet | Anthropic | Cloud | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⚠️ External | $$ |

---

## Default Configuration

ApplyPilot defaults to **local models** for maximum privacy:

```yaml
llm:
  provider: ollama
  model: llama3.1:8b
  baseUrl: http://localhost:11434
```

To switch to an external provider:

```bash
# Set API key (don't commit this!)
export OPENAI_API_KEY="sk-..."

# Configure ApplyPilot
applypilot set-llm --provider openai --model gpt-4o
```

---

## Cost Estimation

When using external APIs, ApplyPilot estimates costs:

| Provider | Input (per 1K tokens) | Output (per 1K tokens) |
|----------|----------------------|----------------------|
| OpenAI GPT-4o | $0.005 | $0.015 |
| OpenAI GPT-3.5 | $0.0005 | $0.0015 |
| Anthropic Claude 3 Sonnet | $0.003 | $0.015 |
| Anthropic Claude 3 Haiku | $0.00025 | $0.00125 |

**Typical resume tailoring**: ~$0.01-0.05 per job

---

## Privacy Considerations

### Local Models
- ✅ Job descriptions stay on your machine
- ✅ Profile data never leaves your computer
- ✅ No internet connection required
- ✅ No API costs

### External APIs
- ⚠️ Job descriptions sent to provider
- ⚠️ Profile data sent to provider
- ⚠️ Subject to provider's privacy policy
- ⚠️ API costs apply
- ✅ Higher quality responses
- ✅ Faster inference

Choose based on your privacy requirements and budget.