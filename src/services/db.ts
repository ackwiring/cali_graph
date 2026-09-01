import { PGlite } from '@electric-sql/pglite';

export interface ColumnInfo {
  name: string;
  type: string;
  isNumeric: boolean;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  durationMs: number;
  error?: string;
}

let dbInstance: PGlite | null = null;

/**
 * Initialize or get singleton PGlite PostgreSQL instance
 */
export async function getDb(): Promise<PGlite> {
  if (!dbInstance) {
    dbInstance = new PGlite();
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS _system_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
  return dbInstance;
}

/**
 * Sanitize SQL identifier (column or table name)
 */
export function sanitizeIdentifier(name: string): string {
  // Replace spaces, hyphens, parentheses, etc. with underscores and lowercase
  let clean = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  // Avoid leading numbers or reserved words
  if (/^[0-9]/.test(clean)) {
    clean = 'col_' + clean;
  }
  return clean || 'col';
}

/**
 * Determine PostgreSQL column data type from sample values
 */
function inferPostgresType(values: any[]): { type: string; isNumeric: boolean } {
  let hasValid = false;
  let allInt = true;
  let allNumeric = true;

  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    hasValid = true;
    const num = Number(v);
    if (isNaN(num)) {
      allNumeric = false;
      allInt = false;
      break;
    }
    if (!Number.isInteger(num)) {
      allInt = false;
    }
  }

  if (!hasValid) return { type: 'TEXT', isNumeric: false };
  if (allInt) return { type: 'BIGINT', isNumeric: true };
  if (allNumeric) return { type: 'DOUBLE PRECISION', isNumeric: true };
  return { type: 'TEXT', isNumeric: false };
}

/**
 * Ingest parsed dataset into PostgreSQL table ('smt_data' or 'blazor_data')
 */
export async function ingestTable(
  tableName: 'smt_data' | 'blazor_data',
  headers: string[],
  rows: Record<string, any>[]
): Promise<{ columns: ColumnInfo[]; rowCount: number }> {
  const db = await getDb();

  // Drop table if exists
  await db.exec(`DROP TABLE IF EXISTS ${tableName};`);

  if (headers.length === 0 || rows.length === 0) {
    return { columns: [], rowCount: 0 };
  }

  // Map and sanitize column names
  const colMappings = headers.map((orig) => {
    const clean = sanitizeIdentifier(orig);
    const sampleValues = rows.slice(0, 100).map((r) => r[orig]);
    const { type, isNumeric } = inferPostgresType(sampleValues);
    return {
      original: orig,
      clean,
      type,
      isNumeric,
    };
  });

  // Ensure uniqueness in sanitized column names
  const seen = new Set<string>();
  for (const col of colMappings) {
    let base = col.clean;
    let idx = 1;
    while (seen.has(col.clean)) {
      col.clean = `${base}_${idx++}`;
    }
    seen.add(col.clean);
  }

  // Create table schema
  const colDefs = colMappings.map((c) => `"${c.clean}" ${c.type}`).join(',\n  ');
  const createSql = `CREATE TABLE ${tableName} (\n  id SERIAL PRIMARY KEY,\n  ${colDefs}\n);`;
  await db.exec(createSql);

  // Batch insert rows
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const valuesList: string[] = [];

    for (const row of batch) {
      const rowVals = colMappings.map((c) => {
        const val = row[c.original];
        if (val === null || val === undefined || val === '') return 'NULL';
        if (c.isNumeric) {
          const num = Number(val);
          return isNaN(num) ? 'NULL' : `${num}`;
        }
        // Escape string single quotes
        const strVal = String(val).replace(/'/g, "''");
        return `'${strVal}'`;
      });
      valuesList.push(`(${rowVals.join(', ')})`);
    }

    if (valuesList.length > 0) {
      const colNames = colMappings.map((c) => `"${c.clean}"`).join(', ');
      const insertSql = `INSERT INTO ${tableName} (${colNames}) VALUES \n${valuesList.join(',\n')};`;
      await db.exec(insertSql);
    }
  }

  const columns: ColumnInfo[] = colMappings.map((c) => ({
    name: c.clean,
    type: c.type,
    isNumeric: c.isNumeric,
  }));

  return { columns, rowCount: rows.length };
}

/**
 * Execute arbitrary SQL query against embedded PostgreSQL
 */
export async function executeSql(sql: string): Promise<QueryResult> {
  const start = performance.now();
  try {
    const db = await getDb();
    const result = await db.query(sql);
    const durationMs = Math.round((performance.now() - start) * 100) / 100;

    const rows = (result.rows || []) as Record<string, any>[];
    const columns = result.fields ? result.fields.map((f) => f.name) : rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      columns,
      rows,
      rowCount: rows.length,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      durationMs,
      error: err?.message || String(err),
    };
  }
}

/**
 * Get table row count and schema
 */
export async function getTableStats(tableName: 'smt_data' | 'blazor_data'): Promise<{ exists: boolean; count: number; columns: string[] }> {
  try {
    const db = await getDb();
    const existsRes = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = '${tableName}'
      );
    `);
    const exists = !!(existsRes.rows[0] as any)?.exists;
    if (!exists) return { exists: false, count: 0, columns: [] };

    const countRes = await db.query(`SELECT COUNT(*) as cnt FROM ${tableName};`);
    const count = parseInt(String((countRes.rows[0] as any)?.cnt || 0), 10);

    const colsRes = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = '${tableName}' AND column_name != 'id'
      ORDER BY ordinal_position;
    `);
    const columns = colsRes.rows.map((r: any) => String(r.column_name));

    return { exists: true, count, columns };
  } catch {
    return { exists: false, count: 0, columns: [] };
  }
}
