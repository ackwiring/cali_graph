# Calibration Grapher (`cali_graph`)

> **Next-Generation Mine Planning Schedule Calibration Engine**  
> Compare raw SMT (Strategic Mine Planning) tool outputs against Blazor composite models in real time with an embedded WebAssembly PostgreSQL 16 engine, side-by-side cell diffing, and statistical parity graphing.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture & Technology Stack](#architecture--technology-stack)
3. [The 7 Required Calibration Metrics](#the-7-required-calibration-metrics)
4. [Mathematical & Statistical Foundations](#mathematical--statistical-foundations)
   - [Unit Conversions & Mass Scaling](#unit-conversions--mass-scaling)
   - [Variance & Delta Calculations](#variance--delta-calculations)
   - [Percentage Difference & Dynamic Tolerance](#percentage-difference--dynamic-tolerance)
   - [Pearson Correlation Coefficient & $R^2$ Goodness of Fit](#pearson-correlation-coefficient--r2-goodness-of-fit)
   - [45° Parity Line Analysis ($y = x$)](#45-parity-line-analysis-y--x)
5. [Embedded PostgreSQL SQL Engine (`PGlite` WASM)](#embedded-postgresql-sql-engine-pglite-wasm)
   - [Engine Lifecycle & Singleton Management](#engine-lifecycle--singleton-management)
   - [Relational + JSONB Dual-Storage Architecture](#relational--jsonb-dual-storage-architecture)
   - [Identifier Sanitization & PostgreSQL 63-Byte Limits](#identifier-sanitization--postgresql-63-byte-limits)
   - [Type Inference System](#type-inference-system)
   - [Adaptive Dynamic Batch Ingestion](#adaptive-dynamic-batch-ingestion)
   - [Calibration SQL Generation & Decoders](#calibration-sql-generation--decoders)
   - [Interactive In-Browser SQL Console](#interactive-in-browser-sql-console)
6. [File Parsing & Automatic Role Detection](#file-parsing--automatic-role-detection)
   - [Multi-Format Ingestion Engine](#multi-format-ingestion-engine)
   - [Intelligent Header Scoring & Sheet Selection](#intelligent-header-scoring--sheet-selection)
   - [Dataset Role Classification (SMT vs Blazor)](#dataset-role-classification-smt-vs-blazor)
   - [Target Metric Alias Resolution](#target-metric-alias-resolution)
7. [Component Deep-Dive & Function Reference](#component-deep-dive--function-reference)
   - [`src/services/db.ts`](#srcservicesdbts)
   - [`src/services/fileParser.ts`](#srcservicesfileparserts)
   - [`src/components/CalibrationGraphs.tsx`](#srccomponentscalibrationgraphstsx)
   - [`src/components/DiffViewer.tsx`](#srccomponentsdiffviewertsx)
   - [`src/components/JoinBuilder.tsx`](#srccomponentsjoinbuildertsx)
   - [`src/components/DragDropCanvas.tsx`](#srccomponentsdragdropcanvastsx)
   - [`src/components/SqlConsoleModal.tsx`](#srccomponentssqlconsolemodaltsx)
   - [`src/components/Navbar.tsx`](#srccomponentsnavbartsx)
   - [`src/App.tsx`](#srcapptsx)
8. [Design System & Conformance](#design-system--conformance)
9. [Installation, Build & Deployment](#installation-build--deployment)
10. [Network & Tailscale Access](#network--tailscale-access)

---

## Executive Summary

Mining schedule calibration requires rigorous validation between raw mathematical optimizer outputs (SMT tool schedules) and downstream reporting / processing aggregations (Blazor composite models). Historical workflows relied on tedious manual spreadsheet lookups, brittle macros, and disjointed charting tools.

**Calibration Grapher** provides a high-performance, single-bundle web application and Tauri-compatible desktop tool that runs entirely client-side. Powered by **PGlite** (PostgreSQL 16 compiled to WebAssembly), the application imports raw schedule files across multiple formats (CSV, TSV, XLSX, JSON), ingests them into in-memory PostgreSQL tables, executes relational joins with unit conversion decoders, flags cell-level discrepancies within user-defined tolerances, and renders 7 core calibration metric visualizations across 4 distinct analytical modes.

---

## Architecture & Technology Stack

```
+-----------------------------------------------------------------------------------+
|                                Client Browser / WebApp                            |
+-----------------------------------------------------------------------------------+
|  [DragDropCanvas] <---> [fileParser.ts] (PapaParse / SheetJS / Heuristic Scoring) |
|                                 |                                                 |
|                                 v                                                 |
|  [PGlite WASM Engine] <---> [db.ts] (PostgreSQL 16 in-memory / relational + JSONB)|
|        |                                    |                                     |
|        v                                    v                                     |
|  [JoinBuilder.tsx]                 [SqlConsoleModal.tsx]                          |
|  (Dynamic SQL & Join Config)       (Live Query Sandbox)                           |
|        |                                                                          |
|        +----------------------------+---------------------------------------------+
|                                     |                                             |
|                                     v                                             |
|        +----------------------------------------------------------+               |
|        | [DiffViewer.tsx]        | [CalibrationGraphs.tsx]        |               |
|        | Side-by-side cell delta | 7 Metric Suites (Bar, Line,    |               |
|        | Tolerance filtering     | Variance Delta, Parity y=x)    |               |
|        +-------------------------+--------------------------------+               |
+-----------------------------------------------------------------------------------+
```

- **Frontend Core**: React 18.3, TypeScript 5.7, Vite 6.1
- **Embedded Database**: `@electric-sql/pglite` v0.2.14 (PostgreSQL 16 WebAssembly)
- **Data Visualization**: Chart.js 4.4, `react-chartjs-2` 5.3
- **File Parsing**: `papaparse` 5.5, `xlsx` 0.18.5 (SheetJS)
- **UI Components & Icons**: `lucide-react` 0.475
- **Bundle Strategy**: `vite-plugin-singlefile` (compiles all HTML, CSS, JavaScript, and WebAssembly into a single standalone `dist/index.html` file that can run offline without a local web server).

---

## The 7 Required Calibration Metrics

The calibration suite tracks 7 foundational mining mass-flow and haulage metrics:

| # | Metric Canonical Name | Short Name | Physical Meaning & Mining Flow | SMT Source Metric & Scaling |
|---|----------------------|------------|--------------------------------|-----------------------------|
| **1** | `Sum of Crusher_Haul_Wet_Tonnes` | Crusher Haul | Total Run-of-Mine (ROM) wet mass delivered from pit directly to the primary crushing station. | `Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)` $\times 10^6$ |
| **2** | `Sum of Waste_Haul_Wet_Tonnes` | Waste Haul | Total non-economic waste rock hauled from active mining flitches to engineered waste rock dumps. | `Sent to MinistersNorth_Waste:rom_wmt (Mwmt)` $\times 10^6$ |
| **3** | `Sum of Total_ExPit_Haul_Wet_Tonnes` | Total ExPit Haul | Gross total mass extracted from the open pit perimeter (Sum of Crusher Haul + Waste Haul + To Stockpile). | `Sent to MinistersNorth_ExPit:rom_wmt (Mwmt)` $\times 10^6$ |
| **4** | `Sum of ExPit_Ore_Wet_Tonnes` | ExPit Ore | High-grade and medium-grade ore extracted directly from pit faces prior to stockpile reclamation or direct feed. | Derived or direct ore column mapping |
| **5** | `Sum of From_Stockpile_Wet_Tonnes` | From Stockpile | Reclaim mass extracted from long-term or surge stockpiles and re-fed into processing plant crushers. | `Sent to Total_from_SP:rom_wmt (Mwmt)` $\times 10^6$ |
| **6** | `Sum of Conveyor from MIN_CMN` | Conveyor MIN_CMN | Overland conveyor bulk material transport from Ministers North / crushing stations to beneficiation plant. | `Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)` $\times 10^6$ |
| **7** | `Sum of To_Stockpile_Wet_Tonnes` | To Stockpile | Ore tonnage excavated from pit that bypasses direct crusher feed to be placed into intermediate stockpile reserves. | `Sent to Total_to_SP:rom_wmt (Mwmt)` $\times 10^6$ |

---

## Mathematical & Statistical Foundations

### Unit Conversions & Mass Scaling

Raw SMT optimization output files frequently report tonnage in **Million Wet Metric Tonnes (Mwmt)**, whereas Blazor reporting models report in **Wet Tonnes (t)**:

$$T_{\text{Wet Tonnes}} = T_{\text{Mwmt}} \times 1,000,000.0$$

The embedded SQL generator and parser apply this scaling during dataset joining and aggregation, rounding final display values to 2 decimal places:

$$\text{ROUND}(T_{\text{Mwmt}} \times 1000000.0, 2)$$

---

### Variance & Delta Calculations

For any given period or join dimension $i$, the absolute calibration discrepancy (variance $\Delta_i$) between the Blazor composite value $B_i$ and the SMT tool baseline $S_i$ is defined as:

$$\Delta_i = B_i - S_i$$

- When $\Delta_i > 0$: Blazor reporting model exceeds SMT schedule output (over-reported).
- When $\Delta_i < 0$: Blazor reporting model is less than SMT schedule output (under-reported).
- When $\Delta_i = 0$: Perfect calibration match.

The cumulative net variance across all $N$ time periods is:

$$\Delta_{\text{total}} = \sum_{i=1}^N B_i - \sum_{i=1}^N S_i$$

---

### Percentage Difference & Dynamic Tolerance

The relative percentage difference $\Delta_{\text{rel}, i}$ (in %) is calculated relative to the SMT baseline:

$$
\Delta_{\text{rel}, i} = \begin{cases} 
\left( \dfrac{B_i - S_i}{S_i} \right) \times 100 & \text{if } S_i \ne 0 \\[8pt] 
0 & \text{if } S_i = 0 \text{ and } B_i = 0 \\[8pt] 
100 & \text{if } S_i = 0 \text{ and } B_i > 0 
\end{cases}
$$

For symmetrical cell-level difference evaluation in the **Diff Inspector (`dfdiff`)**, the percentage difference relative to the maximum absolute magnitude is evaluated against user-configurable tolerance $\tau$ (default: $\tau = 0.1\%$):

$$
\Delta_{\text{sym}, i} = \frac{|B_i - S_i|}{\max(|S_i|, |B_i|)} \times 100
$$

$$
\text{IsDiscrepancy}(S_i, B_i, \tau) = \begin{cases} 
\mathbf{TRUE} & \text{if } \Delta_{\text{sym}, i} > \tau \quad \text{AND} \quad |B_i - S_i| \ge 1.0\text{ tonne} \\[6pt] 
\mathbf{FALSE} & \text{otherwise} 
\end{cases}
$$

---

### Pearson Correlation Coefficient & $R^2$ Goodness of Fit

To quantify calibration fidelity across all time periods, the application computes the **Pearson correlation coefficient ($r$)** and the **coefficient of determination ($R^2$)**:

$$\bar{S} = \frac{1}{N} \sum_{i=1}^N S_i, \quad \bar{B} = \frac{1}{N} \sum_{i=1}^N B_i$$

$$r = \frac{\sum_{i=1}^N (S_i - \bar{S})(B_i - \bar{B})}{\sqrt{\sum_{i=1}^N (S_i - \bar{S})^2} \cdot \sqrt{\sum_{i=1}^N (B_i - \bar{B})^2}}$$

$$R^2 = r^2$$

- **$R^2 = 1.0000$**: Perfect linear alignment between SMT schedule and Blazor model.
- **$0.95 \le R^2 < 1.0$**: Strong operational alignment with minor schedule smoothing deltas.
- **$R^2 < 0.90$**: Calibration warning; indicates timing mismatches, unmapped stockpiles, or misaligned case IDs.

---

### 45° Parity Line Analysis ($y = x$)

In the **Parity Mode** visualization:
- X-axis: SMT Tool Wet Tonnes ($S_i$)
- Y-axis: Blazor Composite Wet Tonnes ($B_i$)
- Reference: Dashed teal line defined by $y = x$ passing through $(0,0)$ and $(\max(S, B), \max(S, B))$.

Points clustering tightly along $y = x$ confirm high model fidelity. Orthogonal distance from the parity line directly reflects the magnitude of the calibration error.

---

## Embedded PostgreSQL SQL Engine (`PGlite` WASM)

### Engine Lifecycle & Singleton Management

The database service (`src/services/db.ts`) maintains a persistent singleton instance of `PGlite`. When initialized via `getDb()`, it executes bootstrap DDL:

```sql
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
```

---

### Relational + JSONB Dual-Storage Architecture

Mine planning output files can contain hundreds or thousands of columns. Standard relational engines face fixed column limits (PostgreSQL has a maximum limit of 1,600 columns per table).

Calibration Grapher implements a **hybrid dual-storage strategy**:
1. **Relational Typed Columns**: The first 600 active columns are sanitized, type-inferred, and created as native relational columns (`BIGINT`, `DOUBLE PRECISION`, or `TEXT`) for indexed SQL operations.
2. **Lossless `raw_data JSONB` Column**: Every single ingested row preserves 100% of original column keys and values in an unconstrained `JSONB` document. Any column—regardless of original header formatting, whitespace, special characters, or table width—can be extracted with PostgreSQL `->>` operators.

---

### Identifier Sanitization & PostgreSQL 63-Byte Limits

PostgreSQL enforces a maximum identifier length of **63 bytes** (`NAMEDATALEN = 64`). The `sanitizeIdentifier` function guarantees compliance:

```typescript
export function sanitizeIdentifier(name: string): string {
  let clean = name.trim().toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
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
```

Duplicate column names generated after sanitization are assigned unique incremental suffixes (e.g. `crusher_tonnes_1`, `crusher_tonnes_2`).

---

### Type Inference System

The `inferPostgresType` function examines sample row values (first 100 records) to assign optimal data types:
- If all non-null values are integers: `BIGINT`
- If all non-null values are numeric decimals: `DOUBLE PRECISION`
- If values contain strings, dates, or mixed formats: `TEXT`

---

### Adaptive Dynamic Batch Ingestion

To prevent WebAssembly memory exhaustion and SQL statement string allocation limits when inserting datasets with many columns, the batch size scales inversely with column width:

$$\text{BatchSize} = \max\left(5, \min\left(250, \left\lfloor \frac{4000}{\max(1, N_{\text{cols}})} \right\rfloor\right)\right)$$

Rows are constructed with escaped string literals and inserted in multi-row `VALUES` statements.

---

### Calibration SQL Generation & Decoders

When BHP Ministers North SMT and Blazor files are uploaded, `generateCalibrationSql` produces the canonical relational join query:

```sql
SELECT 
    CAST(b.raw_data->>'Row Labels' AS INTEGER) AS period,
    s.raw_data->>'CASE_ID' AS case_id,
    
    -- 1. Crusher Haul (Mwmt -> Wet Tonnes)
    ROUND(CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_Crusher:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0, 2) AS smt_crusher_haul_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Crusher_Haul_Wet_Tonnes', '0') AS NUMERIC), 2) AS blazor_crusher_haul_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Crusher_Haul_Wet_Tonnes', '0') AS NUMERIC) - (CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_Crusher:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0), 2) AS delta_crusher_haul_wet_tonnes,
    
    -- 2. Waste Haul (Mwmt -> Wet Tonnes)
    ROUND(CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_Waste:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_Waste:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0, 2) AS smt_waste_haul_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Waste_Haul_Wet_Tonnes', '0') AS NUMERIC), 2) AS blazor_waste_haul_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Waste_Haul_Wet_Tonnes', '0') AS NUMERIC) - (CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_Waste:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_Waste:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0), 2) AS delta_waste_haul_wet_tonnes,

    -- 3. Total ExPit Haul (Mwmt -> Wet Tonnes)
    ROUND(CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_ExPit:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_ExPit:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0, 2) AS smt_total_expit_haul_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Total_ExPit_Haul_Wet_Tonnes', '0') AS NUMERIC), 2) AS blazor_total_expit_haul_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Total_ExPit_Haul_Wet_Tonnes', '0') AS NUMERIC) - (CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_ExPit:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_ExPit:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0), 2) AS delta_total_expit_haul_wet_tonnes,

    -- 4. ExPit Ore
    0.00 AS smt_expit_ore_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of ExPit_Ore_Wet_Tonnes', '0') AS NUMERIC), 2) AS blazor_expit_ore_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of ExPit_Ore_Wet_Tonnes', '0') AS NUMERIC), 2) AS delta_expit_ore_wet_tonnes,

    -- 5. From Stockpile (Mwmt -> Wet Tonnes)
    ROUND(CAST(COALESCE(s.raw_data->>'Sent to Total_from_SP:rom_wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0, 2) AS smt_from_stockpile_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of From_Stockpile_Wet_Tonnes', '0') AS NUMERIC), 2) AS blazor_from_stockpile_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of From_Stockpile_Wet_Tonnes', '0') AS NUMERIC) - (CAST(COALESCE(s.raw_data->>'Sent to Total_from_SP:rom_wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0), 2) AS delta_from_stockpile_wet_tonnes,

    -- 6. Conveyor MIN_CMN
    ROUND(CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_Crusher:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0, 2) AS smt_conveyor_from_min_cmn,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Conveyor from MIN_CMN', '0') AS NUMERIC), 2) AS blazor_conveyor_from_min_cmn,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of Conveyor from MIN_CMN', '0') AS NUMERIC) - (CAST(COALESCE(s.raw_data->>'Sent to MinistersNorth_Crusher:rom_wmt (Mwmt)', s.raw_data->>'Sent to MinistersNorth_Crusher:wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0), 2) AS delta_conveyor_from_min_cmn,

    -- 7. To Stockpile (Mwmt -> Wet Tonnes)
    ROUND(CAST(COALESCE(s.raw_data->>'Sent to Total_to_SP:rom_wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0, 2) AS smt_to_stockpile_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of To_Stockpile_Wet_Tonnes', '0') AS NUMERIC), 2) AS blazor_to_stockpile_wet_tonnes,
    ROUND(CAST(COALESCE(b.raw_data->>'Sum of To_Stockpile_Wet_Tonnes', '0') AS NUMERIC) - (CAST(COALESCE(s.raw_data->>'Sent to Total_to_SP:rom_wmt (Mwmt)', '0') AS NUMERIC) * 1000000.0), 2) AS delta_to_stockpile_wet_tonnes

FROM blazor_data b
INNER JOIN smt_data s
    ON CAST(b.raw_data->>'Row Labels' AS INTEGER) = CAST(FLOOR(CAST(s.raw_data->>'Period Name' AS NUMERIC)) AS INTEGER)
WHERE b.raw_data->>'Row Labels' NOT ILIKE '%Grand Total%'
  AND s.raw_data->>'CASE_ID' = '270'
ORDER BY period ASC;
```

---

### Interactive In-Browser SQL Console

Accessible via the **SQL Console** button in the navigation bar:
- Executes custom SQL against `smt_data` and `blazor_data`.
- Includes preset query templates.
- Features execution time tracking (`durationMs`) using `performance.now()`.
- Provides **"Apply Results to Calibration Graphs"**, allowing ad-hoc queries and filter logic to drive the entire dashboard visualizations.

---

## File Parsing & Automatic Role Detection

### Multi-Format Ingestion Engine

`src/services/fileParser.ts` parses:
- **CSV / TSV / TXT**: Streaming parser via PapaParse with header detection and automatic type coercion.
- **XLSX / XLS / XLSB**: SheetJS array-buffer parser with target sheet detection.
- **JSON**: Direct parsing of flat row arrays or nested objects.

---

### Intelligent Header Scoring & Sheet Selection

Excel workbooks often contain multiple sheets with preamble titles and blank header rows. `parseFile` scans the first 15 rows of each sheet and computes a scoring metric:

```typescript
let score = stringCells.length;
if (rowStr.includes('row labels') || rowStr.includes('period')) score += 10;
if (rowStr.includes('crusher')) score += 10;
if (rowStr.includes('waste')) score += 10;
if (rowStr.includes('expit')) score += 10;
if (rowStr.includes('stockpile')) score += 10;
if (rowStr.includes('conveyor')) score += 10;
if (rowStr.includes('sum of')) score += 15;
```

The row with the highest score is automatically selected as the header row, and summary lines (e.g. `Grand Total`) are excluded from data ingestion.

---

### Dataset Role Classification (SMT vs Blazor)

When files are dropped simultaneously onto the upload canvas, `detectDatasetRole` classifies each file without requiring user intervention:
- **SMT Indicators**: Filename matches (`smt`, `schedule`, `transposed`), headers containing `case_id`, `period name`, `ministersnorth`, `mwmt`, `total_from_sp`.
- **Blazor Indicators**: Filename matches (`blasor`, `blazor`, `pivot`, `composite`), headers containing `row labels`, `sum of`, `crusher_haul_wet_tonnes`, `waste_haul_wet_tonnes`.

---

## Component Deep-Dive & Function Reference

### `src/services/db.ts`
- `getDb(): Promise<PGlite>`: Returns singleton PostgreSQL engine instance.
- `sanitizeIdentifier(name: string): string`: Produces clean PostgreSQL-compliant identifiers ($\le 55$ chars).
- `inferPostgresType(values: any[]): { type: string; isNumeric: boolean }`: Determines column types (`BIGINT`, `DOUBLE PRECISION`, `TEXT`).
- `ingestTable(tableName, headers, rows)`: Drops and recreates table schema, inserts rows via dynamic batching, and stores lossless `raw_data JSONB`.
- `executeSql(sql: string): Promise<QueryResult>`: Runs SQL string, measures execution latency in milliseconds, returns rows and column metadata.
- `getTableStats(tableName)`: Retrieves row count and column list from `information_schema`.
- `generateCalibrationSql(smt, blazor, config)`: Builds SQL join statement between datasets.

### `src/services/fileParser.ts`
- `parseFile(file: File): Promise<ParsedDataset>`: Parses uploaded file into standard schema.
- `detectColumns(headers: string[])`: Detects metric aliases and candidate join keys.
- `detectDatasetRole(file, headers, rows)`: Classifies dataset role (`smt` vs `blazor`).
- `TARGET_METRICS`: Comprehensive configuration array for all 7 metrics with aliases and palette colors.

### `src/components/CalibrationGraphs.tsx`
- Renders 4 chart modes:
  - **Grouped Bar**: Side-by-side period comparisons.
  - **Trend Line**: Trajectory curves over periods with shaded area fills.
  - **Variance $\Delta$**: Color-coded delta bars (green for positive, red for negative).
  - **45° Parity ($y = x$)**: Scatter plot with $R^2$ goodness-of-fit indicator.
- Mini KPI cards for SMT Total, Blazor Total, Net Variance $\Delta$, and Variance $\%$.
- Single metric focus filter tabs + "All 7 Graphs View".

### `src/components/DiffViewer.tsx`
- Side-by-side data table (`dfdiff`) comparing SMT records against Blazor records.
- Configurable tolerance slider ($\tau \in [0, 100]\%$).
- Filter modes: `All Rows`, `Discrepancies Only`, `Matches Only`, `SMT Only`, `Blazor Only`.
- Real-time search bar and pagination controls.

### `src/components/JoinBuilder.tsx`
- Join type selector: `INNER JOIN`, `LEFT JOIN` (SMT Baseline), `RIGHT JOIN` (Blazor Baseline), `FULL OUTER JOIN`.
- Scenario / Case selector (e.g. `CASE_ID = 270`, `CASE_ID = 269`).
- Common key selection badges (`period`, `bench`, `pit`, etc.).
- Live editable PostgreSQL query viewer.

### `src/components/SqlConsoleModal.tsx`
- PostgreSQL 16 interactive terminal modal.
- Includes pre-built mining query templates.
- Query duration timer and structured data table viewer.
- **"Apply Results to Calibration Graphs"** button to pipe custom SQL results directly into charts.

---

## Design System & Conformance

The user interface follows a clean, high-contrast engineering aesthetic:

- **Main Canvas Background**: Pure White (`#ffffff`)
- **Card & Overlay Containers**: Slate Grey (`#f1f5f9` / `#e2e8f0` / `#f8fafc`)
- **Borders**: Sharp 2px Solid Black (`2px solid #000000; border-radius: 8px / 12px`)
- **Primary Titles**: Mining High-Visibility Orange (`#ea580c`)
- **Subtitles & Secondary Highlights**: Technical Teal (`#0d9488`)
- **SMT Dataset Branding**: Royal Blue (`#2563eb`)
- **Blazor Dataset Branding**: Deep Violet (`#9333ea`)
- **Discrepancy / Match Alerts**: Crimson Red (`#dc2626`) / Emerald Green (`#16a34a`)
- **Tooltips**: Informative hover tooltips on every control, button, table header, and metric badge.

---

## Installation, Build & Deployment

### Prerequisites
- Node.js 18+ (or Node.js 20+ LTS recommended)
- npm 9+

### Quick Start (Development)
```bash
# Clone repository
git clone https://github.com/ackwiring/cali_graph.git
cd cali_graph

# Install dependencies
npm install

# Start development server
npm run dev
```
The application will launch locally at `http://localhost:3000`.

### Production Build (Standalone Single-File Executable)
```bash
npm run build
```
This produces `dist/index.html`. This single file contains all styles, scripts, and the PGlite WebAssembly engine inline. It can be opened directly in Chrome, Edge, Firefox, or Safari without running a local web server.

---

## Network & Tailscale Access

When hosting the development server for team access:

1. **Start Vite with Host Binding**:
   ```bash
   npm run dev -- --host --port 1945
   ```
2. **Access via Local LAN (Same Wi-Fi)**:
   - `http://<YOUR_LOCAL_IP>:1945/` (e.g. `http://192.168.1.124:1945/`)
3. **Access via Tailscale (Remote Team Members)**:
   - Tailscale IP: `http://100.85.201.96:1945/`
   - MagicDNS Name: `http://manbearpig:1945/`
4. **Expose via Tailscale Serve (HTTPS)**:
   ```powershell
   tailscale serve --bg 1945 http://127.0.0.1:1945
   ```
   Accessible across your tailnet at `https://manbearpig.tail6b34.ts.net:1945/`.

---

## License

Internal Mining Technical Services Tool — All Rights Reserved.
