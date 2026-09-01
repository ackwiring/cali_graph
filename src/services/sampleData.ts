import { ParsedDataset, detectColumns } from './fileParser';

/**
 * Generate realistic SMT and Blazor Composite datasets for immediate demonstration
 */
export function generateSampleDatasets(): { smtDataset: ParsedDataset; blazorDataset: ParsedDataset } {
  const periods = Array.from({ length: 24 }, (_, i) => i + 1);
  const pits = ['Pit_North', 'Pit_South', 'Pit_Central'];
  const cases = ['Base_Case_2026', 'Opt_Schedule_V3'];

  const smtRows: Record<string, any>[] = [];
  const blazorRows: Record<string, any>[] = [];

  for (const caseId of cases) {
    for (const pit of pits) {
      for (const p of periods) {
        const baseOre = Math.round(180000 + Math.sin(p / 3) * 35000 + (p * 2200) + (pit === 'Pit_North' ? 25000 : 0));
        const baseWaste = Math.round(320000 + Math.cos(p / 2.5) * 45000 + (p * 3100) + (pit === 'Pit_South' ? 40000 : 0));
        const baseTotalExpit = baseOre + baseWaste;
        const baseCrusher = Math.round(baseOre * 0.88 + Math.random() * 5000);
        const baseFromSp = Math.round(25000 + Math.sin(p / 2) * 12000 + 5000);
        const baseConveyorMinCmn = Math.round(baseCrusher * 0.94 + Math.random() * 4000);
        const baseToSp = Math.round(baseOre * 0.12 + Math.random() * 3000);

        // SMT values
        smtRows.push({
          Period: p,
          Case_ID: caseId,
          Pit: pit,
          Bench: 1200 - (p * 5) + (pit === 'Pit_North' ? 50 : 0),
          Sum_of_Crusher_Haul_Wet_Tonnes: baseCrusher,
          Sum_of_Waste_Haul_Wet_Tonnes: baseWaste,
          Sum_of_Total_ExPit_Haul_Wet_Tonnes: baseTotalExpit,
          Sum_of_ExPit_Ore_Wet_Tonnes: baseOre,
          Sum_of_From_Stockpile_Wet_Tonnes: baseFromSp,
          Sum_of_Conveyor_from_MIN_CMN: baseConveyorMinCmn,
          Sum_of_To_Stockpile_Wet_Tonnes: baseToSp,
          Notes: `SMT Run Meta_${caseId}_P${p}`
        });

        // Blazor values (with slight calibration variance 0.5% - 4% to simulate realistic calibration delta)
        const blazorVariance = 1 + ((Math.sin(p * 1.7) * 0.035) + ((p % 5 === 0) ? -0.045 : 0.015));
        
        blazorRows.push({
          Period: p,
          Case_ID: caseId,
          Pit: pit,
          Bench: 1200 - (p * 5) + (pit === 'Pit_North' ? 50 : 0),
          Sum_of_Crusher_Haul_Wet_Tonnes: Math.round(baseCrusher * blazorVariance),
          Sum_of_Waste_Haul_Wet_Tonnes: Math.round(baseWaste * (blazorVariance * 0.99)),
          Sum_of_Total_ExPit_Haul_Wet_Tonnes: Math.round(baseTotalExpit * blazorVariance),
          Sum_of_ExPit_Ore_Wet_Tonnes: Math.round(baseOre * blazorVariance),
          Sum_of_From_Stockpile_Wet_Tonnes: Math.round(baseFromSp * (1 + (Math.cos(p) * 0.05))),
          Sum_of_Conveyor_from_MIN_CMN: Math.round(baseConveyorMinCmn * (blazorVariance * 1.01)),
          Sum_of_To_Stockpile_Wet_Tonnes: Math.round(baseToSp * (1 - (Math.sin(p) * 0.04))),
          Composite_Source: `Blazor_Opt_${caseId}`
        });
      }
    }
  }

  const smtHeaders = Object.keys(smtRows[0]);
  const blazorHeaders = Object.keys(blazorRows[0]);

  const smtCols = detectColumns(smtHeaders);
  const blazorCols = detectColumns(blazorHeaders);

  return {
    smtDataset: {
      fileName: 'SMT_Output_Calibration_Export.csv',
      fileSize: 48200,
      headers: smtHeaders,
      rows: smtRows,
      detectedMetrics: smtCols.detectedMetrics,
      detectedKeys: smtCols.detectedKeys,
    },
    blazorDataset: {
      fileName: 'Blazor_Composite_Schedule.xlsx',
      fileSize: 52400,
      headers: blazorHeaders,
      rows: blazorRows,
      detectedMetrics: blazorCols.detectedMetrics,
      detectedKeys: blazorCols.detectedKeys,
    }
  };
}
