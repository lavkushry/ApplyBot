# ApplyPilot Implementation Plan

## Phase 0: Foundation Setup (Days 1-3)

### Task 0.1: Project Structure & Tooling
- Initialize Bun workspace with packages structure from PRD
- Set up TypeScript configurations for each package
- Configure ESLint + Prettier for code quality
- Add git hooks for pre-commit checks
- Create initial README with setup instructions

### Task 0.2: SQLite Schema Implementation
- Create `db/schema.sql` with all 6 tables (jobs, resume_builds, applications, field_mappings, outcomes, profile)
- Implement database connection layer in `packages/tracker/`
- Add migration system for schema versioning
- Create basic CRUD operations for each table

### Task 0.3: Configuration System
- Design `config.yaml` schema for user profiles
- Implement configuration loader with validation
- Add environment variable support for sensitive data
- Create default configuration templates

---

## Phase 1: Core Pipeline (Days 4-10)

### Task 1.1: JD Ingestion Module (`packages/jd/`)
- Implement JD text parser
- Add file upload support (txt, pdf via pdf-parse)
- Create JD cleaning/normalization utilities
- Build JD validation (minimum length, encoding checks)

### Task 1.2: Resume Template System (`packages/resume/`)
- Implement marker-based patching (Strategy 1)
- Create LaTeX template validator
- Add base template with markers (SUMMARY, SKILLS, EXPERIENCE_BULLETS, PROJECTS)
- Build template renderer

### Task 1.3: PDF Compilation Pipeline (`packages/pdf/`)
- Implement LaTeX compiler wrapper (latexmk/pdflatex)
- Add compilation error parser with actionable hints
- Create PDF validation (page count, file size)
- Build compile log storage system

### Task 1.4: CLI Interface (Primary Interface for M1)
- Create command structure: `applypilot init`, `applypilot analyze`, `applypilot tailor`, `applypilot track`
- Implement interactive prompts for user input
- Add progress indicators for long operations
- Create output formatting (tables, colors)

---

## Phase 2: Local AI Integration (Days 11-20)

### Task 2.1: LLM Adapter (`packages/core/llm/`)
- Implement Ollama client with streaming support
- Add llama.cpp compatibility layer
- Create prompt templates for each operation (JD analysis, resume tailoring, cover letter)
- Add LLM response validation and retry logic

### Task 2.2: JD Analysis Tool (`analyze_jd`)
- Build prompt for extracting: role title, seniority, must-have skills, nice-to-haves, keywords, red flags
- Implement structured output parsing (JSON)
- Add fit score calculation algorithm
- Create gap analysis between JD and user profile

### Task 2.3: Resume Tailoring Engine
- Implement achievement bank loader (YAML/JSON)
- Build achievement selection algorithm based on JD requirements
- Create LaTeX patcher with change tracking
- Add "keyword budget" enforcement (prevent stuffing)
- Generate `changes.json` with rationale

### Task 2.4: Answers Pack Generator (`generate_answers_pack`)
- Build cover letter generator (short + long variants)
- Create screening question answer suggestions
- Generate recruiter message drafts
- Output structured JSON for form filling

---

## Phase 3: Application Tracking (Days 21-25)

### Task 3.1: Tracker CLI Commands
- `applypilot track add` - Add new job application
- `applypilot track list` - List all applications with filters
- `applypilot track update` - Update application status
- `applypilot track stats` - Show application statistics

### Task 3.2: Resume Versioning
- Implement resume build linking to job applications
- Add SHA256 hashing for PDF integrity
- Create build history viewer
- Implement rollback to previous versions

### Task 3.3: Outcome Tracking & Learning Loop
- Add outcome tagging (interview/rejected/no_reply/offer)
- Create feedback capture system
- Implement basic analytics (response rates by tailoring strategy)
- Design learning signal storage for future improvements

---

## Phase 4: Portal Connectors (Days 26-40)

### Task 4.1: Playwright Setup
- Add Playwright dependency
- Create browser automation base class
- Implement session management
- Add anti-detection measures (human-like delays, user-agent)

### Task 4.2: Greenhouse Connector (Priority 1)
- Build URL parser for Greenhouse job postings
- Implement field detection (name, email, resume upload, etc.)
- Create field mapping system
- Add resume upload automation
- Implement "stop before submit" behavior

### Task 4.3: Lever Connector (Priority 2)
- Similar implementation to Greenhouse
- Handle Lever-specific form structures
- Add cover letter upload support

### Task 4.4: Workday Connector (Priority 3)
- Handle Workday's complex multi-page forms
- Implement session persistence
- Add field mapping templates for common Workday instances

### Task 4.5: LinkedIn/Indeed/Naukri (Assist Mode Only)
- Implement "copy panel" generation for manual entry
- Create browser bookmarklet for quick field extraction
- Add answer pack display UI

---

## Phase 5: Polish & Documentation (Days 41-45)

### Task 5.1: Testing Suite
- Unit tests for core utilities
- Integration tests for full pipeline
- Mock LLM responses for deterministic testing
- Add test coverage reporting

### Task 5.2: Documentation
- Complete API documentation for tool contracts
- Create user guide with examples
- Add troubleshooting guide
- Write contribution guidelines

### Task 5.3: License Compliance
- Generate `THIRD_PARTY_LICENSES.md`
- Create `OSS_POLICY.md`
- Add `MODEL_LICENSES.md`
- Implement license scanner script

### Task 5.4: Installation & Distribution
- Create install script for Windows
- Add Docker support (optional)
- Build release automation
- Create sample data for testing

---

## Key Decisions Needed

1. **CLI vs Web UI Priority**: Recommend CLI for M0-M2, Web UI for M3+
2. **LaTeX Distribution**: Recommend checking for existing installation + providing setup guide
3. **Default LLM**: Recommend `llama3.1:8b` or `mistral:7b` for balance of quality/speed
4. **Browser Extension**: Defer to M3, use Playwright for M2

## Deliverables by Phase

| Phase | Deliverable |
|-------|-------------|
| 0 | Working Bun workspace, SQLite schema, config system |
| 1 | CLI interface, JD ingestion, PDF compilation |
| 2 | Local AI integration, resume tailoring, answers pack |
| 3 | Application tracking, versioning, outcomes |
| 4 | Greenhouse + Lever connectors, Assist Mode for others |
| 5 | Tests, documentation, license compliance |

## Total Timeline: 45 Days

Would you like me to proceed with any specific phase, or would you like to adjust priorities?