# Changelog — Calibration Grapher

## [1.1.0] - 2026-09-01
### Added
- **Tornado Graph Visualization Mode**: Bidirectional horizontal diverging butterfly chart (`indexAxis: 'y'`) centered at $X = 0$, mapping SMT Tool Output to the left and Blazor Composite to the right with absolute magnitude tick formatting and rich variance discrepancy tooltips.
- **Graph Visualization View Toggles**: Global toolbar and per-graph quick switchers between **Grouped Bar**, **Trend Line**, **Tornado Graph**, **Variance Δ**, and **45° Parity ($y = x$)**.
- **PNG Graph Export**: High-resolution image generation with custom title banner, period information, SMT/Blazor/Delta/R² KPI cards, and canvas graphics.
- **PDF Calibration Report Generation**: Client-side A4 landscape PDF export per graph with structured headers, key performance indicators, and crisp chart vector/raster rendering powered by `jsPDF`.
- **Consolidated 7-Metric PDF Report Export**: One-click "Export All PDF Report" button generating a multi-page PDF document spanning all 7 target calibration metrics.

## [1.0.0] - 2026-09-01
### Added
- **Drag & Drop Canvas Upload**: Dual file ingestion zones for SMT Output and Blazor Composite files (CSV, TSV, TXT, Excel, JSON).
- **Embedded PostgreSQL 16 WASM (PGlite)**: Complete in-browser database engine managing `smt_data` and `blazor_data` without requiring external database servers.
- **Side-by-Side Diff Inspector (dfdiff)**: Synchronized data grid with cell delta highlighting, tolerance threshold filtering, and match statistics.
- **Relational Join Builder**: Interactive join configuration (`INNER`, `LEFT`, `RIGHT`, `FULL OUTER`) with multi-key composite support and live SQL editor.
- **7 Calibration Metric Graph Suites**:
  1. `Sum of Crusher_Haul_Wet_Tonnes`
  2. `Sum of Waste_Haul_Wet_Tonnes`
  3. `Sum of Total_ExPit_Haul_Wet_Tonnes`
  4. `Sum of ExPit_Ore_Wet_Tonnes`
  5. `Sum of From_Stockpile_Wet_Tonnes`
  6. `Sum of Conveyor from MIN_CMN`
  7. `Sum of To_Stockpile_Wet_Tonnes`
- **Visualization Modes**: Grouped Bar, Trend Line, Variance Δ Bar, and 45-degree Parity Scatter plots ($y = x$) with $R^2$ calculation.
- **Design System Enforcement**: White background, grey overlay containers, rounded black borders (`2px solid #000`), orange titles, teal subtitles, and rich hover tooltips on every interactive element.
- **Portable Packaging**: Single-file HTML bundle (`dist/index.html`) executable by double-click anywhere offline, plus Tauri desktop configuration.
