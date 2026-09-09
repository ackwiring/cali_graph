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

/**
 * Real, distinct CASE_ID values actually present in a parsed SMT dataset — the single
 * source of truth for "what cases exist in this file", used both by JoinBuilder's case
 * selector and by the auto-join that fires right after upload. A SMT export can contain
 * dozens of unrelated case scenarios (a full case series run); '270'/'269' are only a
 * last-resort fallback for a dataset with no recognizable CASE_ID column at all, never a
 * claim that either of those specific cases exists or is relevant.
 */
export function detectAvailableCaseIds(dataset: ParsedDataset | null): string[] {
  if (!dataset) return ['270', '269'];
  const caseCol = dataset.headers.find((h) => /^case(_id)?$/i.test(h));
  if (!caseCol) return ['270', '269'];
  const cases = Array.from(new Set(dataset.rows.map((r) => String(r[caseCol] || '').trim()).filter(Boolean)));
  return cases.length > 0 ? cases : ['270', '269'];
}

export interface TargetMetricConfig {
  key: string;
  canonicalName: string;
  shortName: string;
  aliases: string[];
  /**
   * The "<Stream>" token in a "Sent to <Site>_<Stream>:rom_wmt (Mwmt)" / ":wmt (Mwmt)"
   * header (e.g. "crusher", "waste", "expit"), normalized (lowercase, matches
   * normalizeHeader()'s output). A REAL multi-pit SMT export can carry this same shape for
   * SEVERAL different sites at once (MinistersNorth, CPH, Jinidi, NOPS, ...) — so matching
   * is NOT done against a fixed site name here. buildSentToPattern() below turns this into
   * an actual RegExp, optionally scoped to one specific site via detectColumns()'s
   * `siteFilter` option; without a siteFilter it matches ANY site (whichever appears first
   * in column order) — correct for a genuinely single-site file, but ambiguous for a
   * multi-site one, which is why detectAvailableSentToSites() + a site selector exist.
   */
  sentToStream?: string;
  /**
   * Overrides which site sentToStream's pattern is scoped to, IGNORING the caller's
   * siteFilter entirely. Two real shapes need this:
   *  - 'any': the SMT export tracks this stream as a single site-INDEPENDENT figure (e.g.
   *    "Sent to Total_from_SP:rom_wmt (Mwmt)" — one stockpile total shared across every
   *    site, not a per-site column at all). Without this override, selecting a specific
   *    site (e.g. "Jinidi") would make the pattern require "Sent to Jinidi_from_SP...",
   *    which doesn't exist, and detection would fall through to a much looser alias that
   *    can match an unrelated per-stockpile column (e.g. "Mined from SP01") instead.
   *  - a literal site name: this metric's SMT mapping is a verified business rule for ONE
   *    specific site only, with no confirmed equivalent for any other (e.g. "Conveyor from
   *    MIN_CMN" reads MinistersNorth's crusher figure by definition — a MinistersNorth-only
   *    correspondence carried over from the original single-site decoder, not something
   *    that generalizes to Jinidi's differently-named conveyor system). Omitted (the
   *    default) respects whatever siteFilter the caller passes to detectColumns().
   */
  fixedSite?: 'any' | string;
  color: string;
}

/** Builds a "Sent to <site>_<stream>(:_)?(rom_)?wmt (Mwmt)" matcher against normalized headers. */
function buildSentToPattern(streamKeyword: string, site?: string): RegExp {
  // normalizeHeader() only ever produces [a-z0-9_], so a site captured from real header
  // text is always safe to splice directly into a RegExp source with no escaping needed.
  const siteToken = site ? normalizeHeader(site) : '[a-z0-9_]+?';
  return new RegExp(`^sent_to_${siteToken}_${streamKeyword}(_rom)?_wmt_mwmt$`);
}

/**
 * Real, distinct site names found in "Sent to <Site>_Crusher|Waste|ExPit..." headers —
 * the single source of truth for "which sites does this SMT file route material to",
 * used by JoinBuilder's site selector. Preserves the site's original casing as it appears
 * in the file (e.g. "Jinidi", "CPH") for display and for feeding back into
 * detectColumns()'s siteFilter.
 */
export function detectAvailableSentToSites(headers: string[]): string[] {
  const sites = new Set<string>();
  const re = /^Sent to ([A-Za-z0-9]+)_(Crusher|Waste|ExPit)\b/i;
  for (const h of headers) {
    const m = h.match(re);
    if (m) sites.add(m[1]);
  }
  return Array.from(sites).sort();
}

export const TARGET_METRICS: TargetMetricConfig[] = [
  {
    key: 'crusher_haul_wet_tonnes',
    canonicalName: 'Sum of Crusher_Haul_Wet_Tonnes',
    shortName: 'Crusher Haul',
    sentToStream: 'crusher',
    aliases: [
      'crusher_haul_wet_tonnes',
      'crusher_haul',
      'crusher haul wet tonnes',
      'sum of crusher_haul_wet_tonnes',
      'crusher_wet_tonnes',
      'crushertruckstonnes',
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
    sentToStream: 'waste',
    aliases: [
      'waste_haul_wet_tonnes',
      'waste_haul',
      'waste haul wet tonnes',
      'sum of waste_haul_wet_tonnes',
      'waste_wet_tonnes',
      'wastetruckstonnes',
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
    sentToStream: 'expit',
    aliases: [
      'total_expit_haul_wet_tonnes',
      'total_expit_haul',
      'total expit haul wet tonnes',
      'sum of total_expit_haul_wet_tonnes',
      'total_expit_tonnes',
      'expit_haul_wet_tonnes',
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
    sentToStream: 'from_sp',
    // Real exports track stockpile movement as ONE site-independent "Total_from_SP" figure,
    // not per-site — so this must ALWAYS match any site regardless of the selected
    // destination site, or a site selection makes the pattern require a "Sent to
    // <Site>_from_SP..." column that doesn't exist, falling through to a much looser alias
    // that can grab an unrelated per-stockpile column instead (e.g. "Mined from SP01").
    fixedSite: 'any',
    aliases: [
      'from_stockpile_wet_tonnes',
      'from_stockpile',
      'from stockpile wet tonnes',
      'sum of from_stockpile_wet_tonnes',
      'from_sp_wet_tonnes',
      'stockpile_reclaim_tonnes',
      'from_sp'
    ],
    color: '#8b5cf6'
  },
  {
    key: 'conveyor_from_min_cmn',
    canonicalName: 'Sum of Conveyor from MIN_CMN',
    shortName: 'Conveyor MIN_CMN',
    // Intentionally the SAME pattern as crusher_haul_wet_tonnes: on the SMT side there is
    // only one "Sent to <Site>_Crusher..." figure, and it feeds both the Crusher Haul and
    // the Conveyor MIN_CMN comparison (see db.ts generateBhpDecoderSql, "Mapped to
    // <site>_Crusher per decoder"). This is deliberate business logic — but it is a VERIFIED
    // mapping for MinistersNorth specifically, not a rule that generalizes to every site.
    // Jinidi's real conveyor system uses an entirely different naming shape ("Sent to
    // Conveyor from JND_CR2/CR3/CRa/CRe..." — four separate lines, not one column), and its
    // Blazor reports don't even carry a "Sum of Conveyor from MIN_CMN" column to compare
    // against. Pinning this to MinistersNorth regardless of the selected destination site
    // means it stays correct for MinistersNorth and honestly reports "not detected" (falls
    // through to '0', not a fabricated non-zero figure) for every other site, until a real
    // per-site conveyor mapping is confirmed and added.
    sentToStream: 'crusher',
    fixedSite: 'MinistersNorth',
    aliases: [
      'conveyor_from_min_cmn',
      'conveyor from min_cmn',
      'conveyor_min_cmn',
      'sum of conveyor from min_cmn',
      'conveyor_mincmn',
      'cmn_conveyor_tonnes',
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
    sentToStream: 'to_sp',
    // Same reasoning as from_stockpile_wet_tonnes above: "Total_to_SP" is a single
    // site-independent figure, not per-site.
    fixedSite: 'any',
    aliases: [
      'to_stockpile_wet_tonnes',
      'to_stockpile',
      'to stockpile wet tonnes',
      'sum of to_stockpile_wet_tonnes',
      'to_sp_wet_tonnes',
      'stockpile_build_tonnes',
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
 * Scan headers to detect which target metrics and candidate keys are present.
 *
 * `siteFilter`, when given, scopes every "Sent to <Site>_<Stream>..." pattern to that one
 * site (e.g. "Jinidi") — required for a REAL multi-pit SMT export, which routes material to
 * several different sites' crushers/waste/ExPit in the same file under the identical naming
 * shape. Without it, the pattern matches whichever site happens to appear first in column
 * order, which is correct for a single-site file but silently picks the WRONG site's figures
 * for a multi-site one. See detectAvailableSentToSites() for enumerating the real choices.
 */
export function detectColumns(
  headers: string[],
  options?: { siteFilter?: string }
): { detectedMetrics: Record<string, string>; detectedKeys: string[] } {
  const detectedMetrics: Record<string, string> = {};
  const detectedKeys: string[] = [];

  // Pass 1: precise regex patterns win over loose aliases REGARDLESS of column order.
  // Real exports can carry more than one unit variant of the same stream — e.g.
  // "Sent to Jinidi_Crusher:Mass (Mt)" alongside "...:rom_wmt (Mwmt)" — and a generic
  // alias like "crusher_mass" substring-matches the wrong (non-wet-tonnes) one. Checking
  // patterns across ALL headers first, before any alias is considered, means the correct
  // ":rom_wmt"/":wmt (Mwmt)" column always wins even if the wrong-unit column appears
  // earlier in the file.
  for (const target of TARGET_METRICS) {
    if (!target.sentToStream) continue;
    const site = target.fixedSite === undefined ? options?.siteFilter : target.fixedSite === 'any' ? undefined : target.fixedSite;
    const pattern = buildSentToPattern(target.sentToStream, site);
    for (const h of headers) {
      const norm = normalizeHeader(h);
      if (pattern.test(norm)) {
        detectedMetrics[target.key] = h;
        break;
      }
    }
  }

  // Pass 2: alias substring matching, only for targets a pattern didn't already resolve.
  for (const target of TARGET_METRICS) {
    if (detectedMetrics[target.key]) continue;
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
