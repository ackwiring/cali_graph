import { PGlite } from '@electric-sql/pglite';
import { ParsedDataset, TARGET_METRICS, detectColumns } from './fileParser';

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL OUTER';

export interface JoinConfig {
  joinType: JoinType;
  keys: string[];
  groupBy: string;
  caseId?: string;
  /**
   * Which site's "Sent to <Site>_<Stream>..." SMT columns to read (e.g. "Jinidi"). A
   * multi-pit SMT export routes material to several different sites under the identical
   * column-naming shape; without this, generateBhpDecoderSql falls back to whichever site
   * happens to appear first in the file's column order, which is silently wrong for any
   * other site. See fileParser.ts's detectAvailableSentToSites().
   */
  siteFilter?: string;
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
 * Detect whether a pair of datasets looks like the BHP Ministers North
 * SMT-vs-Blazor pivot export, based on characteristic column headers.
 */
export function isBhpMinistersNorthDataset(
  smtDataset: ParsedDataset,
  blazorDataset: ParsedDataset
): boolean {
  const isBhpSmt = smtDataset.headers.some((h) => /ministersnorth|period name|case_id/i.test(h));
  const isBhpBlazor = blazorDataset.headers.some((h) => /row labels|sum of/i.test(h));
  return isBhpSmt || isBhpBlazor;
}

/**
 * Builds a `COALESCE(<side>.raw_data->>'<key1>', <side>.raw_data->>'<key2>', ..., '0')`
 * expression. The dataset's own alias-detected column (from fileParser.ts's TARGET_METRICS
 * — now pattern-matched against ANY "Sent to <Site>_<Stream>:rom_wmt (Mwmt)" site name, not
 * just MinistersNorth) is tried first when available; the hardcoded literals are kept as a
 * fallback chain so a dataset with no detection info (e.g. a hand-built preset with no file
 * loaded) still resolves to the original known-good column names.
 */
function coalesceRawKeys(side: 's' | 'b', dataset: ParsedDataset | undefined, metricKey: string, fallbacks: string[]): string {
  const detected = dataset?.detectedMetrics[metricKey];
  const keys = detected ? [detected, ...fallbacks.filter((f) => f !== detected)] : fallbacks;
  const parts = keys.map((k) => `${side}.raw_data->>'${k.replace(/'/g, "''")}'`);
  return `COALESCE(${parts.join(', ')}, '0')`;
}

function canonicalBlazorName(metricKey: string): string {
  return TARGET_METRICS.find((m) => m.key === metricKey)?.canonicalName || '';
}

/**
 * Canonical BHP SMT-vs-Blazor decoder query. This is the SINGLE SOURCE OF TRUTH for that
 * hardcoded join — it used to be duplicated (and had already drifted) between this
 * function's caller and the SQL Console's preset template. Both now call this directly.
 *
 * `smtDataset`/`blazorDataset` are optional: when provided (the real ingestion path always
 * provides them), each metric prefers whatever column detectColumns() actually finds in
 * THIS file — so a Jinidi, MinistersNorth, or any other site's export decodes correctly
 * without editing this function. Without a dataset (e.g. the SQL Console's static preset
 * template), it falls back to the original MinistersNorth/Total literal column names.
 *
 * `siteFilter` (e.g. "Jinidi") scopes the SMT-side "Sent to <Site>_<Stream>..." detection to
 * ONE site. This is REQUIRED correctness for a multi-pit SMT export, which routes material
 * to several different sites' crushers/waste/ExPit under the identical column-naming shape
 * in the same file — without it, whichever site happens to sit first in column order wins,
 * silently substituting a different site's figures for the one actually being compared.
 * Detection is recomputed fresh here (never read from smtDataset.detectedMetrics, which is
 * computed once at parse time with no site filter) so a site chosen AFTER upload takes
 * effect immediately, with no need to re-parse the file.
 */
export function generateBhpDecoderSql(
  caseId: string,
  joinType: JoinType,
  smtDataset?: ParsedDataset,
  blazorDataset?: ParsedDataset,
  siteFilter?: string
): string {
  const smtDatasetForCoalesce: ParsedDataset | undefined = smtDataset
    ? { ...smtDataset, detectedMetrics: detectColumns(smtDataset.headers, { siteFilter }).detectedMetrics }
    : undefined;

  const smtCrusher = coalesceRawKeys('s', smtDatasetForCoalesce, 'crusher_haul_wet_tonnes', [
    'Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)',
    'Sent to MinistersNorth_Crusher:wmt (Mwmt)',
  ]);
  const smtWaste = coalesceRawKeys('s', smtDatasetForCoalesce, 'waste_haul_wet_tonnes', [
    'Sent to MinistersNorth_Waste:rom_wmt (Mwmt)',
    'Sent to MinistersNorth_Waste:wmt (Mwmt)',
  ]);
  const smtExpit = coalesceRawKeys('s', smtDatasetForCoalesce, 'total_expit_haul_wet_tonnes', [
    'Sent to MinistersNorth_ExPit:rom_wmt (Mwmt)',
    'Sent to MinistersNorth_ExPit:wmt (Mwmt)',
  ]);
  const smtFromSp = coalesceRawKeys('s', smtDatasetForCoalesce, 'from_stockpile_wet_tonnes', [
    'Sent to Total_from_SP:rom_wmt (Mwmt)',
  ]);
  // Conveyor MIN_CMN intentionally reads the SAME SMT column as Crusher Haul — see the
  // comment on conveyor_from_min_cmn in fileParser.ts for why that's deliberate, not a bug.
  const smtConveyor = smtCrusher;
  const smtToSp = coalesceRawKeys('s', smtDatasetForCoalesce, 'to_stockpile_wet_tonnes', [
    'Sent to Total_to_SP:rom_wmt (Mwmt)',
  ]);

  const blzCrusher = coalesceRawKeys('b', blazorDataset, 'crusher_haul_wet_tonnes', [canonicalBlazorName('crusher_haul_wet_tonnes')]);
  const blzWaste = coalesceRawKeys('b', blazorDataset, 'waste_haul_wet_tonnes', [canonicalBlazorName('waste_haul_wet_tonnes')]);
  const blzExpit = coalesceRawKeys('b', blazorDataset, 'total_expit_haul_wet_tonnes', [canonicalBlazorName('total_expit_haul_wet_tonnes')]);
  const blzOre = coalesceRawKeys('b', blazorDataset, 'expit_ore_wet_tonnes', [canonicalBlazorName('expit_ore_wet_tonnes')]);
  const blzFromSp = coalesceRawKeys('b', blazorDataset, 'from_stockpile_wet_tonnes', [canonicalBlazorName('from_stockpile_wet_tonnes')]);
  const blzConveyor = coalesceRawKeys('b', blazorDataset, 'conveyor_from_min_cmn', [canonicalBlazorName('conveyor_from_min_cmn')]);
  const blzToSp = coalesceRawKeys('b', blazorDataset, 'to_stockpile_wet_tonnes', [canonicalBlazorName('to_stockpile_wet_tonnes')]);

  return `SELECT
    CAST(b.raw_data->>'Row Labels' AS INTEGER) AS period,
    s.raw_data->>'CASE_ID' AS case_id,

    -- 1. Crusher Haul (Converted from Mwmt to Wet Tonnes)
    ROUND(CAST(${smtCrusher} AS NUMERIC) * 1000000.0, 2) AS smt_crusher_haul_wet_tonnes,
    ROUND(CAST(${blzCrusher} AS NUMERIC), 2) AS blazor_crusher_haul_wet_tonnes,
    ROUND(CAST(${blzCrusher} AS NUMERIC) - (CAST(${smtCrusher} AS NUMERIC) * 1000000.0), 2) AS delta_crusher_haul_wet_tonnes,

    -- 2. Waste Haul (Converted from Mwmt to Wet Tonnes)
    ROUND(CAST(${smtWaste} AS NUMERIC) * 1000000.0, 2) AS smt_waste_haul_wet_tonnes,
    ROUND(CAST(${blzWaste} AS NUMERIC), 2) AS blazor_waste_haul_wet_tonnes,
    ROUND(CAST(${blzWaste} AS NUMERIC) - (CAST(${smtWaste} AS NUMERIC) * 1000000.0), 2) AS delta_waste_haul_wet_tonnes,

    -- 3. Total ExPit Haul (Converted from Mwmt to Wet Tonnes)
    ROUND(CAST(${smtExpit} AS NUMERIC) * 1000000.0, 2) AS smt_total_expit_haul_wet_tonnes,
    ROUND(CAST(${blzExpit} AS NUMERIC), 2) AS blazor_total_expit_haul_wet_tonnes,
    ROUND(CAST(${blzExpit} AS NUMERIC) - (CAST(${smtExpit} AS NUMERIC) * 1000000.0), 2) AS delta_total_expit_haul_wet_tonnes,

    -- 4. ExPit Ore (Wet Tonnes)
    0.00 AS smt_expit_ore_wet_tonnes,
    ROUND(CAST(${blzOre} AS NUMERIC), 2) AS blazor_expit_ore_wet_tonnes,
    ROUND(CAST(${blzOre} AS NUMERIC), 2) AS delta_expit_ore_wet_tonnes,

    -- 5. From Stockpile (Converted from Mwmt to Wet Tonnes)
    ROUND(CAST(${smtFromSp} AS NUMERIC) * 1000000.0, 2) AS smt_from_stockpile_wet_tonnes,
    ROUND(CAST(${blzFromSp} AS NUMERIC), 2) AS blazor_from_stockpile_wet_tonnes,
    ROUND(CAST(${blzFromSp} AS NUMERIC) - (CAST(${smtFromSp} AS NUMERIC) * 1000000.0), 2) AS delta_from_stockpile_wet_tonnes,

    -- 6. Conveyor MIN_CMN (Mapped to the same SMT column as Crusher Haul per decoder)
    ROUND(CAST(${smtConveyor} AS NUMERIC) * 1000000.0, 2) AS smt_conveyor_from_min_cmn,
    ROUND(CAST(${blzConveyor} AS NUMERIC), 2) AS blazor_conveyor_from_min_cmn,
    ROUND(CAST(${blzConveyor} AS NUMERIC) - (CAST(${smtConveyor} AS NUMERIC) * 1000000.0), 2) AS delta_conveyor_from_min_cmn,

    -- 7. To Stockpile (Converted from Mwmt to Wet Tonnes)
    ROUND(CAST(${smtToSp} AS NUMERIC) * 1000000.0, 2) AS smt_to_stockpile_wet_tonnes,
    ROUND(CAST(${blzToSp} AS NUMERIC), 2) AS blazor_to_stockpile_wet_tonnes,
    ROUND(CAST(${blzToSp} AS NUMERIC) - (CAST(${smtToSp} AS NUMERIC) * 1000000.0), 2) AS delta_to_stockpile_wet_tonnes

FROM blazor_data b
${joinType} JOIN smt_data s
    ON CAST(b.raw_data->>'Row Labels' AS INTEGER) = CAST(FLOOR(CAST(s.raw_data->>'Period Name' AS NUMERIC)) AS INTEGER)
WHERE b.raw_data->>'Row Labels' NOT ILIKE '%Grand Total%'
  AND s.raw_data->>'CASE_ID' = '${caseId}'
ORDER BY period ASC;`;
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

  // If this is a BHP-style SMT vs Blazor pivot (Ministers North, Jinidi, or any other
  // site in the same "Sent to <Site>_<Stream>:rom_wmt (Mwmt)" export shape)
  if (isBhpMinistersNorthDataset(smtDataset, blazorDataset)) {
    return generateBhpDecoderSql(config.caseId || '270', config.joinType, smtDataset, blazorDataset, config.siteFilter);
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
