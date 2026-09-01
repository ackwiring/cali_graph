import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedDataset {
  fileName: string;
  fileSize: number;
  headers: string[];
  rows: Record<string, any>[];
  detectedMetrics: Record<string, string>; // canonicalKey -> actualColumnName
  detectedKeys: string[];
}

export interface TargetMetricConfig {
  key: string;
  canonicalName: string;
  shortName: string;
  aliases: string[];
  color: string;
}

export const TARGET_METRICS: TargetMetricConfig[] = [
  {
    key: 'crusher_haul_wet_tonnes',
    canonicalName: 'Sum of Crusher_Haul_Wet_Tonnes',
    shortName: 'Crusher Haul',
    aliases: [
      'crusher_haul_wet_tonnes',
      'crusher_haul',
      'crusher haul wet tonnes',
      'sum of crusher_haul_wet_tonnes',
      'crusher_wet_tonnes',
      'crushertruckstonnes',
      'sent to ministersnorth_crusher:rom_wmt (mwmt)',
      'sent to ministersnorth_crusher:wmt (mwmt)',
      'ministersnorth_crusher',
      'to_nops_crusher_mass_mt',
      'sent_to_nops_crusher',
      'to_nops_crusher',
      'crusher_mass',
      'crusher_total',
      'crusher_wmt'
    ],
    color: '#f97316'
  },
  {
    key: 'waste_haul_wet_tonnes',
    canonicalName: 'Sum of Waste_Haul_Wet_Tonnes',
    shortName: 'Waste Haul',
    aliases: [
      'waste_haul_wet_tonnes',
      'waste_haul',
      'waste haul wet tonnes',
      'sum of waste_haul_wet_tonnes',
      'waste_wet_tonnes',
      'wastetruckstonnes',
      'sent to ministersnorth_waste:rom_wmt (mwmt)',
      'sent to ministersnorth_waste:wmt (mwmt)',
      'ministersnorth_waste',
      'to_nops_waste_mass_mt',
      'sent_to_nops_waste',
      'to_nops_waste',
      'waste_mass',
      'waste_total',
      'waste_wmt'
    ],
    color: '#64748b'
  },
  {
    key: 'total_expit_haul_wet_tonnes',
    canonicalName: 'Sum of Total_ExPit_Haul_Wet_Tonnes',
    shortName: 'Total ExPit Haul',
    aliases: [
      'total_expit_haul_wet_tonnes',
      'total_expit_haul',
      'total expit haul wet tonnes',
      'sum of total_expit_haul_wet_tonnes',
      'total_expit_tonnes',
      'expit_haul_wet_tonnes',
      'sent to ministersnorth_expit:rom_wmt (mwmt)',
      'sent to ministersnorth_expit:wmt (mwmt)',
      'ministersnorth_expit',
      'total_expit_mass',
      'total_period_mass_mt',
      'total_mass'
    ],
    color: '#0284c7'
  },
  {
    key: 'expit_ore_wet_tonnes',
    canonicalName: 'Sum of ExPit_Ore_Wet_Tonnes',
    shortName: 'ExPit Ore',
    aliases: [
      'expit_ore_wet_tonnes',
      'expit_ore',
      'expit ore wet tonnes',
      'sum of expit_ore_wet_tonnes',
      'expit_ore_tonnes',
      'ore_expit_wet_tonnes',
      'to_nops_expit_mass_mt',
      'sent_to_nops_expit',
      'to_nops_expit',
      'expit_ore_mass',
      'expit_wmt'
    ],
    color: '#10b981'
  },
  {
    key: 'from_stockpile_wet_tonnes',
    canonicalName: 'Sum of From_Stockpile_Wet_Tonnes',
    shortName: 'From Stockpile',
    aliases: [
      'from_stockpile_wet_tonnes',
      'from_stockpile',
      'from stockpile wet tonnes',
      'sum of from_stockpile_wet_tonnes',
      'from_sp_wet_tonnes',
      'stockpile_reclaim_tonnes',
      'sent to total_from_sp:rom_wmt (mwmt)',
      'sent_to_total_from_sp_rom_wmt',
      'total_from_sp',
      'from_sp'
    ],
    color: '#8b5cf6'
  },
  {
    key: 'conveyor_from_min_cmn',
    canonicalName: 'Sum of Conveyor from MIN_CMN',
    shortName: 'Conveyor MIN_CMN',
    aliases: [
      'conveyor_from_min_cmn',
      'conveyor from min_cmn',
      'conveyor_min_cmn',
      'sum of conveyor from min_cmn',
      'conveyor_mincmn',
      'cmn_conveyor_tonnes',
      'sent to ministersnorth_crusher:rom_wmt (mwmt)',
      'conveyor',
      'to_conveyor',
      'to_conveyor_from_nop_cr'
    ],
    color: '#0d9488'
  },
  {
    key: 'to_stockpile_wet_tonnes',
    canonicalName: 'Sum of To_Stockpile_Wet_Tonnes',
    shortName: 'To Stockpile',
    aliases: [
      'to_stockpile_wet_tonnes',
      'to_stockpile',
      'to stockpile wet tonnes',
      'sum of to_stockpile_wet_tonnes',
      'to_sp_wet_tonnes',
      'stockpile_build_tonnes',
      'sent to total_to_sp:rom_wmt (mwmt)',
      'sent_to_total_to_sp_rom_wmt',
      'total_to_sp',
      'to_sp'
    ],
    color: '#ec4899'
  }
];

const COMMON_KEY_PATTERNS = [
  'row_labels',
  'row labels',
  'period_name',
  'period',
  'timestep',
  'time',
  'year',
  'month',
  'quarter',
  'bench',
  'pit',
  'flitch',
  'case_id',
  'case',
  'meta_id',
  'project',
  'material',
  'source',
  'dest',
  'rocktype',
  'blast'
];

/**
 * Normalize a column header for matching
 */
function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Scan headers to detect which target metrics and candidate keys are present
 */
export function detectColumns(headers: string[]): { detectedMetrics: Record<string, string>; detectedKeys: string[] } {
  const detectedMetrics: Record<string, string> = {};
  const detectedKeys: string[] = [];

  for (const target of TARGET_METRICS) {
    for (const h of headers) {
      const norm = normalizeHeader(h);
      for (const alias of target.aliases) {
        const normAlias = normalizeHeader(alias);
        if (norm === normAlias || norm.includes(normAlias) || normAlias.includes(norm)) {
          detectedMetrics[target.key] = h;
          break;
        }
      }
      if (detectedMetrics[target.key]) break;
    }
  }

  for (const h of headers) {
    const norm = normalizeHeader(h);
    for (const pattern of COMMON_KEY_PATTERNS) {
      const normPattern = normalizeHeader(pattern);
      if (norm === normPattern || norm.startsWith(normPattern) || norm.endsWith(normPattern)) {
        if (!detectedKeys.includes(h)) {
          detectedKeys.push(h);
        }
        break;
      }
    }
  }

  return { detectedMetrics, detectedKeys };
}

/**
 * Parse any file (CSV, TSV, TXT, XLSX, XLS, JSON) into standard ParsedDataset
 */
export async function parseFile(file: File): Promise<ParsedDataset> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsb') {
    const buffer = await file.arrayBuffer();
    
    // Fast sheet names discovery without parsing whole workbook
    const wbMeta = XLSX.read(buffer, { type: 'array', bookSheets: true });
    const sheetNames = wbMeta.SheetNames || ['Sheet1'];

    // Identify target sheet (prefer Sheet2 or Pivot)
    const targetSheet =
      sheetNames.find((s) => s.toLowerCase() === 'sheet2' || s.toLowerCase().includes('pivot')) ||
      sheetNames[0];

    // Read only the target sheet
    const workbook = XLSX.read(buffer, { type: 'array', sheets: [targetSheet] });
    const sheet = workbook.Sheets[targetSheet];
    const grid = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null });

    let bestScore = -1;
    let bestHeaders: string[] = [];
    let bestRows: Record<string, any>[] = [];

    for (let r = 0; r < Math.min(15, grid.length); r++) {
      const row = grid[r];
      if (!Array.isArray(row)) continue;

      const stringCells = row.filter((c) => typeof c === 'string' && c.trim().length > 0);
      if (stringCells.length < 2) continue;

      let score = stringCells.length;
      const rowStr = row.map((c) => String(c || '').toLowerCase()).join(' ');

      if (rowStr.includes('row labels') || rowStr.includes('period') || rowStr.includes('year')) score += 10;
      if (rowStr.includes('crusher')) score += 10;
      if (rowStr.includes('waste')) score += 10;
      if (rowStr.includes('expit')) score += 10;
      if (rowStr.includes('stockpile')) score += 10;
      if (rowStr.includes('conveyor')) score += 10;
      if (rowStr.includes('sum of')) score += 15;

      if (score > bestScore) {
        bestScore = score;

        // Extract headers
        const headers = row.map((c, i) =>
          c !== null && c !== undefined && String(c).trim() ? String(c).trim() : `col_${i + 1}`
        );

        // Extract data rows
        const rows: Record<string, any>[] = [];
        for (let dr = r + 1; dr < grid.length; dr++) {
          const dRow = grid[dr];
          if (!Array.isArray(dRow)) continue;
          if (dRow.every((v) => v === null || v === undefined || v === '')) continue;

          const firstVal = String(dRow[0] || '').toLowerCase().trim();
          if (firstVal.includes('grand total') || firstVal === 'total') continue;

          const rowObj: Record<string, any> = {};
          headers.forEach((h, idx) => {
            rowObj[h] = dRow[idx] !== undefined ? dRow[idx] : null;
          });
          rows.push(rowObj);
        }

        bestHeaders = headers;
        bestRows = rows;
      }
    }

    const { detectedMetrics, detectedKeys } = detectColumns(bestHeaders);

    return {
      fileName: `${file.name} [${targetSheet}]`,
      fileSize: file.size,
      headers: bestHeaders,
      rows: bestRows,
      detectedMetrics,
      detectedKeys,
    };
  }

  if (ext === 'json') {
    const text = await file.text();
    const data = JSON.parse(text);
    const rows = Array.isArray(data) ? data : [data];
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const { detectedMetrics, detectedKeys } = detectColumns(headers);

    return {
      fileName: file.name,
      fileSize: file.size,
      headers,
      rows,
      detectedMetrics,
      detectedKeys,
    };
  }

  // Default to text / CSV / TSV / TXT parsing
  const text = await file.text();
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, any>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        const rows = results.data;
        const { detectedMetrics, detectedKeys } = detectColumns(headers);
        resolve({
          fileName: file.name,
          fileSize: file.size,
          headers,
          rows,
          detectedMetrics,
          detectedKeys,
        });
      },
      error: (err: any) => {
        reject(err);
      }
    });
  });
}

/**
 * Dynamically classify dataset role as 'smt' or 'blazor' based on content & nomenclature
 */
export function detectDatasetRole(
  file: File,
  headers: string[],
  _rows?: Record<string, any>[]
): 'smt' | 'blazor' {
  const fileNameLow = file.name.toLowerCase();
  const headersLow = headers.map((h) => h.toLowerCase()).join(' ');

  let smtScore = 0;
  let blazorScore = 0;

  // Filename heuristics
  if (/transposed|smt|schedule|direct/i.test(fileNameLow)) smtScore += 10;
  if (/blasor|blazor|pivot|report_panels|composite/i.test(fileNameLow)) blazorScore += 10;

  // Header nomenclature heuristics
  if (headersLow.includes('case_id') || headersLow.includes('case')) smtScore += 15;
  if (headersLow.includes('period name')) smtScore += 15;
  if (headersLow.includes('ministersnorth')) smtScore += 20;
  if (headersLow.includes('mwmt')) smtScore += 15;
  if (headersLow.includes('total_from_sp') || headersLow.includes('total_to_sp')) smtScore += 15;

  if (headersLow.includes('row labels') || headersLow.includes('row_labels')) blazorScore += 15;
  if (headersLow.includes('sum of')) blazorScore += 20;
  if (headersLow.includes('crusher_haul_wet_tonnes')) blazorScore += 15;
  if (headersLow.includes('waste_haul_wet_tonnes')) blazorScore += 15;
  if (headersLow.includes('total_expit_haul_wet_tonnes')) blazorScore += 15;
  if (headersLow.includes('conveyor from min_cmn')) blazorScore += 15;

  if (smtScore > blazorScore) return 'smt';
  if (blazorScore > smtScore) return 'blazor';

  // File extension heuristics fallback
  if (fileNameLow.endsWith('.csv') || fileNameLow.endsWith('.tsv')) return 'smt';
  return 'blazor';
}
