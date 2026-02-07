/**
 * Achievement Bank - YAML/JSON Achievement Storage
 *
 * Manages user achievements for resume tailoring.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Achievement, AchievementBank, AchievementCategory } from './types.js';

export interface AchievementBankOptions {
  storagePath: string;
  format: 'yaml' | 'json';
}

export class AchievementBankManager {
  private storagePath: string;
  private format: 'yaml' | 'json';
  private bank: AchievementBank;

  constructor(options: AchievementBankOptions) {
    this.storagePath = options.storagePath;
    this.format = options.format ?? 'yaml';
    this.bank = this.loadBank();
  }

  /**
   * Load achievement bank from storage
   */
  private loadBank(): AchievementBank {
    if (!existsSync(this.storagePath)) {
      return {
        achievements: [],
        categories: {
          technical: [],
          leadership: [],
          project: [],
          award: [],
          publication: [],
          certification: [],
        },
        lastUpdated: new Date(),
      };
    }

    const content = readFileSync(this.storagePath, 'utf-8');

    if (this.format === 'json') {
      return JSON.parse(content);
    } else {
      // Simple YAML parsing (in production, use a YAML library)
      return this.parseYaml(content);
    }
  }

  /**
   * Save achievement bank to storage
   */
  private saveBank(): void {
    this.bank.lastUpdated = new Date();

    let content: string;
    if (this.format === 'json') {
      content = JSON.stringify(this.bank, null, 2);
    } else {
      content = this.toYaml(this.bank);
    }

    writeFileSync(this.storagePath, content);
  }

  /**
   * Add a new achievement
   */
  addAchievement(achievement: Omit<Achievement, 'id'>): Achievement {
    const newAchievement: Achievement = {
      ...achievement,
      id: this.generateId(),
    };

    this.bank.achievements.push(newAchievement);
    this.updateCategories(newAchievement);
    this.saveBank();

    return newAchievement;
  }

  /**
   * Get all achievements
   */
  getAchievements(): Achievement[] {
    return [...this.bank.achievements];
  }

  /**
   * Get achievements by category
   */
  getAchievementsByCategory(category: AchievementCategory): Achievement[] {
    return this.bank.achievements.filter((a) => a.category === category);
  }

  /**
   * Get achievements by skill
   */
  getAchievementsBySkill(skill: string): Achievement[] {
    return this.bank.achievements.filter((a) =>
      a.skills.some((s) => s.toLowerCase() === skill.toLowerCase())
    );
  }

  /**
   * Search achievements
   */
  searchAchievements(query: string): Achievement[] {
    const lowerQuery = query.toLowerCase();
    return this.bank.achievements.filter(
      (a) =>
        a.title.toLowerCase().includes(lowerQuery) ||
        a.description.toLowerCase().includes(lowerQuery) ||
        a.skills.some((s) => s.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get top achievements by priority
   */
  getTopAchievements(count: number = 5): Achievement[] {
    return [...this.bank.achievements]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, count);
  }

  /**
   * Get achievements relevant to job requirements
   */
  getRelevantAchievements(requiredSkills: string[], count: number = 5): Achievement[] {
    const scored = this.bank.achievements.map((achievement) => {
      const matchCount = achievement.skills.filter((skill) =>
        requiredSkills.some((req) => req.toLowerCase() === skill.toLowerCase())
      ).length;
      return { achievement, score: matchCount * achievement.priority };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map((s) => s.achievement);
  }

  /**
   * Update an achievement
   */
  updateAchievement(id: string, updates: Partial<Achievement>): Achievement | null {
    const index = this.bank.achievements.findIndex((a) => a.id === id);
    if (index === -1) return null;

    this.bank.achievements[index] = { ...this.bank.achievements[index], ...updates };
    this.saveBank();

    return this.bank.achievements[index];
  }

  /**
   * Delete an achievement
   */
  deleteAchievement(id: string): boolean {
    const index = this.bank.achievements.findIndex((a) => a.id === id);
    if (index === -1) return false;

    this.bank.achievements.splice(index, 1);
    this.rebuildCategories();
    this.saveBank();

    return true;
  }

  /**
   * Get achievement bank statistics
   */
  getStats(): {
    totalAchievements: number;
    byCategory: Record<AchievementCategory, number>;
    topSkills: string[];
  } {
    const byCategory = {} as Record<AchievementCategory, number>;
    for (const category of Object.keys(this.bank.categories) as AchievementCategory[]) {
      byCategory[category] = this.bank.achievements.filter((a) => a.category === category).length;
    }

    const skillCount: Record<string, number> = {};
    for (const achievement of this.bank.achievements) {
      for (const skill of achievement.skills) {
        skillCount[skill] = (skillCount[skill] || 0) + 1;
      }
    }

    const topSkills = Object.entries(skillCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skill]) => skill);

    return {
      totalAchievements: this.bank.achievements.length,
      byCategory,
      topSkills,
    };
  }

  // Private methods

  private generateId(): string {
    return `ach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateCategories(achievement: Achievement): void {
    for (const skill of achievement.skills) {
      if (!this.bank.categories[achievement.category].includes(skill)) {
        this.bank.categories[achievement.category].push(skill);
      }
    }
  }

  private rebuildCategories(): void {
    this.bank.categories = {
      technical: [],
      leadership: [],
      project: [],
      award: [],
      publication: [],
      certification: [],
    };

    for (const achievement of this.bank.achievements) {
      this.updateCategories(achievement);
    }
  }

  private parseYaml(content: string): AchievementBank {
    // Simple YAML parser (in production, use js-yaml)
    try {
      // For now, return empty bank if YAML parsing fails
      return {
        achievements: [],
        categories: {
          technical: [],
          leadership: [],
          project: [],
          award: [],
          publication: [],
          certification: [],
        },
        lastUpdated: new Date(),
      };
    } catch {
      return {
        achievements: [],
        categories: {
          technical: [],
          leadership: [],
          project: [],
          award: [],
          publication: [],
          certification: [],
        },
        lastUpdated: new Date(),
      };
    }
  }

  private toYaml(bank: AchievementBank): string {
    // Simple YAML serializer (in production, use js-yaml)
    return `# Achievement Bank\n# Last Updated: ${bank.lastUpdated.toISOString()}\n\nachievements:\n${bank.achievements
      .map(
        (a) => `  - id: ${a.id}\n    title: ${a.title}\n    description: ${a.description}\n    category: ${a.category}\n    priority: ${a.priority}`
      )
      .join('\n')}`;
  }
}

export default AchievementBankManager;
