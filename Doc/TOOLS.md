# ApplyPilot Tools Reference

## Overview

ApplyPilot provides a comprehensive set of tools that agents use to help with your job search. This document describes all available tools, their parameters, and usage examples.

## Tool Categories

### 1. Job Analysis Tools

#### `parse_job_description`
Extracts structured data from job description text.

**Parameters**:
```json
{
  "job_description": "string (required) - Full job description text",
  "source": "string (optional) - Where the JD came from (linkedin, indeed, etc.)"
}
```

**Returns**:
```json
{
  "role": "string",
  "company": "string",
  "level": "string",
  "location": "string",
  "salary_range": {"min": number, "max": number, "currency": "string"},
  "must_have_skills": ["string"],
  "nice_to_have_skills": ["string"],
  "responsibilities": ["string"],
  "requirements": ["string"],
  "benefits": ["string"],
  "application_url": "string",
  "deadline": "string (ISO date)"
}
```

**Example**:
```typescript
const result = await agent.executeTool('parse_job_description', {
  job_description: "We are seeking a Senior Software Engineer...",
  source: "linkedin"
});
```

#### `analyze_company`
Researches company background, culture, and reputation.

**Parameters**:
```json
{
  "company_name": "string (required)",
  "include_reviews": "boolean (default: true)",
  "include_financials": "boolean (default: false)"
}
```

**Returns**:
```json
{
  "name": "string",
  "industry": "string",
  "size": "string",
  "founded": "number",
  "headquarters": "string",
  "culture_score": "number (0-10)",
  "work_life_balance": "number (0-10)",
  "career_growth": "number (0-10)",
  "reviews_summary": "string",
  "recent_news": ["string"]
}
```

#### `compare_requirements`
Matches job requirements against your profile.

**Parameters**:
```json
{
  "job_requirements": ["string"],
  "user_skills": ["string"],
  "user_experience": "string"
}
```

**Returns**:
```json
{
  "match_score": "number (0-100)",
  "matching_skills": ["string"],
  "missing_skills": ["string"],
  "skill_gaps": ["string"],
  "recommendations": ["string"]
}
```

### 2. Resume Tools

#### `analyze_resume_match`
Calculates match score between resume and job description.

**Parameters**:
```json
{
  "resume_text": "string (required)",
  "job_description": "string (required)",
  "detailed_analysis": "boolean (default: true)"
}
```

**Returns**:
```json
{
  "overall_score": "number (0-100)",
  "keyword_match": "number (0-100)",
  "experience_match": "number (0-100)",
  "skills_match": "number (0-100)",
  "missing_keywords": ["string"],
  "suggestions": ["string"]
}
```

#### `suggest_resume_changes`
Recommends specific modifications to improve match.

**Parameters**:
```json
{
  "current_resume": "string (required)",
  "job_description": "string (required)",
  "max_suggestions": "number (default: 10)"
}
```

**Returns**:
```json
{
  "suggestions": [
    {
      "section": "string",
      "current_text": "string",
      "suggested_text": "string",
      "reason": "string",
      "priority": "high|medium|low"
    }
  ]
}
```

#### `generate_ats_version`
Creates ATS-optimized resume format.

**Parameters**:
```json
{
  "resume_data": "object (required) - Structured resume data",
  "target_company": "string (optional)"
}
```

**Returns**:
```json
{
  "ats_formatted_text": "string",
  "formatting_notes": ["string"],
  "keywords_included": ["string"]
}
```

### 3. Cover Letter Tools

#### `research_company`
Gathers company information for personalization.

**Parameters**:
```json
{
  "company_name": "string (required)",
  "include_mission": "boolean (default: true)",
  "include_recent_news": "boolean (default: true)"
}
```

**Returns**:
```json
{
  "mission": "string",
  "values": ["string"],
  "recent_news": ["string"],
  "culture_keywords": ["string"],
  "talking_points": ["string"]
}
```

#### `generate_cover_letter`
Creates personalized cover letter.

**Parameters**:
```json
{
  "job_description": "string (required)",
  "resume_highlights": ["string"],
  "company_research": "object",
  "tone": "professional|enthusiastic|formal (default: professional)",
  "max_length": "number (default: 400)"
}
```

**Returns**:
```json
{
  "cover_letter": "string",
  "word_count": "number",
  "key_points_covered": ["string"],
  "suggestions": ["string"]
}
```

### 4. Application Tracking Tools

#### `log_application`
Records a new job application.

**Parameters**:
```json
{
  "job_title": "string (required)",
  "company": "string (required)",
  "application_date": "string (ISO date, default: today)",
  "application_method": "string (email, website, referral, etc.)",
  "job_url": "string",
  "contact_person": "string",
  "notes": "string"
}
```

**Returns**:
```json
{
  "application_id": "string",
  "status": "string",
  "next_steps": ["string"],
  "follow_up_date": "string (ISO date)"
}
```

#### `update_status`
Changes application status.

**Parameters**:
```json
{
  "application_id": "string (required)",
  "new_status": "string (applied|phone_screen|interview|offer|rejected|withdrawn)",
  "notes": "string (optional)"
}
```

**Returns**:
```json
{
  "success": true,
  "previous_status": "string",
  "updated_at": "string (ISO date)"
}
```

#### `schedule_followup`
Sets reminder for follow-up.

**Parameters**:
```json
{
  "application_id": "string (required)",
  "follow_up_date": "string (ISO date, required)",
  "method": "email|phone|linkedin (default: email)"
}
```

**Returns**:
```json
{
  "reminder_id": "string",
  "scheduled_for": "string (ISO date)",
  "message_template": "string"
}
```

#### `generate_report`
Creates pipeline analytics.

**Parameters**:
```json
{
  "date_range": {"start": "string", "end": "string"},
  "include_metrics": ["string"]
}
```

**Returns**:
```json
{
  "total_applications": "number",
  "response_rate": "number",
  "interview_rate": "number",
  "average_time_to_response": "number",
  "pipeline_by_stage": "object",
  "top_performing_companies": ["string"],
  "suggestions": ["string"]
}
```

### 5. Interview Preparation Tools

#### `generate_questions`
Creates interview question list.

**Parameters**:
```json
{
  "job_description": "string (required)",
  "question_types": ["technical", "behavioral", "situational"],
  "difficulty": "easy|medium|hard (default: medium)",
  "count": "number (default: 10)"
}
```

**Returns**:
```json
{
  "questions": [
    {
      "question": "string",
      "type": "string",
      "difficulty": "string",
      "category": "string",
      "suggested_answer_framework": "string"
    }
  ]
}
```

#### `conduct_mock_interview`
Runs practice interview.

**Parameters**:
```json
{
  "job_description": "string (required)",
  "interview_type": "phone|video|onsite (default: video)",
  "duration_minutes": "number (default: 30)"
}
```

**Returns**:
```json
{
  "interview_session_id": "string",
  "questions_asked": ["string"],
  "user_responses": ["string"],
  "feedback": [
    {
      "question": "string",
      "strengths": ["string"],
      "improvements": ["string"],
      "sample_response": "string"
    }
  ]
}
```

#### `analyze_response`
Provides feedback on interview answers.

**Parameters**:
```json
{
  "question": "string (required)",
  "user_response": "string (required)",
  "question_type": "string"
}
```

**Returns**:
```json
{
  "score": "number (0-10)",
  "strengths": ["string"],
  "areas_for_improvement": ["string"],
  "star_analysis": {
    "situation": "score and feedback",
    "task": "score and feedback",
    "action": "score and feedback",
    "result": "score and feedback"
  },
  "improved_response": "string"
}
```

## Tool Execution

### Synchronous Execution
```typescript
const result = await agent.executeTool('tool_name', params);
```

### With Approval
Some tools require user approval before execution:

```typescript
agent.registerTool({
  name: 'send_email',
  description: 'Sends an email',
  parameters: { ... },
  handler: async (args) => { ... },
  requiresApproval: true  // This tool will ask for approval
});
```

### Error Handling
```typescript
try {
  const result = await agent.executeTool('tool_name', params);
} catch (error) {
  if (error.code === 'TOOL_NOT_FOUND') {
    // Tool doesn't exist
  } else if (error.code === 'INVALID_PARAMS') {
    // Parameters validation failed
  } else if (error.code === 'EXECUTION_FAILED') {
    // Tool execution failed
  }
}
```

## Creating Custom Tools

You can create custom tools for your specific needs:

```typescript
import { AgentRuntime } from '@applypilot/core';

const agent = new AgentRuntime({ ... });

agent.registerTool({
  name: 'my_custom_tool',
  description: 'Does something useful for my workflow',
  parameters: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input to process'
      }
    },
    required: ['input']
  },
  handler: async (args) => {
    // Your tool logic here
    const result = await processInput(args.input);
    
    return {
      toolCallId: args.toolCallId,
      status: 'success',
      result: { output: result },
      executionTimeMs: 100
    };
  }
});
```

## Tool Best Practices

1. **Keep tools focused**: Each tool should do one thing well
2. **Validate inputs**: Always check parameters before processing
3. **Handle errors gracefully**: Return meaningful error messages
4. **Log execution**: Track tool usage for debugging
5. **Respect rate limits**: Don't overwhelm external APIs
6. **Cache when appropriate**: Avoid redundant API calls

## Tool Registry

View all available tools:
```bash
applypilot tools list
```

Get details about a specific tool:
```bash
applypilot tools describe <tool_name>
```

Test a tool:
```bash
applypilot tools test <tool_name> --params '{"key": "value"}'
```
