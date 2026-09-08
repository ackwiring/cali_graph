import { describe, it, expect } from 'vitest';
import { detectDatasetRole, detectColumns } from './fileParser';

/**
 * Minimal coverage for detectDatasetRole — this drives which PostgreSQL
 * table (smt_data vs blazor_data) an uploaded file lands in with zero user
 * confirmation, so a silent misclassification silently corrupts every
 * downstream join and graph. detectDatasetRole only reads `file.name`, so a
 * bare object cast stands in for a real File/Blob here.
 */

function fakeFile(name: string): File {
  return { name } as unknown as File;
}

describe('detectDatasetRole', () => {
  it('classifies a clear SMT export via filename + header signals', () => {
    const role = detectDatasetRole(
      fakeFile('SMT_Transposed_Export.csv'),
      ['CASE_ID', 'Period Name', 'Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)'],
    );
    expect(role).toBe('smt');
  });

  it('classifies a clear Blazor composite export via filename + header signals', () => {
    const role = detectDatasetRole(
      fakeFile('Blazor_Composite_Schedule.xlsx'),
      ['Row Labels', 'Sum of Crusher_Haul_Wet_Tonnes', 'Sum of Waste_Haul_Wet_Tonnes'],
    );
    expect(role).toBe('blazor');
  });

  it('lets header signals override a misleading filename', () => {
    // Filename alone (schedule) would suggest SMT, but the pivot-style
    // "Sum of ..." headers are strong Blazor evidence and should win.
    const role = detectDatasetRole(
      fakeFile('monthly_schedule_export.csv'),
      ['Row Labels', 'Sum of Crusher_Haul_Wet_Tonnes', 'Sum of Waste_Haul_Wet_Tonnes', 'Sum of Total_ExPit_Haul_Wet_Tonnes'],
    );
    expect(role).toBe('blazor');
  });

  it('falls back to file extension when there is no scoring signal at all', () => {
    expect(detectDatasetRole(fakeFile('data1.csv'), ['Period', 'Value'])).toBe('smt');
    expect(detectDatasetRole(fakeFile('data1.tsv'), ['Period', 'Value'])).toBe('smt');
  });

  it('defaults to blazor when there is no signal and the extension is not csv/tsv', () => {
    expect(detectDatasetRole(fakeFile('data1.json'), ['Period', 'Value'])).toBe('blazor');
  });
});

/**
 * Coverage for the site-agnostic "Sent to <Site>_<Stream>:rom_wmt (Mwmt)" pattern in
 * TARGET_METRICS (fileParser.ts). This is what lets the tool recognize a new site's SMT
 * export (e.g. Jinidi) alongside the original MinistersNorth one, without a code change
 * per site — a hardcoded per-site alias previously required.
 */
describe('detectColumns — multi-site "Sent to" nomenclature', () => {
  it('maps MinistersNorth-prefixed "Sent to" headers to their canonical metrics', () => {
    const { detectedMetrics } = detectColumns([
      'CASE_ID',
      'Period Name',
      'Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)',
      'Sent to MinistersNorth_Waste:rom_wmt (Mwmt)',
      'Sent to MinistersNorth_ExPit:wmt (Mwmt)',
      'Sent to Total_from_SP:rom_wmt (Mwmt)',
      'Sent to Total_to_SP:rom_wmt (Mwmt)',
    ]);

    expect(detectedMetrics.crusher_haul_wet_tonnes).toBe('Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)');
    expect(detectedMetrics.waste_haul_wet_tonnes).toBe('Sent to MinistersNorth_Waste:rom_wmt (Mwmt)');
    expect(detectedMetrics.total_expit_haul_wet_tonnes).toBe('Sent to MinistersNorth_ExPit:wmt (Mwmt)');
    expect(detectedMetrics.from_stockpile_wet_tonnes).toBe('Sent to Total_from_SP:rom_wmt (Mwmt)');
    expect(detectedMetrics.to_stockpile_wet_tonnes).toBe('Sent to Total_to_SP:rom_wmt (Mwmt)');
    // Conveyor MIN_CMN intentionally reuses the same "Sent to ..._Crusher..." SMT column
    // as Crusher Haul — see the comment on conveyor_from_min_cmn in fileParser.ts.
    expect(detectedMetrics.conveyor_from_min_cmn).toBe('Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)');
  });

  it('recognizes a different site name (Jinidi) in the same "Sent to" shape with no code change', () => {
    const { detectedMetrics } = detectColumns([
      'CASE_ID',
      'Period Name',
      'Sent to Jinidi_Crusher:rom_wmt (Mwmt)',
      'Sent to Jinidi_Waste:rom_wmt (Mwmt)',
    ]);

    expect(detectedMetrics.crusher_haul_wet_tonnes).toBe('Sent to Jinidi_Crusher:rom_wmt (Mwmt)');
    expect(detectedMetrics.waste_haul_wet_tonnes).toBe('Sent to Jinidi_Waste:rom_wmt (Mwmt)');
    expect(detectedMetrics.conveyor_from_min_cmn).toBe('Sent to Jinidi_Crusher:rom_wmt (Mwmt)');
  });

  it('matches the ":wmt (Mwmt)" variant (no "rom_") as well as ":rom_wmt (Mwmt)"', () => {
    const { detectedMetrics } = detectColumns(['Sent to Jinidi_Crusher:wmt (Mwmt)']);
    expect(detectedMetrics.crusher_haul_wet_tonnes).toBe('Sent to Jinidi_Crusher:wmt (Mwmt)');
  });
});
