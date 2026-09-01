import { PGlite } from '@electric-sql/pglite';
import { ParsedDataset, TARGET_METRICS } from './fileParser';

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL OUTER';

export interface JoinConfig {
  joinType: JoinType;
  keys: string[];
  groupBy: string;
  caseId?: string;
}

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
      CREATE TABLE IF NOT EXISTS smt_data (
        id SERIAL PRIMARY KEY,
        period INTEGER,
        raw_data JSONB
      );
      CREATE TABLE IF NOT EXISTS blazor_data (
        id SERIAL PRIMARY KEY,
        period INTEGER,
        raw_data JSONB
      );
    `);
  }
  return dbInstance;
}

/**
 * Sanitize SQL identifier (column or table name)
 * Ensures compliance with PostgreSQL 63-byte identifier limit (NAMEDATALEN = 64)
 */
export function sanitizeIdentifier(name: string): string {
  let clean = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (/^[0-9]/.test(clean)) {
    clean = 'col_' + clean;
  }
  if (!clean) {
    clean = 'col';
  }
  if (clean.length > 55) {
    clean = clean.substring(0, 55);
  }
  return clean;
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
 * Gracefully handles ultra-wide datasets (>1,600 columns), 63-char identifier limits,
 * and preserves 100% of original row data in a raw_data JSONB column.
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

  // PostgreSQL has a hard architectural limit of at most 1,600 columns.
  // We cap relational columns to a safe ceiling of 600, while preserving ALL columns in raw_data JSONB.
  const MAX_RELATIONAL_COLS = 600;
  const activeHeaders = headers.slice(0, MAX_RELATIONAL_COLS);

  // Map and sanitize column names, guaranteeing uniqueness and <=63 char length
  const seenIdentifiers = new Set<string>();
  const colMappings = activeHeaders.map((orig) => {
    let clean = sanitizeIdentifier(orig);
    let uniqueClean = clean;
    let suffix = 1;
    while (seenIdentifiers.has(uniqueClean)) {
      uniqueClean = `${clean.substring(0, 50)}_${suffix++}`;
    }
    seenIdentifiers.add(uniqueClean);

    const sampleValues = rows.slice(0, 100).map((r) => r[orig]);
    const { type, isNumeric } = inferPostgresType(sampleValues);
    return {
      original: orig,
      clean: uniqueClean,
      type,
      isNumeric,
    };
  });

  // Create table schema with raw_data JSONB column
  const colDefs = colMappings.map((c) => `"${c.clean}" ${c.type}`).join(',\n  ');
  const createSql = `CREATE TABLE ${tableName} (\n  id SERIAL PRIMARY KEY,\n  raw_data JSONB,\n  ${colDefs}\n);`;
  await db.exec(createSql);

  // Dynamically calculate batch size based on column count to avoid statement length & memory spikes
  const dynamicBatchSize = Math.max(5, Math.min(250, Math.floor(4000 / Math.max(1, colMappings.length))));

  for (let i = 0; i < rows.length; i += dynamicBatchSize) {
    const batch = rows.slice(i, i + dynamicBatchSize);
    const valuesList: string[] = [];

    for (const row of batch) {
      // Lossless JSON representation of the entire row
      const jsonStr = JSON.stringify(row).replace(/'/g, "''");

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

      valuesList.push(`('${jsonStr}', ${rowVals.join(', ')})`);
    }

    if (valuesList.length > 0) {
      const colNames = colMappings.map((c) => `"${c.clean}"`).join(', ');
      const insertSql = `INSERT INTO ${tableName} (raw_data, ${colNames}) VALUES \n${valuesList.join(',\n')};`;
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

/**
 * Generate PostgreSQL SQL query to join SMT and Blazor datasets
 */
export function generateCalibrationSql(
  smtDataset: ParsedDataset | null,
  blazorDataset: ParsedDataset | null,
  config: JoinConfig
): string {
  if (!smtDataset || !blazorDataset) {
    return '-- Upload both SMT and Blazor datasets to generate calibration SQL';
  }

  const isBhpSmt = smtDataset.headers.some((h) => /ministersnorth|period name|case_id/i.test(h));
  const isBhpBlazor = blazorDataset.headers.some((h) => /row labels|sum of/i.test(h));

  // If this is BHP Ministers North SMT vs Blasor Pivot
  if (isBhpSmt || isBhpBlazor) {
    const caseId = config.caseId || '270';
    return `SELECT 
    CAST(b.raw_data->>'Row Labels' AS INTEGER) AS period,
    s.raw_data->>'CASE_ID' AS case_id,
    
    -- 1. Crusher Haul (Converted from Mwmt to Wet Tonnes)
    ROUND(CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_Crusher:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0, 2) AS smt_crusher_haul_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Crusher_Haul_Wet_Tonnes', '0') AS NUMERIC), 2) AS blazor_crusher_haul_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Crusher_Haul_Wet_Tonnes', '0') AS NUMERIC) - (CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_Crusher:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0), 2) AS delta_crusher_haul_wet_tonnes,
    
    -- 2. Waste Haul (Converted from Mwmt to Wet Tonnes)
    ROUND(CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_Waste:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_Waste:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0, 2) AS smt_waste_haul_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Waste_Haul_Wet_Tonnes', '0') AS NUMERIC), 2) AS blazor_waste_haul_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Waste_Haul_Wet_Tonnes', '0') AS NUMERIC) - (CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_Waste:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_Waste:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0), 2) AS delta_waste_haul_wet_tonnes,

    -- 3. Total ExPit Haul (Converted from Mwmt to Wet Tonnes)
    ROUND(CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_ExPit:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_ExPit:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0, 2) AS smt_total_expit_haul_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Total_ExPit_Haul_Wet_Tonnes', '0') AS NUMERIC), 2) AS blazor_total_expit_haul_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Total_ExPit_Haul_Wet_Tonnes', '0') AS NUMERIC) - (CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_ExPit:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_ExPit:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0), 2) AS delta_total_expit_haul_wet_tonnes,

    -- 4. ExPit Ore (Wet Tonnes)
    0.00 AS smt_expit_ore_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of ExPit_Ore_Wet_Tonnes', '0') AS NUMERIC), 2) AS blazor_expit_ore_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of ExPit_Ore_Wet_Tonnes', '0') AS NUMERIC), 2) AS delta_expit_ore_wet_tonnes,

    -- 5. From Stockpile (Converted from Mwmt to Wet Tonnes)
    ROUND(CAST(COALESCE(s.raw_data->>'Sent to Total_from_SP:rom_wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0, 2) AS smt_from_stockpile_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of From_Stockpile_Wet_Tonnes', '0') AS NUMERIC), 2) AS blazor_from_stockpile_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of From_Stockpile_Wet_Tonnes', '0') AS NUMERIC) - (CAST(COALESCE(s.raw_data->>'Sent to Total_from_SP:rom_wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0), 2) AS delta_from_stockpile_wet_tonnes,

    -- 6. Conveyor MIN_CMN (Mapped to MinistersNorth_Crusher per decoder)
    ROUND(CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_Crusher:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0, 2) AS smt_conveyor_from_min_cmn,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Conveyor from MIN_CMN', '0') AS NUMERIC), 2) AS blazor_conveyor_from_min_cmn,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Conveyor from MIN_CMN', '0') AS NUMERIC) - (CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_Crusher:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0), 2) AS delta_conveyor_from_min_cmn,

    -- 7. To Stockpile (Converted from Mwmt to Wet Tonnes)
    ROUND(CAST(COALESCE(s.raw_data->>'Sent to Total_to_SP:rom_wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0, 2) AS smt_to_stockpile_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of To_Stockpile_Wet_Tonnes', '0') AS NUMERIC), 2) AS blazor_to_stockpile_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of To_Stockpile_Wet_Tonnes', '0') AS NUMERIC) - (CAST(COALESCE(s.raw_data->>'Sent to Total_to_SP:rom_wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0), 2) AS delta_to_stockpile_wet_tonnes

FROM blazor_data b
${config.joinType} JOIN smt_data s
    ON CAST(b.raw_data->>'Row Labels' AS INTEGER) = CAST(FLOOR(CAST(s.raw_data->>'Period Name' AS NUMERIC)) AS INTEGER)
WHERE b.raw_data->>'Row Labels' NOT ILIKE '%Grand Total%'
  AND s.raw_data->>'CASE_ID' = '${caseId}'
ORDER BY period ASC;`;
  }

  // Standard generic join fallback
  const keys = config.keys.length > 0 ? config.keys : ['period'];
  const joinConditions = keys.map((k) => `s."${k}" = b."${k}"`).join(' AND ');

  const metricSelects = TARGET_METRICS.map((m) => {
    const sCol = smtDataset.detectedMetrics[m.key] ? sanitizeIdentifier(smtDataset.detectedMetrics[m.key]) : null;
    const bCol = blazorDataset.detectedMetrics[m.key] ? sanitizeIdentifier(blazorDataset.detectedMetrics[m.key]) : null;

    const sSql = sCol ? `COALESCE(SUM(s."${sCol}"), 0)` : `0`;
    const bSql = bCol ? `COALESCE(SUM(b."${bCol}"), 0)` : `0`;

    return `  -- ${m.canonicalName}\n  ${sSql} AS "smt_${m.key}",\n  ${bSql} AS "blazor_${m.key}",\n  (${bSql} - ${sSql}) AS "delta_${m.key}"`;
  }).join(',\n');

  const keySelects = keys.map((k) => `COALESCE(s."${k}", b."${k}") AS "${k}"`).join(',\n  ');
  const groupClause = keys.map((k) => `COALESCE(s."${k}", b."${k}")`).join(', ');

  return `SELECT
  ${keySelects},
${metricSelects}
FROM smt_data s
${config.joinType} JOIN blazor_data b
  ON ${joinConditions}
GROUP BY ${groupClause}
ORDER BY ${groupClause};`;
}
