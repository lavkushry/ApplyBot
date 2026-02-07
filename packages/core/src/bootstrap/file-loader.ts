/**
 * Bootstrap File Loader
 *
 * Handles loading and injection of bootstrap files:
 * - AGENTS.md: Agent definitions and capabilities
 * - SOUL.md: Personality and behavior configuration
 * - TOOLS.md: Tool definitions and schemas
 * - USER.md: User profile and preferences
 * - BOOTSTRAP.md: First-run instructions
 */

import { EventEmitter } from 'events';

export interface BootstrapFile {
  name: string;
  path: string;
  content: string;
  size: number;
  loaded: boolean;
  truncated: boolean;
}

export interface BootstrapConfig {
  workspacePath: string;
  files: string[];
  maxFileSize: number;
  truncateThreshold: number;
  injectionOrder: string[];
  enableFirstRunBootstrap: boolean;
}

export interface BootstrapResult {
  files: BootstrapFile[];
  totalSize: number;
  truncated: boolean;
  missingFiles: string[];
  firstRun: boolean;
}

export class BootstrapLoader extends EventEmitter {
  private config: BootstrapConfig;

  constructor(config: Partial<BootstrapConfig> = {}) {
    super();

    this.config = {
      workspacePath: config.workspacePath || process.cwd(),
      files: config.files || ['AGENTS.md', 'SOUL.md', 'TOOLS.md', 'USER.md'],
      maxFileSize: config.maxFileSize || 100000, // 100KB max per file
      truncateThreshold: config.truncateThreshold || 80000, // Truncate if > 80KB
      injectionOrder: config.injectionOrder || ['SOUL.md', 'AGENTS.md', 'TOOLS.md', 'USER.md'],
      enableFirstRunBootstrap: config.enableFirstRunBootstrap ?? true,
    };
  }

  /**
   * Load all bootstrap files
   */
  async load(): Promise<BootstrapResult> {
    const files: BootstrapFile[] = [];
    const missingFiles: string[] = [];
    let totalSize = 0;
    let anyTruncated = false;

    // Check for first-run bootstrap
    const isFirstRun = await this.checkFirstRun();

    if (isFirstRun && this.config.enableFirstRunBootstrap) {
      const bootstrapContent = await this.loadFirstRunBootstrap();
      if (bootstrapContent) {
        files.push({
          name: 'BOOTSTRAP.md',
          path: `${this.config.workspacePath}/BOOTSTRAP.md`,
          content: bootstrapContent,
          size: bootstrapContent.length,
          loaded: true,
          truncated: false,
        });
        totalSize += bootstrapContent.length;
      }
    }

    // Load configured files in specified order
    for (const filename of this.config.injectionOrder) {
      if (!this.config.files.includes(filename)) continue;

      const filePath = `${this.config.workspacePath}/${filename}`;
      const content = await this.readFile(filePath);

      if (content === null) {
        missingFiles.push(filename);
        continue;
      }

      // Check size and truncate if necessary
      let fileContent = content;
      let truncated = false;

      if (fileContent.length > this.config.maxFileSize) {
        fileContent = fileContent.substring(0, this.config.maxFileSize);
        truncated = true;
        anyTruncated = true;
        this.emit('file:truncated', { filename, originalSize: content.length, newSize: fileContent.length });
      } else if (fileContent.length > this.config.truncateThreshold) {
        this.emit('file:large', { filename, size: fileContent.length });
      }

      const file: BootstrapFile = {
        name: filename,
        path: filePath,
        content: fileContent,
        size: fileContent.length,
        loaded: true,
        truncated,
      };

      files.push(file);
      totalSize += fileContent.length;

      this.emit('file:loaded', { filename, size: fileContent.length });
    }

    const result: BootstrapResult = {
      files,
      totalSize,
      truncated: anyTruncated,
      missingFiles,
      firstRun: isFirstRun,
    };

    this.emit('bootstrap:loaded', result);

    return result;
  }

  /**
   * Get file by name
   */
  getFile(files: BootstrapFile[], name: string): BootstrapFile | undefined {
    return files.find((f) => f.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Get USER.md content (special handling for anti-hallucination)
   */
  getUserProfile(files: BootstrapFile[]): string | undefined {
    const userFile = this.getFile(files, 'USER.md');
    return userFile?.content;
  }

  /**
   * Get SOUL.md content (personality configuration)
   */
  getSoulConfig(files: BootstrapFile[]): string | undefined {
    const soulFile = this.getFile(files, 'SOUL.md');
    return soulFile?.content;
  }

  /**
   * Get AGENTS.md content (agent definitions)
   */
  getAgentDefinitions(files: BootstrapFile[]): string | undefined {
    const agentsFile = this.getFile(files, 'AGENTS.md');
    return agentsFile?.content;
  }

  /**
   * Get TOOLS.md content (tool definitions)
   */
  getToolDefinitions(files: BootstrapFile[]): string | undefined {
    const toolsFile = this.getFile(files, 'TOOLS.md');
    return toolsFile?.content;
  }

  /**
   * Build system prompt from bootstrap files
   */
  buildSystemPrompt(files: BootstrapFile[]): string {
    const parts: string[] = [];

    // Add SOUL.md (personality) first
    const soul = this.getSoulConfig(files);
    if (soul) {
      parts.push(`# Personality\n\n${soul}`);
    }

    // Add AGENTS.md (capabilities)
    const agents = this.getAgentDefinitions(files);
    if (agents) {
      parts.push(`# Capabilities\n\n${agents}`);
    }

    // Add TOOLS.md (tools)
    const tools = this.getToolDefinitions(files);
    if (tools) {
      parts.push(`# Tools\n\n${tools}`);
    }

    // Add USER.md (user context) last
    const user = this.getUserProfile(files);
    if (user) {
      parts.push(`# User Profile\n\n${user}`);
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Extract user skills from USER.md (anti-hallucination)
   */
  extractUserSkills(files: BootstrapFile[]): string[] {
    const userContent = this.getUserProfile(files);
    if (!userContent) return [];

    // Parse skills section from USER.md
    const skillsMatch = userContent.match(/##?\s*Skills?\s*\n([\s\S]*?)(?=\n##?\s|$)/i);
    if (!skillsMatch) return [];

    const skillsSection = skillsMatch[1];

    // Extract skills from bullet points or comma-separated list
    const skills: string[] = [];

    // Match bullet points
    const bulletMatches = skillsSection.matchAll(/[-*]\s*([^\n]+)/g);
    for (const match of bulletMatches) {
      const skill = match[1].trim();
      if (skill) skills.push(skill);
    }

    // Match comma-separated
    if (skills.length === 0) {
      const commaSkills = skillsSection.split(/,\s*|\n/).map((s) => s.trim()).filter(Boolean);
      skills.push(...commaSkills);
    }

    return skills;
  }

  /**
   * Check if this is first run (BOOTSTRAP.md exists but hasn't been processed)
   */
  private async checkFirstRun(): Promise<boolean> {
    const bootstrapPath = `${this.config.workspacePath}/BOOTSTRAP.md`;
    const content = await this.readFile(bootstrapPath);

    // First run if BOOTSTRAP.md exists and hasn't been marked as processed
    if (content !== null) {
      return !content.includes('<!-- PROCESSED -->');
    }

    return false;
  }

  /**
   * Load first-run bootstrap content
   */
  private async loadFirstRunBootstrap(): Promise<string | null> {
    const bootstrapPath = `${this.config.workspacePath}/BOOTSTRAP.md`;
    const content = await this.readFile(bootstrapPath);

    if (content !== null) {
      // Mark as processed
      await this.writeFile(bootstrapPath, content + '\n\n<!-- PROCESSED -->');
      return content;
    }

    return null;
  }

  /**
   * Validate bootstrap files
   */
  validate(files: BootstrapFile[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for required files
    const requiredFiles = ['USER.md'];
    for (const required of requiredFiles) {
      if (!files.some((f) => f.name.toLowerCase() === required.toLowerCase())) {
        errors.push(`Required file ${required} not found`);
      }
    }

    // Validate file sizes
    for (const file of files) {
      if (file.size > this.config.maxFileSize) {
        errors.push(`File ${file.name} exceeds maximum size (${file.size} > ${this.config.maxFileSize})`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Read file (simulated - would use fs in real implementation)
   */
  private async readFile(path: string): Promise<string | null> {
    // In real implementation: fs.readFile(path, 'utf-8')
    // For now, return null to simulate file not found
    // This allows the system to work without actual files
    return null;
  }

  /**
   * Write file (simulated - would use fs in real implementation)
   */
  private async writeFile(path: string, content: string): Promise<void> {
    // In real implementation: fs.writeFile(path, content)
    console.log(`Writing file: ${path}`);
  }
}

// Export factory function
export function createBootstrapLoader(config?: Partial<BootstrapConfig>): BootstrapLoader {
  return new BootstrapLoader(config);
}

// Default bootstrap content templates
export const DEFAULT_BOOTSTRAP_TEMPLATES: Record<string, string> = {
  'USER.md': `# User Profile

## Personal Information
- Name: [Your Name]
- Email: [Your Email]
- Phone: [Your Phone]
- Location: [Your Location]

## Professional
- Current Role: [Your Current Role]
- Years of Experience: [Years]
- Target Roles: [Roles you're targeting]

## Skills
- [Skill 1]
- [Skill 2]
- [Skill 3]

## Preferences
- Preferred work mode: [Remote/Hybrid/Onsite]
- Willing to relocate: [Yes/No]
- Expected salary range: [Range]
`,

  'SOUL.md': `# Agent Personality

## Tone
- Professional but approachable
- Concise and clear
- Helpful and encouraging

## Behavior
- Always verify facts before stating them
- Ask for clarification when uncertain
- Respect user preferences from USER.md
- Never hallucinate skills or experience

## Constraints
- Do not make assumptions about user capabilities
- Always cross-reference with USER.md for accuracy
- Respect privacy and confidentiality
`,

  'AGENTS.md': `# Agent Definitions

## Available Agents

### JD Analyst
- Analyzes job descriptions
- Extracts requirements and skills
- Identifies gaps against user profile

### Resume Tailor
- Tailors resumes for specific jobs
- Reorders skills and achievements
- Generates LaTeX output

### Application Assistant
- Helps with form filling
- Generates cover letters
- Prepares screening answers

## Agent Selection
Agents are selected based on:
1. User intent classification
2. Current job stage
3. Required capabilities
`,

  'TOOLS.md': `# Available Tools

## Analysis Tools
- analyze_jd: Analyze job descriptions
- memory_search: Search memory system
- memory_get: Retrieve memory files

## Resume Tools
- tailor_resume: Tailor resume for job
- compile_pdf: Compile LaTeX to PDF

## Application Tools
- bundle_export: Export application bundle
- portal_autofill: Autofill job portals

## System Tools
- exec: Execute system commands (requires approval)
`,
};
