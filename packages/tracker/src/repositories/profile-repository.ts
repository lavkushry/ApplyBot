import type { DatabaseStub } from '../database-stub.js';
import type { Profile } from '../types.js';

export class ProfileRepository {
  constructor(private db: DatabaseStub) {}

  getOrCreateDefault(): Profile {
    let profile = this.findById('default');
    if (!profile) {
      this.db.run(
        `INSERT INTO profiles (id, profile_json, achievements_json, is_encrypted) 
         VALUES ('default', '{}', '[]', 0)`
      );
      profile = this.findById('default')!;
    }
    return profile;
  }

  findById(id: string): Profile | null {
    const row = this.db.query('SELECT * FROM profiles WHERE id = ?').get(id) as Record<
      string,
      unknown
    > | null;
    return row ? this.mapRowToProfile(row) : null;
  }

  update(id: string, updates: Partial<Omit<Profile, 'id' | 'updatedAt'>>): Profile | null {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.profileJson !== undefined) {
      sets.push('profile_json = ?');
      params.push(JSON.stringify(updates.profileJson));
    }
    if (updates.achievementsJson !== undefined) {
      sets.push('achievements_json = ?');
      params.push(JSON.stringify(updates.achievementsJson));
    }
    if (updates.isEncrypted !== undefined) {
      sets.push('is_encrypted = ?');
      params.push(updates.isEncrypted ? 1 : 0);
    }

    if (sets.length === 0) return this.findById(id);

    params.push(id);
    const sql = `UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`;
    this.db.run(sql, params);

    return this.findById(id);
  }

  private mapRowToProfile(row: Record<string, unknown>): Profile {
    return {
      id: row.id as string,
      updatedAt: row.updated_at as string,
      profileJson: JSON.parse(row.profile_json as string),
      achievementsJson: JSON.parse(row.achievements_json as string),
      isEncrypted: Boolean(row.is_encrypted),
    };
  }
}