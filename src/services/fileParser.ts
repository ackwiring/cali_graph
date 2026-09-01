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

export const TARGET_METRICS = [
  {
    key: 'crusher_haul_wet_tonnes',
    canonicalName: 'Sum of Crusher_Haul_Wet_Tonnes',
    shortName: 'Crusher Haul',
    aliases: ['crusher_haul_wet_tonnes', 'crusher_haul', 'crusher haul wet tonnes', 'sum of crusher_haul_wet_tonnes', 'crusher_wet_tonnes', 'crushertruckstonnes'],
    color: '#f97316'
  },
  {
    key: 'waste_haul_wet_tonnes',
    canonicalName: 'Sum of Waste_Haul_Wet_Tonnes',
    shortName: 'Waste Haul',
    aliases: ['waste_haul_wet_tonnes', 'waste_haul', 'waste haul wet tonnes', 'sum of waste_haul_wet_tonnes', 'waste_wet_tonnes', 'wastetruckstonnes'],
    color: '#64748b'
  },
  {
    key: 'total_expit_haul_wet_tonnes',
    canonicalName: 'Sum of Total_ExPit_Haul_Wet_Tonnes',
    shortName: 'Total ExPit Haul',
    aliases: ['total_expit_haul_wet_tonnes', 'total_expit_haul', 'total expit haul wet tonnes', 'sum of total_expit_haul_wet_tonnes', 'total_expit_tonnes', 'expit_haul_wet_tonnes'],
    color: '#0284c7'
  },
  {
    key: 'expit_ore_wet_tonnes',
    canonicalName: 'Sum of ExPit_Ore_Wet_Tonnes',
    shortName: 'ExPit Ore',
    aliases: ['expit_ore_wet_tonnes', 'expit_ore', 'expit ore wet tonnes', 'sum of expit_ore_wet_tonnes', 'expit_ore_tonnes', 'ore_expit_wet_tonnes'],
    color: '#10b981'
  },
  {
    key: 'from_stockpile_wet_tonnes',
    canonicalName: 'Sum of From_Stockpile_Wet_Tonnes',
    shortName: 'From Stockpile',
    aliases: ['from_stockpile_wet_tonnes', 'from_stockpile', 'from stockpile wet tonnes', 'sum of from_stockpile_wet_tonnes', 'from_sp_wet_tonnes', 'stockpile_reclaim_tonnes'],
    color: '#8b5cf6'
  },
  {
    key: 'conveyor_from_min_cmn',
    canonicalName: 'Sum of Conveyor from MIN_CMN',
    shortName: 'Conveyor MIN_CMN',
    aliases: ['conveyor_from_min_cmn', 'conveyor from min_cmn', 'conveyor_min_cmn', 'sum of conveyor from min_cmn', 'conveyor_mincmn', 'cmn_conveyor_tonnes', 'conveyor'],
    color: '#0d9488'
  },
  {
    key: 'to_stockpile_wet_tonnes',
    canonicalName: 'Sum of To_Stockpile_Wet_Tonnes',
    shortName: 'To Stockpile',
    aliases: ['to_stockpile_wet_tonnes', 'to_stockpile', 'to stockpile wet tonnes', 'sum of to_stockpile_wet_tonnes', 'to_sp_wet_tonnes', 'stockpile_build_tonnes'],
    color: '#ec4899'
  }
];

const COMMON_KEY_PATTERNS = [
  'period', 'timestep', 'time', 'year', 'month', 'quarter', 'bench', 'pit', 'flitch', 
  'case_id', 'case', 'meta_id', 'project', 'material', 'source', 'dest', 'rocktype', 'blast'
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
      if (norm === pattern || norm.startsWith(pattern) || norm.endsWith(pattern)) {
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
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });

    const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    const { detectedMetrics, detectedKeys } = detectColumns(headers);

    return {
      fileName: file.name,
      fileSize: file.size,
      headers,
      rows: jsonData,
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
