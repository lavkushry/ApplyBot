import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { ResumeChange } from '@applypilot/core';

export interface TemplateMarkers {
  summary?: string;
  skills?: string;
  experience?: string;
  projects?: string;
  education?: string;
  certifications?: string;
}

export interface MarkerValidation {
  valid: boolean;
  missing: string[];
  found: string[];
  warnings: string[];
}

export class ResumeTemplate {
  private templatePath: string;
  private content: string;
  private originalContent: string;

  constructor(templatePath: string) {
    this.templatePath = templatePath;
    this.content = this.loadTemplate();
    this.originalContent = this.content;
  }

  private loadTemplate(): string {
    try {
      return readFileSync(this.templatePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to load template from ${this.templatePath}: ${error}`);
    }
  }

  /**
   * Replace markers in template with content
   */
  patch(markers: TemplateMarkers): { content: string; changes: ResumeChange[] } {
    let patchedContent = this.content;
    const changes: ResumeChange[] = [];

    for (const [markerName, content] of Object.entries(markers)) {
      if (!content) continue;

      const result = this.patchMarker(patchedContent, markerName, content);
      patchedContent = result.content;
      
      if (result.changed) {
        changes.push({
          section: markerName,
          field: markerName,
          oldValue: '[previous content]',
          newValue: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
          reason: `Updated ${markerName} section based on JD analysis`,
        });
      }
    }

    return { content: patchedContent, changes };
  }

  /**
   * Patch a single marker
   */
  private patchMarker(
    content: string,
    markerName: string,
    replacement: string
  ): { content: string; changed: boolean } {
    const startMarker = `<!-- ${markerName.toUpperCase()}_START -->`;
    const endMarker = `<!-- ${markerName.toUpperCase()}_END -->`;
    
    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
      return { content, changed: false };
    }

    const before = content.substring(0, startIndex + startMarker.length);
    const after = content.substring(endIndex);
    
    const newContent = `${before}\n${replacement}\n${after}`;
    
    return { content: newContent, changed: true };
  }

  /**
   * Save patched template to file
   */
  save(outputPath: string, content?: string): void {
    const outputContent = content || this.content;
    
    // Ensure directory exists
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      throw new Error(`Output directory does not exist: ${dir}`);
    }
    
    writeFileSync(outputPath, outputContent, 'utf-8');
  }

  /**
   * Validate template has required markers
   */
  validate(): MarkerValidation {
    const requiredMarkers = ['SUMMARY', 'SKILLS', 'EXPERIENCE'];
    const optionalMarkers = ['PROJECTS', 'EDUCATION', 'CERTIFICATIONS'];
    
    const missing: string[] = [];
    const found: string[] = [];
    const warnings: string[] = [];

    for (const marker of requiredMarkers) {
      const startMarker = `<!-- ${marker}_START -->`;
      const endMarker = `<!-- ${marker}_END -->`;
      
      const hasStart = this.content.includes(startMarker);
      const hasEnd = this.content.includes(endMarker);
      
      if (hasStart && hasEnd) {
        found.push(marker);
      } else {
        missing.push(marker);
        if (hasStart !== hasEnd) {
          warnings.push(`${marker} has incomplete markers (missing ${hasStart ? 'END' : 'START'})`);
        }
      }
    }

    for (const marker of optionalMarkers) {
      const startMarker = `<!-- ${marker}_START -->`;
      const endMarker = `<!-- ${marker}_END -->`;
      
      if (this.content.includes(startMarker) && this.content.includes(endMarker)) {
        found.push(marker);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      found,
      warnings,
    };
  }

  /**
   * Get list of all markers in template
   */
  getMarkers(): string[] {
    const markerPattern = /<!-- ([A-Z_]+)_START -->/g;
    const markers: string[] = [];
    let match;

    while ((match = markerPattern.exec(this.content)) !== null) {
      markers.push(match[1]);
    }

    return markers;
  }

  /**
   * Get content between markers
   */
  getMarkerContent(markerName: string): string | null {
    const startMarker = `<!-- ${markerName.toUpperCase()}_START -->`;
    const endMarker = `<!-- ${markerName.toUpperCase()}_END -->`;
    
    const startIndex = this.content.indexOf(startMarker);
    const endIndex = this.content.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
      return null;
    }

    return this.content.substring(
      startIndex + startMarker.length,
      endIndex
    ).trim();
  }

  /**
   * Reset to original template content
   */
  reset(): void {
    this.content = this.originalContent;
  }

  /**
   * Get current template content
   */
  getContent(): string {
    return this.content;
  }

  /**
   * Set new content (for testing)
   */
  setContent(content: string): void {
    this.content = content;
  }
}