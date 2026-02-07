# ApplyPilot

An open-source, AI-powered Job Application Agent with support for both **local** and **external** LLMs.

## Features

- **Multiple LLM Providers**: Ollama (local), OpenAI, Anthropic, Google Gemini, Azure OpenAI
- **Resume Tailoring**: AI-powered resume customization based on job descriptions
- **Cover Letter Generation**: Short and long versions for different use cases
- **Answers Pack**: Pre-generated responses to screening questions
- **PDF Compilation**: LaTeX to PDF with error handling
- **Portal Autofill**: Automated form filling for Greenhouse, Lever, and Workday
- **Cost Tracking**: Track API usage and costs across all providers
- **Application Tracking**: SQLite-based tracking of all applications
- **Privacy First**: Local LLMs by default, external APIs optional

## Quick Start

### Prerequisites

1. **Node.js** (>= 18.0.0) or **Bun** (>= 1.0.0)
2. **LaTeX Distribution**:
   - Windows: [MiKTeX](https://miktex.org/download)
   - macOS: `brew install --cask mactex`
   - Linux: `sudo apt-get install texlive-full`
3. **Ollama** (for local AI) - [Download](https://ollama.ai/download)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/applypilot.git
cd applypilot

# Install dependencies
npm install
# or
bun install

# Initialize ApplyPilot
npx applypilot init
# or
bun run cli init
```

### Configuration

1. Copy example files:
```bash
cp data/profile.example.json data/profile.json
cp data/achievements.example.yaml data/achievements.yaml
cp resumes/base/resume.example.tex resumes/base/resume.tex
```

2. Edit `data/profile.json` with your information
3. Edit `data/achievements.yaml` with your achievements
4. Customize `resumes/base/resume.tex` with your LaTeX template

### Usage

```bash
# Check system setup
applypilot doctor

# Analyze a job description
applypilot analyze --file ./job.pdf --llm --save

# Tailor resume for a job
applypilot tailor --job <job-id>

# Track applications
applypilot track list
applypilot track stats

# Check costs
applypilot cost summary
applypilot cost budget --budget 50
```

## LLM Providers

### Local LLMs (Default, Free, Private)

```bash
# Using Ollama (default)
ollama pull llama3.1:8b
applypilot set-llm --provider ollama --model llama3.1:8b
```

**Benefits:**
- ✅ 100% private - data never leaves your machine
- ✅ No API costs
- ✅ Works offline
- ✅ No rate limits

### External APIs (Optional)

```bash
# OpenAI
export OPENAI_API_KEY="sk-..."
applypilot set-llm --provider openai --model gpt-4o

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
applypilot set-llm --provider anthropic --model claude-3-sonnet-20240229

# Google Gemini
export GOOGLE_API_KEY="..."
applypilot set-llm --provider google --model gemini-1.5-flash

# Azure OpenAI
export AZURE_OPENAI_API_KEY="..."
applypilot set-llm --provider azure-openai --model your-deployment-name
```

**Note:** When using external APIs, your job descriptions and profile data are sent to external servers.

## Cost Tracking

ApplyPilot automatically tracks all API usage:

```bash
# View cost summary
applypilot cost summary --days 30

# View recent usage
applypilot cost recent --limit 20

# Check budget status
applypilot cost budget --budget 50
```

### Pricing Reference

| Provider | Model | Input/1K | Output/1K |
|----------|-------|----------|-----------|
| Ollama | llama3.1:8b | Free | Free |
| OpenAI | GPT-4o | $0.005 | $0.015 |
| OpenAI | GPT-3.5 | $0.0005 | $0.0015 |
| Anthropic | Claude 3 Sonnet | $0.003 | $0.015 |
| Google | Gemini 1.5 Flash | $0.00035 | $0.00105 |

Typical resume tailoring costs $0.01-0.05 per job.

## Portal Autofill

ApplyPilot can automatically fill job application forms on supported portals:

### Supported Portals

- **Greenhouse** (greenhouse.io)
- **Lever** (lever.co)
- **Workday** (workday.com, myworkdayjobs.com)

### Usage

```bash
# Preview what would be filled
applypilot portal preview --url "https://boards.greenhouse.io/..."

# Autofill in assist mode (opens browser for review)
applypilot portal fill --url "https://boards.greenhouse.io/..." --job <job-id> --mode assist

# Autofill in headless mode
applypilot portal fill --url "https://boards.greenhouse.io/..." --job <job-id> --mode autofill
```

### Safety Features

- **Assist Mode**: Opens browser for manual review before submission
- **Stop Before Submit**: Never auto-submits applications
- **Field Mapping Review**: Shows what data will be entered
- **Screenshot Capture**: Saves screenshot for verification

## Complete Workflow Example

```bash
# 1. Initialize
applypilot init

# 2. Configure LLM (optional - defaults to local)
applypilot set-llm --provider openai --model gpt-4o

# 3. Check setup
applypilot doctor

# 4. Add a job
applypilot analyze --file ./job.pdf --llm --save
# Output: Job ID: job_abc123

# 5. Tailor everything (resume, cover letter, answers)
applypilot tailor --job job_abc123 --output ./resumes/builds

# Output:
# - Resume: ./resumes/builds/job_abc123_2024-01-15.tex
# - Cover Letter: ./resumes/builds/job_abc123_2024-01-15_cover_letter.txt
# - Answers: ./resumes/builds/job_abc123_2024-01-15_answers.json
# - Total Cost: $0.0234

# 6. Autofill portal application (optional)
applypilot portal fill --url "https://boards.greenhouse.io/..." --job job_abc123 --mode assist

# 7. Track application
applypilot track update --job job_abc123 --status submitted

# 8. Check costs
applypilot cost summary
```

## Project Structure

```
applypilot/
├── apps/
│   └── cli/              # CLI interface
├── packages/
│   ├── core/             # Core types, config, LLM adapters
│   │   ├── llm/          # LLM adapters (Ollama, OpenAI, Anthropic, Google, Azure)
│   │   └── config/       # Configuration management
│   ├── jd/               # Job description parsing & analysis
│   ├── resume/           # Resume tailoring, cover letters, answers
│   ├── pdf/              # PDF compilation
│   ├── portals/          # Job portal connectors
│   │   ├── greenhouse.ts
│   │   ├── lever.ts
│   │   ├── workday.ts
│   │   └── autofill-engine.ts
│   └── tracker/          # SQLite database & tracking
├── data/
│   ├── profile.json      # Your profile (create from example)
│   ├── achievements.yaml # Achievement bank (create from example)
│   └── usage.sqlite      # Cost tracking database (auto-created)
├── resumes/
│   ├── base/
│   │   └── resume.tex    # Base LaTeX template
│   └── builds/           # Generated resumes
└── db/
    └── schema.sql        # Database schema
```

## CLI Commands

### Core Commands

| Command | Description |
|---------|-------------|
| `applypilot init` | Initialize configuration and database |
| `applypilot doctor` | Check system setup and dependencies |
| `applypilot config` | Show current configuration |

### LLM Commands

| Command | Description |
|---------|-------------|
| `applypilot set-llm` | Configure LLM provider |
| `applypilot set-llm --provider <name>` | Set specific provider |

### Analysis Commands

| Command | Description |
|---------|-------------|
| `applypilot analyze --text "..."` | Analyze JD from text |
| `applypilot analyze --file <path>` | Analyze JD from file |
| `applypilot analyze --llm` | Use LLM for analysis |
| `applypilot analyze --save` | Save to database |

### Tailoring Commands

| Command | Description |
|---------|-------------|
| `applypilot tailor --job <id>` | Tailor resume for job |
| `applypilot tailor --output <dir>` | Set output directory |
| `applypilot tailor --no-cover-letter` | Skip cover letter |
| `applypilot tailor --no-answers` | Skip answers pack |

### Portal Commands

| Command | Description |
|---------|-------------|
| `applypilot portal preview --url <url>` | Preview autofill plan |
| `applypilot portal fill --url <url>` | Execute autofill |
| `applypilot portal fill --mode assist` | Assist mode (with browser) |
| `applypilot portal fill --mode autofill` | Headless mode |

### Tracking Commands

| Command | Description |
|---------|-------------|
| `applypilot track list` | List all applications |
| `applypilot track list --status <status>` | Filter by status |
| `applypilot track stats` | Show statistics |
| `applypilot track add --title "..." --company "..."` | Add job manually |

### Cost Commands

| Command | Description |
|---------|-------------|
| `applypilot cost summary` | Show cost summary |
| `applypilot cost summary --days 30` | Last 30 days |
| `applypilot cost recent` | Show recent usage |
| `applypilot cost budget --budget 50` | Check budget |

## Configuration

Configuration is stored in `config.yaml`:

```yaml
version: '1.0.0'

latex:
  engine: pdflatex
  maxRuns: 3
  timeout: 60000

llm:
  provider: ollama
  model: llama3.1:8b
  baseUrl: http://localhost:11434
  temperature: 0.3
  maxTokens: 4096
  rateLimit:
    enabled: true
    maxRequestsPerMinute: 60
  costTracking:
    enabled: true

paths:
  dataDir: ./data
  resumesDir: ./resumes
  buildsDir: ./resumes/builds
  dbPath: ./data/tracker.sqlite

tailoring:
  maxSkills: 15
  maxBulletPoints: 6
  enforceTruthfulness: true
  generateCoverLetter: true

portals:
  defaultMode: assist
  stopBeforeSubmit: true
  humanLikeDelays: true
```

## Privacy & Security

### Local-First Approach

By default, ApplyPilot uses **local LLMs only**:
- Your job descriptions stay on your machine
- Your profile data never leaves your computer
- No internet connection required
- No API costs

### External API Usage

When you opt-in to external APIs:
- ⚠️ Job descriptions are sent to the provider
- ⚠️ Profile data is sent to the provider
- ⚠️ Subject to provider's privacy policy
- ⚠️ API costs apply
- ✅ Higher quality responses
- ✅ Faster inference

### API Key Security

- API keys are stored in **environment variables**, not in config files
- Never commit API keys to version control
- Use `.env` files (not committed) for local development

## Troubleshooting

### LaTeX Not Found

```bash
# Windows: Install MiKTeX from https://miktex.org/download
# macOS: brew install --cask mactex
# Linux: sudo apt-get install texlive-full
```

### Ollama Connection Failed

```bash
# Start Ollama server
ollama serve

# Pull a model
ollama pull llama3.1:8b
```

### API Key Not Found

```bash
# Set environment variable
export OPENAI_API_KEY="sk-..."

# Or on Windows
set OPENAI_API_KEY=sk-...
```

### Portal Autofill Not Working

- Check if the portal is supported (Greenhouse, Lever, Workday)
- Try assist mode to see what's happening: `--mode assist`
- Portal may have changed their form structure
- Update ApplyPilot to the latest version

## Development

```bash
# Run in development mode
npm run dev

# Build all packages
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - See [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with [Bun](https://bun.sh) and [TypeScript](https://typescriptlang.org)
- Local AI powered by [Ollama](https://ollama.ai)
- PDF generation via LaTeX
- Browser automation via [Playwright](https://playwright.dev)