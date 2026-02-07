import type { DatabaseStub } from '../database-stub.js';
import type { FieldMapping } from '../types.js';

export class FieldMappingRepository {
  constructor(private db: DatabaseStub) {}

  create(mapping: Omit<FieldMapping, 'createdAt' | 'updatedAt' | 'usageCount' | 'lastUsedAt'>): FieldMapping {
    const stmt = this.db.prepare(`
      INSERT INTO field_mappings (id, portal, domain, mapping_json)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(mapping.id, mapping.portal, mapping.domain, JSON.stringify(mapping.mappingJson));

    return this.findById(mapping.id)!;
  }

  findById(id: string): FieldMapping | null {
    const row = this.db.query('SELECT * FROM field_mappings WHERE id = ?').get(id) as Record<
      string,
      unknown
    > | null;
    return row ? this.mapRowToMapping(row) : null;
  }

  findByPortalAndDomain(portal: string, domain?: string): FieldMapping | null {
    let sql = 'SELECT * FROM field_mappings WHERE portal = ?';
    const params: unknown[] = [portal];

    if (domain) {
      sql += ' AND (domain = ? OR domain IS NULL)';
      params.push(domain);
    } else {
      sql += ' AND domain IS NULL';
    }

    sql += ' ORDER BY usage_count DESC LIMIT 1';

    const row = this.db.query(sql).get(...params) as Record<string, unknown> | null;
    return row ? this.mapRowToMapping(row) : null;
  }

  findAllByPortal(portal: string): FieldMapping[] {
    const rows = this.db
      .query('SELECT * FROM field_mappings WHERE portal = ? ORDER BY usage_count DESC')
      .all(portal) as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToMapping(row));
  }

  update(id: string, updates: Partial<Omit<FieldMapping, 'id' | 'createdAt' | 'updatedAt'>>): FieldMapping | null {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.portal !== undefined) {
      sets.push('portal = ?');
      params.push(updates.portal);
    }
    if (updates.domain !== undefined) {
      sets.push('domain = ?');
      params.push(updates.domain);
    }
    if (updates.mappingJson !== undefined) {
      sets.push('mapping_json = ?');
      params.push(JSON.stringify(updates.mappingJson));
    }
    if (updates.usageCount !== undefined) {
      sets.push('usage_count = ?');
      params.push(updates.usageCount);
    }
    if (updates.lastUsedAt !== undefined) {
      sets.push('last_used_at = ?');
      params.push(updates.lastUsedAt);
    }

    if (sets.length === 0) return this.findById(id);

    params.push(id);
    const sql = `UPDATE field_mappings SET ${sets.join(', ')} WHERE id = ?`;
    this.db.run(sql, params);

    return this.findById(id);
  }

  incrementUsage(id: string): void {
    this.db.run(
      `UPDATE field_mappings 
       SET usage_count = usage_count + 1, last_used_at = datetime('now') 
       WHERE id = ?`,
      [id]
    );
  }

  delete(id: string): boolean {
    const result = this.db.run('DELETE FROM field_mappings WHERE id = ?', [id]);
    return result.changes > 0;
  }

  private mapRowToMapping(row: Record<string, unknown>): FieldMapping {
    return {
      id: row.id as string,
      portal: row.portal as string,
      domain: row.domain as string | null,
      mappingJson: JSON.parse(row.mapping_json as string),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      usageCount: row.usage_count as number,
      lastUsedAt: row.last_used_at as string | null,
    };
  }
}