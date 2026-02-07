# ApplyPilot Bootstrap

## Welcome to ApplyPilot! 🚀

This is your first-run initialization guide. ApplyPilot will walk you through the setup process to get you started with your job search automation.

## What is ApplyPilot?

ApplyPilot is an AI-powered job application assistant that helps you:
- **Analyze job descriptions** to understand requirements and match scores
- **Tailor your resume** for specific positions using LaTeX
- **Track applications** through a visual pipeline
- **Generate cover letters** personalized for each role
- **Prepare for interviews** with AI-generated questions and feedback
- **Apply to portals** with guided autofill (LinkedIn, Greenhouse, Lever, etc.)

## Quick Start Checklist

### Step 1: Configure LLM Provider
ApplyPilot needs an AI model to function. Choose one:

**Option A: Ollama (Local, Free)**
```bash
# Install Ollama from https://ollama.com
ollama pull llama3.2
applypilot config set llm.provider ollama
applypilot config set llm.model llama3.2
```

**Option B: OpenAI (Cloud, API Key Required)**
```bash
applypilot config set llm.provider openai
applypilot config set llm.model gpt-4
applypilot config set llm.apiKey YOUR_API_KEY
```

**Option C: Anthropic Claude (Cloud, API Key Required)**
```bash
applypilot config set llm.provider anthropic
applypilot config set llm.model claude-3-sonnet
applypilot config set llm.apiKey YOUR_API_KEY
```

### Step 2: Set Up Your Profile
```bash
applypilot profile create
```

This will create your `USER.md` profile with:
- Personal information
- Target roles and preferences
- Skills and experience highlights
- Compensation expectations

### Step 3: Configure Resume
```bash
applypilot resume init
```

This creates:
- `resumes/base/resume.tex` - Your base LaTeX resume
- `resumes/achievements.yml` - Your achievement bank

### Step 4: Verify Setup
```bash
applypilot doctor
```

## Your First Job Analysis

Let's analyze a job description:

```bash
# Save a job description to a file, then:
applypilot analyze --file job_description.txt

# Or paste it directly:
applypilot analyze --interactive
```

## Your First Resume Tailoring

After analyzing a job:

```bash
applypilot tailor --job-id <job_id>
```

This will:
1. Match your profile against the job requirements
2. Suggest LaTeX patches to tailor your resume
3. Show you a diff of changes
4. Compile the tailored PDF

## Understanding the Review Gate

ApplyPilot has a **Review Gate** for sensitive operations:

- **Resume tailoring**: Always shows diff before applying
- **Portal autofill**: Stops before submitting forms
- **Email sending**: Requires approval before sending

You control the automation level:
```bash
# Conservative (always review)
applypilot config set automation.level conservative

# Balanced (review important actions)
applypilot config set automation.level balanced

# Aggressive (minimal reviews)
applypilot config set automation.level aggressive
```

## Key Concepts

### Sessions
ApplyPilot uses sessions to track job processing:
- `job:<id>:analyze` - Analyzing job description
- `job:<id>:tailoring` - Tailoring resume
- `job:<id>:applying` - Filling portal forms

View active sessions:
```bash
applypilot sessions list
```

### Memory
ApplyPilot learns from your interactions:
- Successful strategies are recorded in `MEMORY.md`
- Preferences are tracked across sessions
- Company-specific insights are accumulated

### Skills
ApplyPilot has built-in skills for job search tasks:
```bash
applypilot skills list
applypilot skills describe job.parse_description
```

## Next Steps

1. **Add your first job**:
   ```bash
   applypilot jobs add --company "TechCorp" --role "Senior Engineer"
   ```

2. **View your pipeline**:
   ```bash
   applypilot pipeline
   # Or open the web UI:
   applypilot web
   ```

3. **Set up browser automation** (optional):
   ```bash
   applypilot browser install
   ```

4. **Configure portal connectors** (optional):
   ```bash
   applypilot plugins install greenhouse-connector
   ```

## Getting Help

- **Documentation**: https://applypilot.dev/docs
- **CLI help**: `applypilot --help` or `applypilot <command> --help`
- **Community**: https://discord.gg/applypilot
- **Issues**: https://github.com/applypilot/applypilot/issues

## Bootstrap Complete! ✅

Once you've completed the steps above, mark this bootstrap as read:

```bash
applypilot bootstrap complete
```

This will create a `.bootstrap-read` marker file and skip this guide on future sessions.

---

**Welcome aboard! Let's land your dream job.** 🎯
