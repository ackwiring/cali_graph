import { describe, it, expect } from 'vitest';
import { generateCalibrationSql, isBhpMinistersNorthDataset, JoinConfig } from './db';
import { ParsedDataset } from './fileParser';

/**
 * Minimal coverage for generateCalibrationSql — the function whose silent
 * failure modes (wrong branch selected, wrong join type/case interpolated)
 * are exactly what App.tsx's join-notice banner now exists to catch. These
 * tests pin down the two branches so a future edit can't silently break one
 * of them without a red test.
 */

function makeDataset(overrides: Partial<ParsedDataset>): ParsedDataset {
  return {
    fileName: 'test.csv',
    fileSize: 100,
    headers: [],
    rows: [],
    detectedMetrics: {},
    detectedKeys: [],
    ...overrides,
  };
}

const baseConfig: JoinConfig = {
  joinType: 'INNER',
  keys: ['period'],
  groupBy: 'period',
  caseId: '270',
};

describe('generateCalibrationSql', () => {
  it('returns a placeholder comment when either dataset is missing', () => {
    expect(generateCalibrationSql(null, null, baseConfig)).toMatch(/^--/);
    expect(
      generateCalibrationSql(makeDataset({ headers: ['period'] }), null, baseConfig)
    ).toMatch(/^--/);
  });

  it('selects the hardcoded BHP Ministers North decoder when headers match', () => {
    const smt = makeDataset({
      headers: ['CASE_ID', 'Period Name', 'Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)'],
    });
    const blazor = makeDataset({
      headers: ['Row Labels', 'Sum of Crusher_Haul_Wet_Tonnes'],
    });

    expect(isBhpMinistersNorthDataset(smt, blazor)).toBe(true);

    const sql = generateCalibrationSql(smt, blazor, { ...baseConfig, joinType: 'LEFT', caseId: '269' });

    // Uses the requested join type and case filter, not hardcoded defaults
    expect(sql).toContain('LEFT JOIN smt_data s');
    expect(sql).toContain("s.raw_data->>'CASE_ID' = '269'");
    // Recognizable BHP-specific decoder columns
    expect(sql).toContain('smt_crusher_haul_wet_tonnes');
    expect(sql).toContain('blazor_crusher_haul_wet_tonnes');
  });

  it('defaults to case 270 when no caseId is provided for the BHP decoder', () => {
    const smt = makeDataset({ headers: ['CASE_ID', 'Period Name'] });
    const blazor = makeDataset({ headers: ['Row Labels', 'Sum of Crusher_Haul_Wet_Tonnes'] });

    const sql = generateCalibrationSql(smt, blazor, { ...baseConfig, caseId: undefined });

    expect(sql).toContain("s.raw_data->>'CASE_ID' = '270'");
  });

  it('falls back to a generic GROUP BY join for non-BHP datasets', () => {
    const smt = makeDataset({
      headers: ['period', 'crusher_col'],
      detectedMetrics: { crusher_haul_wet_tonnes: 'crusher_col' },
    });
    const blazor = makeDataset({
      headers: ['period', 'crusher_col_b'],
      detectedMetrics: { crusher_haul_wet_tonnes: 'crusher_col_b' },
    });

    expect(isBhpMinistersNorthDataset(smt, blazor)).toBe(false);

    const sql = generateCalibrationSql(smt, blazor, baseConfig);

    expect(sql).toContain('FROM smt_data s');
    expect(sql).toContain('INNER JOIN blazor_data b');
    expect(sql).toContain('ON s."period" = b."period"');
    expect(sql).toContain('GROUP BY');
    // Only the detected metric should be summed; the other 6 target metrics
    // have no mapped column, so they degrade to literal 0 rather than
    // referencing a nonexistent column.
    expect(sql).toContain('AS "smt_crusher_haul_wet_tonnes"');
    expect(sql).toContain('0 AS "smt_waste_haul_wet_tonnes"');
  });

  it('sources the SMT column dynamically for a non-MinistersNorth site (Jinidi)', () => {
    const smt = makeDataset({
      headers: ['CASE_ID', 'Period Name', 'Sent to Jinidi_Crusher:rom_wmt (Mwmt)'],
      detectedMetrics: { crusher_haul_wet_tonnes: 'Sent to Jinidi_Crusher:rom_wmt (Mwmt)' },
    });
    const blazor = makeDataset({
      headers: ['Row Labels', 'Sum of Crusher_Haul_Wet_Tonnes'],
    });

    expect(isBhpMinistersNorthDataset(smt, blazor)).toBe(true);

    const sql = generateCalibrationSql(smt, blazor, baseConfig);

    // Reads the actually-detected Jinidi column, not the hardcoded MinistersNorth literal
    expect(sql).toContain("s.raw_data->>'Sent to Jinidi_Crusher:rom_wmt (Mwmt)'");
    expect(sql).toContain('smt_crusher_haul_wet_tonnes');
  });

  it('joins on multiple keys when more than one key is selected', () => {
    const smt = makeDataset({ headers: ['period', 'pit'] });
    const blazor = makeDataset({ headers: ['period', 'pit'] });

    const sql = generateCalibrationSql(smt, blazor, { ...baseConfig, keys: ['period', 'pit'] });

    expect(sql).toContain('ON s."period" = b."period" AND s."pit" = b."pit"');
  });
});
