/**
 * Shared metric-value extraction used to read SMT / Blazor totals out of a
 * joined SQL result row. This was previously duplicated verbatim in
 * CalibrationGraphs.tsx and DiffViewer.tsx — kept here as the single source
 * of truth so the two views can't silently drift out of sync.
 */

const SHORT_ALIASES: Record<string, string[]> = {
  crusher_haul_wet_tonnes: ['crusher_haul_wet_tonnes', 'crusher_haul', 'crusher', 'crusher_haul_wt'],
  waste_haul_wet_tonnes: ['waste_haul_wet_tonnes', 'waste_haul', 'waste', 'waste_haul_wt'],
  total_expit_haul_wet_tonnes: ['total_expit_haul_wet_tonnes', 'total_expit_haul', 'total_expit', 'expit_haul', 'expit', 'total_expit_haul_wt'],
  expit_ore_wet_tonnes: ['expit_ore_wet_tonnes', 'expit_ore', 'ore_expit', 'expit_ore_wt'],
  from_stockpile_wet_tonnes: ['from_stockpile_wet_tonnes', 'from_stockpile', 'from_sp', 'from_stockpile_wt'],
  conveyor_from_min_cmn: ['conveyor_from_min_cmn', 'conveyor_min_cmn', 'conveyor', 'conveyor_from_min_cmn_wt'],
  to_stockpile_wet_tonnes: ['to_stockpile_wet_tonnes', 'to_stockpile', 'to_sp', 'to_stockpile_wt'],
};

/**
 * Extract a single metric's numeric value for a given side ('smt' | 'blazor')
 * from a joined result row, tolerating the various column-naming variants
 * that different join paths (auto-generated SQL vs. hand-written SQL Console
 * queries) may produce.
 */
export function extractMetricValue(
  row: Record<string, any>,
  prefix: 'smt' | 'blazor',
  metricKey: string
): number {
  const prefixes = prefix === 'smt' ? ['smt_', 'smt'] : ['blazor_', 'blz_', 'blazor', 'blz'];
  const aliases = SHORT_ALIASES[metricKey] || [metricKey];

  for (const p of prefixes) {
    for (const a of aliases) {
      const fullKey = `${p}${a}`;
      if (row[fullKey] !== undefined && row[fullKey] !== null) {
        return Number(row[fullKey]) || 0;
      }
    }
  }

  // Case-insensitive check across row keys
  for (const k of Object.keys(row)) {
    const kLow = k.toLowerCase();
    for (const p of prefixes) {
      if (kLow.startsWith(p)) {
        for (const a of aliases) {
          if (kLow.includes(a)) {
            return Number(row[k]) || 0;
          }
        }
      }
    }
  }

  return 0;
}
