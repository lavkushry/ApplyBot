// Stub implementation for database - replaces better-sqlite3 dependency
// This allows the project to build without native dependencies

export interface DatabaseStub {
  exec(sql: string): void;
  prepare(sql: string): StatementStub;
  query(sql: string): QueryStub;
  run(sql: string, params?: unknown[]): RunResultStub;
  close(): void;
  transaction<T>(fn: () => T): () => T;
}

export interface StatementStub {
  run(...params: unknown[]): RunResultStub;
  get(...params: unknown[]): unknown | null;
  all(...params: unknown[]): unknown[];
}

export interface QueryStub {
  get(...params: unknown[]): unknown | null;
  all(...params: unknown[]): unknown[];
}

export interface RunResultStub {
  changes: number;
  lastInsertRowid: number;
}

export class MockDatabase implements DatabaseStub {
  private data: Map<string, unknown[]> = new Map();

  constructor(_path: string) {
    // Mock implementation
  }

  exec(_sql: string): void {
    // Mock implementation
  }

  prepare(sql: string): StatementStub {
    return new MockStatement(this, sql);
  }

  query(sql: string): QueryStub {
    return new MockQuery(this, sql);
  }

  run(_sql: string, _params?: unknown[]): RunResultStub {
    return { changes: 1, lastInsertRowid: 1 };
  }

  close(): void {
    // Mock implementation
  }

  transaction<T>(fn: () => T): () => T {
    return () => fn();
  }
}

class MockStatement implements StatementStub {
  constructor(private db: MockDatabase, private sql: string) {}

  run(...params: unknown[]): RunResultStub {
    console.log('MockStatement.run:', this.sql, params);
    return { changes: 1, lastInsertRowid: Date.now() };
  }

  get(...params: unknown[]): unknown | null {
    console.log('MockStatement.get:', this.sql, params);
    return null;
  }

  all(...params: unknown[]): unknown[] {
    console.log('MockStatement.all:', this.sql, params);
    return [];
  }
}

class MockQuery implements QueryStub {
  constructor(private db: MockDatabase, private sql: string) {}

  get(...params: unknown[]): unknown | null {
    console.log('MockQuery.get:', this.sql, params);
    return null;
  }

  all(...params: unknown[]): unknown[] {
    console.log('MockQuery.all:', this.sql, params);
    return [];
  }
}

// Export a mock Database class that matches better-sqlite3 interface
const Database = MockDatabase;
export default Database;
