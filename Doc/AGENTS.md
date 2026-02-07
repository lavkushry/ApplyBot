# ApplyPilot Agents

## Overview

ApplyPilot uses a multi-agent architecture where specialized agents collaborate to help you land your dream job. Each agent has a specific role and set of responsibilities.

## Core Agents

### 1. Job Analyzer Agent

**Role**: Analyzes job descriptions to extract key requirements and insights

**Responsibilities**:

- Parse job descriptions from various sources (LinkedIn, Indeed, company websites)
- Extract required skills, experience levels, and qualifications
- Identify "must-have" vs "nice-to-have" requirements
- Detect red flags and company culture indicators
- Assess compensation ranges and benefits

**Tools**:

- `parse_job_description`: Extract structured data from JD text
- `analyze_company`: Research company background and reputation
- `compare_requirements`: Match job requirements against your profile

**Output Format**:

```json
{
  "role": "Senior Software Engineer",
  "level": "Senior",
  "must_have": ["Python", "5+ years experience"],
  "nice_to_have": ["Kubernetes", "AWS"],
  "culture_indicators": ["Fast-paced", "Remote-friendly"],
  "compensation": { "min": 150000, "max": 200000, "currency": "USD"
```
 }
}
```

### 2. Resume Tailor Agent
**Role**: Customizes your resume for specific job applications

**Responsibilities**:
- Analyze your master resume against job requirements
- Highlight relevant experience and skills
- Suggest modifications to improve match score
- Ensure ATS (Applicant Tracking System) compatibility
- Maintain truthfulness - never fabricate experience

**Tools**:
- `analyze_resume_match`: Calculate match score between resume and JD
- `suggest_resume_changes`: Recommend specific modifications
- `generate_ats_version`: Create ATS-optimized resume format

**Guidelines**:
- Only use information from your actual experience
- Prioritize relevant achievements over chronology
- Use strong action verbs and quantifiable results
- Keep formatting clean and consistent

### 3. Cover Letter Agent
**Role**: Generates personalized cover letters

**Responsibilities**:
- Research company mission and values
- Connect your experience to company needs
- Write compelling narratives that showcase fit
- Maintain professional tone while showing personality
- Keep letters concise (300-400 words)

**Tools**:
- `research_company`: Gather company information
- `generate_cover_letter`: Create personalized letter
- `refine_tone`: Adjust writing style for company culture

### 4. Application Tracker Agent
**Role**: Manages your job application pipeline

**Responsibilities**:
- Track application status across all jobs
- Send follow-up reminders at appropriate intervals
- Log all interactions (emails, calls, interviews)
- Generate pipeline analytics and insights
- Suggest next actions for each application

**Tools**:
- `log_application`: Record new application
- `update_status`: Change application status
- `schedule_followup`: Set reminder for follow-up
- `generate_report`: Create pipeline analytics

### 5. Interview Prep Agent
**Role**: Prepares you for interviews

**Responsibilities**:
- Generate likely interview questions based on JD
- Research common questions for the company/role
- Provide STAR method frameworks for behavioral questions
- Conduct mock interviews
- Give feedback on your responses

**Tools**:
- `generate_questions`: Create interview question list
- `conduct_mock_interview`: Run practice interview
- `analyze_response`: Provide feedback on answers
- `research_interview_process`: Learn about company's interview style

## Agent Collaboration

Agents communicate through a shared memory system:

```
User Input → Gateway → Session Manager → Relevant Agents
                      ↓
              Shared Memory (Context)
                      ↓
              Streaming Response → User
```

## Configuration

Each agent can be configured via environment variables:

```bash
# Job Analyzer
ANALYZER_MODEL=gpt-4
ANALYZER_TEMPERATURE=0.3

# Resume Tailor
RESUME_MODEL=claude-3-opus
RESUME_TEMPERATURE=0.5

# Cover Letter
COVER_LETTER_MODEL=gpt-4
COVER_LETTER_TEMPERATURE=0.7
COVER_LETTER_MAX_TOKENS=800

# Application Tracker
TRACKER_AUTO_FOLLOWUP=true
TRACKER_FOLLOWUP_DAYS=7

# Interview Prep
INTERVIEW_MODEL=claude-3-sonnet
INTERVIEW_MOCK_ENABLED=true
```

## Custom Agents

You can create custom agents by extending the base agent class:

```typescript
import { AgentRuntime, ToolDefinition } from '@applypilot/core';

const customAgent = new AgentRuntime({
  llmAdapter: myAdapter,
  config: {
    systemPrompt: 'You are a specialized agent for...',
    maxIterations: 5,
  },
});

customAgent.registerTool({
  name: 'my_custom_tool',
  description: 'Does something useful',
  parameters: { ... },
  handler: async (args) => { ... },
});
```

## Agent Safety

All agents follow these safety principles:

1. **Truthfulness**: Never fabricate experience or qualifications
2. **Privacy**: Respect confidentiality of job search data
3. **Transparency**: Clearly indicate AI-generated content
4. **User Control**: Always get approval before taking actions
5. **Fairness**: Avoid bias in recommendations

## Troubleshooting

### Agent not responding
- Check LLM API key and rate limits
- Verify session is active: `applypilot sessions list`
- Review gateway logs: `applypilot logs --gateway`

### Poor quality outputs
- Adjust temperature settings (lower = more focused)
- Provide more context in your profile
- Use the feedback system to train agents

### Slow performance
- Enable caching: `APPLY_PILOT_CACHE_ENABLED=true`
- Use local models for faster inference
- Reduce max iterations for quicker responses
