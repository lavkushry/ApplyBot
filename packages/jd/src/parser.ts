import { readFileSync } from 'fs';
import { extname } from 'path';
import type { JDSource } from '@applypilot/core';

export interface JDParseResult {
  text: string;
  source: JDSource;
  metadata: {
    title?: string;
    company?: string;
    url?: string;
    parsedAt: string;
    fileType?: string;
    wordCount: number;
  };
}

export class JDParser {
  /**
   * Parse JD from text input
   */
  parseFromText(text: string, metadata?: { title?: string; company?: string; url?: string }): JDParseResult {
    const cleaned = this.cleanText(text);
    return {
      text: cleaned,
      source: 'paste',
      metadata: {
        ...metadata,
        parsedAt: new Date().toISOString(),
        wordCount: this.countWords(cleaned),
      },
    };
  }

  /**
   * Parse JD from file (PDF, TXT, or MD)
   */
  async parseFromFile(filePath: string): Promise<JDParseResult> {
    const ext = extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.txt':
      case '.md':
        return this.parseTextFile(filePath);
      case '.pdf':
        return this.parsePDFFile(filePath);
      default:
        throw new Error(`Unsupported file type: ${ext}. Supported: .txt, .md, .pdf`);
    }
  }

  /**
   * Parse text file
   */
  private parseTextFile(filePath: string): JDParseResult {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const cleaned = this.cleanText(content);
      
      return {
        text: cleaned,
        source: 'file',
        metadata: {
          parsedAt: new Date().toISOString(),
          fileType: 'text',
          wordCount: this.countWords(cleaned),
        },
      };
    } catch (error) {
      throw new Error(`Failed to read text file: ${error}`);
    }
  }

  /**
   * Parse PDF file
   */
  private async parsePDFFile(filePath: string): Promise<JDParseResult> {
    try {
      // Dynamic import to avoid issues if pdf-parse is not installed
      const pdfParse = await import('pdf-parse').then(m => m.default || m);
      const buffer = readFileSync(filePath);
      const data = await pdfParse(buffer);
      
      const cleaned = this.cleanText(data.text);
      
      return {
        text: cleaned,
        source: 'file',
        metadata: {
          parsedAt: new Date().toISOString(),
          fileType: 'pdf',
          wordCount: this.countWords(cleaned),
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse PDF file: ${error}`);
    }
  }

  /**
   * Clean and normalize JD text
   */
  cleanText(text: string): string {
    return text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive blank lines
      .replace(/\n{3,}/g, '\n\n')
      // Replace tabs with spaces
      .replace(/\t/g, ' ')
      // Remove excessive spaces
      .replace(/ {2,}/g, ' ')
      // Remove null bytes
      .replace(/\x00/g, '')
      // Trim whitespace
      .trim();
  }

  /**
   * Validate JD text
   */
  validate(text: string): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check minimum length
    if (text.length < 100) {
      errors.push('JD text is too short (minimum 100 characters)');
    }

    // Check maximum length
    if (text.length > 50000) {
      warnings.push('JD text is very long (>50,000 characters), consider trimming');
    }

    // Check for encoding issues
    if (/[^\x20-\x7E\n\r\t\xA0-\xFF]/.test(text)) {
      warnings.push('Text contains non-printable characters that may cause issues');
    }

    // Check for common JD indicators
    const jdIndicators = [
      'responsibilities',
      'requirements',
      'qualifications',
      'experience',
      'skills',
      'job description',
      'position',
      'role',
    ];
    
    const hasIndicators = jdIndicators.some(indicator => 
      text.toLowerCase().includes(indicator)
    );
    
    if (!hasIndicators) {
      warnings.push('Text may not be a job description (no common JD keywords found)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Extract potential title from JD text
   */
  extractTitle(text: string): string | undefined {
    // Look for common title patterns
    const patterns = [
      /^([A-Z][a-zA-Z\s]+(?:Engineer|Developer|Manager|Director|Analyst|Designer|Architect|Specialist|Lead)(?:\s+[A-Z][a-zA-Z\s]+)?)/m,
      /position:\s*([^\n]+)/i,
      /role:\s*([^\n]+)/i,
      /job title:\s*([^\n]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  /**
   * Extract potential company from JD text
   */
  extractCompany(text: string): string | undefined {
    // Look for common company patterns
    const patterns = [
      /(?:at|with)\s+([A-Z][a-zA-Z\s&]+)(?:\s+\(|\s+-|\s+is|\s+are|\n)/,
      /company:\s*([^\n]+)/i,
      /organization:\s*([^\n]+)/i,
      /about\s+([A-Z][a-zA-Z\s&]+):/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return undefined;
  }
}