import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version || '1.1.0';

const distDir = path.join(rootDir, 'dist');
const packageDirName = `CalibrationGrapher-v${version}-Portable`;
const stagingDir = path.join(distDir, packageDirName);
const zipFileName = `${packageDirName}.zip`;
const zipFilePath = path.join(distDir, zipFileName);
const rootZipFilePath = path.join(rootDir, zipFileName);

console.log(`[1/5] Ensuring dist/index.html exists...`);
const distIndexHtml = path.join(distDir, 'index.html');
if (!fs.existsSync(distIndexHtml)) {
  console.log('Running npm run build first...');
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
}

console.log(`[2/5] Creating staging package directory at: ${stagingDir}`);
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

console.log(`[3/5] Populating package files...`);
// Copy standalone html (single entry point)
fs.copyFileSync(distIndexHtml, path.join(stagingDir, 'CalibrationGrapher.html'));

// Copy logos
if (fs.existsSync(path.join(rootDir, 'public', 'qs_logo.png'))) {
  fs.copyFileSync(path.join(rootDir, 'public', 'qs_logo.png'), path.join(stagingDir, 'qs_logo.png'));
}
if (fs.existsSync(path.join(rootDir, 'public', 'q_logo.png'))) {
  fs.copyFileSync(path.join(rootDir, 'public', 'q_logo.png'), path.join(stagingDir, 'q_logo.png'));
}

// Create Windows Batch Launcher
const batContent = `@echo off
title Calibration Grapher
echo ================================================================================
echo   Starting Calibration Grapher (Standalone Portable Edition)
echo ================================================================================
start "" "%~dp0CalibrationGrapher.html"
exit
`;
fs.writeFileSync(path.join(stagingDir, 'Start-CalibrationGrapher.bat'), batContent, 'utf8');

// Create Quickstart guide
const quickstartContent = `================================================================================
  CALIBRATION GRAPHER — PORTABLE EDITION (v${version})
  Next-Generation Mine Planning Schedule Calibration Engine
================================================================================

HOW TO RUN:
--------------------------------------------------------------------------------
Option 1: Double-click "Start-CalibrationGrapher.bat"
Option 2: Double-click "CalibrationGrapher.html" directly in any web browser 
          (Chrome, Edge, Firefox, Safari).

NO INSTALLATION OR INTERNET REQUIRED:
--------------------------------------------------------------------------------
This is a 100% standalone, portable application. It contains an embedded 
WebAssembly PostgreSQL 16 database engine (PGlite), Chart.js visualization suite, 
and multi-format file parsers bundled directly inside. No server setup, 
database daemon, or internet connection is required.

QUICK START GUIDE:
--------------------------------------------------------------------------------
1. Launch CalibrationGrapher.html.
2. Ingest Files:
   - Drag & Drop your SMT Tool Output file (CSV, XLSX, TSV, JSON) onto the SMT dropzone.
   - Drag & Drop your Blazor Composite file (CSV, XLSX, TSV, JSON) onto the Blazor dropzone.
   - OR click "Load Sample Data" in the top navigation bar to explore a 24-period demo.
3. Explore Analytics:
   - Calibration Graphs: 7 key mining metrics with Bar, Trend Line, Tornado, Variance Delta, 
     and 45° Parity (y = x) views.
   - Diff Inspector (dfdiff): Side-by-side cell-level delta comparisons with tolerance slider.
   - Join Builder: Dynamic SQL joins (INNER, LEFT, RIGHT, FULL OUTER) and Case ID filters.
   - SQL Console: Interactive in-browser PostgreSQL 16 sandbox.
4. Export:
   - Export individual metric charts as high-resolution PNG or landscape PDF.
   - Click "Export All PDF Report" for a multi-page consolidated calibration document.

THE 7 CALIBRATION METRICS:
--------------------------------------------------------------------------------
1. Sum of Crusher_Haul_Wet_Tonnes
2. Sum of Waste_Haul_Wet_Tonnes
3. Sum of Total_ExPit_Haul_Wet_Tonnes
4. Sum of ExPit_Ore_Wet_Tonnes
5. Sum of From_Stockpile_Wet_Tonnes
6. Sum of Conveyor from MIN_CMN
7. Sum of To_Stockpile_Wet_Tonnes

================================================================================
`;
fs.writeFileSync(path.join(stagingDir, 'QUICKSTART.txt'), quickstartContent, 'utf8');

console.log(`[4/5] Compressing package into ZIP archive...`);
if (fs.existsSync(zipFilePath)) {
  fs.unlinkSync(zipFilePath);
}
if (fs.existsSync(rootZipFilePath)) {
  fs.unlinkSync(rootZipFilePath);
}

// Use PowerShell Compress-Archive on Windows
const powershellCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipFilePath}' -Force"`;
execSync(powershellCmd, { stdio: 'inherit' });

// Also copy zip file to root workspace for easy access
fs.copyFileSync(zipFilePath, rootZipFilePath);

console.log(`[5/5] Success! Created portable ZIP packages:`);
console.log(`  - ${zipFilePath} (${(fs.statSync(zipFilePath).size / (1024 * 1024)).toFixed(2)} MB)`);
console.log(`  - ${rootZipFilePath}`);
