# Calibration Grapher — Walkthrough & Documentation

A standalone, portable WebApp & Tauri desktop configuration for mine planning schedule calibration, comparing raw SMT tool outputs against Blazor composite models.

---

## Key Features Delivered

### 1. Dual Drag & Drop Ingestion Canvas
- Ingests **SMT Tool Output** and **Blazor Composite** files (CSV, TSV, TXT, Excel `.xlsx`/`.xls`, JSON).
- Automatically inspects file headers, maps canonical tonnage metric columns, identifies candidate join dimensions, and populates PostgreSQL tables.

### 2. Embedded PostgreSQL 16 WebAssembly Engine (`PGlite`)
- Executes authentic PostgreSQL queries in-browser without requiring an external database server daemon.
- Manages tables `smt_data` and `blazor_data` with dynamic schema detection and batch ingestion.
- Includes a dedicated interactive **PostgreSQL Query Console** with query templates and execution latency tracking.

### 3. Side-by-Side File Diff Inspector (`dfdiff`)
- Synchronized dual-pane data grid comparing SMT records against Blazor composite rows.
- Highlights exact matches, missing records, and value discrepancies with cell-level deltas and percentage difference badges.
- Configurable tolerance slider and search/filter bar.

### 4. Relational Join Builder
- Supports `INNER JOIN`, `LEFT JOIN` (SMT Baseline), `RIGHT JOIN` (Blazor Baseline), and `FULL OUTER JOIN`.
- Dynamic multi-key composite join matching (e.g. `period`, `case_id`, `pit`, `bench`).
- Live SQL preview and 1-click execution.

### 5. The 7 Required Calibration Metric Graphs
Interactive chart suite with **Grouped Bar**, **Trend Line**, **Variance Δ Bar**, and **45° Parity ($y = x$)** views:
1. `Sum of Crusher_Haul_Wet_Tonnes`
2. `Sum of Waste_Haul_Wet_Tonnes`
3. `Sum of Total_ExPit_Haul_Wet_Tonnes`
4. `Sum of ExPit_Ore_Wet_Tonnes`
5. `Sum of From_Stockpile_Wet_Tonnes`
6. `Sum of Conveyor from MIN_CMN`
7. `Sum of To_Stockpile_Wet_Tonnes`

### 6. Design System Conformance
- **Background**: Pure white (`#ffffff`)
- **Overlay Containers**: Grey (`#f1f5f9` / `#e2e8f0` / `#f8fafc`)
- **Borders**: Rounded Black (`2px solid #000000; border-radius: 8px / 12px`)
- **Titles**: Orange font (`#ea580c`)
- **Subtitles**: Teal font (`#0d9488`)
- **Tooltips**: Informative mouse-hover tooltips on every button, activity, table header, and control.

---

## Verification & Build Results

1. **TypeScript & Bundler Build**:
   ```bash
   npm run build
   ```
   Output: `dist/index.html` (Standalone single-file executable HTML bundle).
2. **Automated PGlite & Metric Calculations Test**:
   - `test_pglite_and_metrics.mjs` successfully executed dual table ingestion, dynamic relational join, and computed all 7 metric sums with 0 errors.

---

## How to Run
- **Web / Standalone**: Open `dist/index.html` directly in any web browser.
- **Local Dev Server**: `npm run dev` (running at `http://localhost:3000`).
- **Demo Data**: Click **"Load Sample Data"** in the top navigation bar to populate 24 periods of realistic mining calibration data.
