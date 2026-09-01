import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { DragDropCanvas } from './components/DragDropCanvas';
import { DiffViewer } from './components/DiffViewer';
import { JoinBuilder } from './components/JoinBuilder';
import { CalibrationGraphs } from './components/CalibrationGraphs';
import { SqlConsoleModal } from './components/SqlConsoleModal';
import { ParsedDataset, parseFile, detectDatasetRole } from './services/fileParser';
import { getDb, ingestTable, executeSql, generateCalibrationSql, JoinType, JoinConfig } from './services/db';
import { generateSampleDatasets } from './services/sampleData';

export const App: React.FC = () => {
  const [smtDataset, setSmtDataset] = useState<ParsedDataset | null>(null);
  const [blazorDataset, setBlazorDataset] = useState<ParsedDataset | null>(null);
  const [dbReady, setDbReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isJoinExecuting, setIsJoinExecuting] = useState<boolean>(false);
  const [isSqlConsoleOpen, setIsSqlConsoleOpen] = useState<boolean>(false);

  const [joinConfig, setJoinConfig] = useState<JoinConfig>({
    joinType: 'INNER',
    keys: ['period'],
    groupBy: 'period',
    caseId: '270',
  });

  const [joinedRows, setJoinedRows] = useState<Record<string, any>[]>([]);

  // Initialize embedded PostgreSQL
  useEffect(() => {
    getDb()
      .then(() => setDbReady(true))
      .catch((err) => console.error('Failed to initialize PGlite PostgreSQL engine:', err));
  }, []);

  // Execute Join Query
  const runJoinQuery = useCallback(
    async (
      smt: ParsedDataset | null,
      blz: ParsedDataset | null,
      config: JoinConfig
    ) => {
      if (!smt || !blz) {
        setJoinedRows([]);
        return;
      }

      setIsJoinExecuting(true);
      const sql = generateCalibrationSql(smt, blz, config);

      try {
        const res = await executeSql(sql);
        if (!res.error && res.rows && res.rows.length > 0) {
          setJoinedRows(res.rows);
        } else {
          console.error('SQL Join error:', res.error);
        }
      } catch (e) {
        console.error('Failed to run join query:', e);
      } finally {
        setIsJoinExecuting(false);
      }
    },
    []
  );

  // Dynamic File Upload Handler (Auto-detects SMT vs Blasor role)
  const handleFileUpload = async (filesOrFile: File | FileList | File[], explicitTarget?: 'smt' | 'blazor') => {
    setIsLoading(true);
    try {
      const fileList = filesOrFile instanceof File ? [filesOrFile] : Array.from(filesOrFile);
      let currentSmt = smtDataset;
      let currentBlazor = blazorDataset;

      for (const file of fileList) {
        const parsed = await parseFile(file);
        
        // Dynamically determine dataset role based on content nomenclature
        const detectedRole = detectDatasetRole(file, parsed.headers, parsed.rows);
        const target = fileList.length > 1 ? detectedRole : (explicitTarget || detectedRole);
        const tableName = target === 'smt' ? 'smt_data' : 'blazor_data';

        // Ingest into PostgreSQL database
        await ingestTable(tableName, parsed.headers, parsed.rows);

        if (target === 'smt') {
          currentSmt = parsed;
          setSmtDataset(parsed);
        } else {
          currentBlazor = parsed;
          setBlazorDataset(parsed);
        }
      }

      if (currentSmt && currentBlazor) {
        const newConfig = { ...joinConfig, caseId: '270' };
        setJoinConfig(newConfig);
        await runJoinQuery(currentSmt, currentBlazor, newConfig);
      }
    } catch (err: any) {
      alert(`Error parsing file(s): ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Load Built-in Demo Mining Datasets
  const handleLoadSampleData = async () => {
    setIsLoading(true);
    try {
      const { smtDataset: smt, blazorDataset: blz } = generateSampleDatasets();

      // Ingest both into PostgreSQL
      await ingestTable('smt_data', smt.headers, smt.rows);
      await ingestTable('blazor_data', blz.headers, blz.rows);

      setSmtDataset(smt);
      setBlazorDataset(blz);

      const sampleConfig = {
        joinType: 'INNER' as JoinType,
        keys: ['period'],
        groupBy: 'period',
        caseId: '270',
      };
      setJoinConfig(sampleConfig);
      await runJoinQuery(smt, blz, sampleConfig);
    } catch (err: any) {
      alert(`Error loading sample data: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Clear Single Dataset
  const handleClearDataset = async (target: 'smt' | 'blazor') => {
    const tableName = target === 'smt' ? 'smt_data' : 'blazor_data';
    const db = await getDb();
    await db.exec(`TRUNCATE TABLE ${tableName};`);

    if (target === 'smt') {
      setSmtDataset(null);
    } else {
      setBlazorDataset(null);
    }
    setJoinedRows([]);
  };

  // Reset All Datasets
  const handleResetAll = async () => {
    const db = await getDb();
    await db.exec(`TRUNCATE TABLE smt_data; TRUNCATE TABLE blazor_data;`);
    setSmtDataset(null);
    setBlazorDataset(null);
    setJoinedRows([]);
  };

  // Custom Join Execution Handler
  const handleExecuteJoin = async (
    sql: string,
    config: JoinConfig
  ) => {
    setIsJoinExecuting(true);
    setJoinConfig(config);
    try {
      const res = await executeSql(sql);
      if (!res.error && res.rows && res.rows.length > 0) {
        setJoinedRows(res.rows);
      } else {
        await runJoinQuery(smtDataset, blazorDataset, config);
      }
    } catch (e) {
      await runJoinQuery(smtDataset, blazorDataset, config);
    } finally {
      setIsJoinExecuting(false);
    }
  };

  // Handle SQL Console Results Applied to Dashboard
  const handleApplyFromSqlConsole = (rows: Record<string, any>[], _sql: string) => {
    if (rows && rows.length > 0) {
      setJoinedRows(rows);
      const firstRow = rows[0];
      const dimKey = Object.keys(firstRow).find((k) => /period|year|label/i.test(k)) || Object.keys(firstRow)[0] || 'period';
      setJoinConfig((prev) => ({ ...prev, groupBy: dimKey }));
    }
  };

  // Export Joined Dataset CSV
  const handleExportJoinedCsv = () => {
    if (joinedRows.length === 0) return;
    const cols = Object.keys(joinedRows[0]);
    const headerLine = cols.join(',');
    const lines = joinedRows.map((r) =>
      cols
        .map((c) => {
          const val = r[c];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
          return String(val);
        })
        .join(',')
    );

    const csvContent = [headerLine, ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Calibration_Joined_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', color: '#0f172a' }}>
      {/* Navigation Bar */}
      <Navbar
        smtCount={smtDataset ? smtDataset.rows.length : 0}
        blazorCount={blazorDataset ? blazorDataset.rows.length : 0}
        joinedCount={joinedRows.length}
        dbReady={dbReady}
        onLoadSampleData={handleLoadSampleData}
        onOpenSqlConsole={() => setIsSqlConsoleOpen(true)}
        onResetData={handleResetAll}
        onExportJoinedCsv={handleExportJoinedCsv}
      />

      {/* Main Canvas Container */}
      <main style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px 20px' }}>
        {/* Drag & Drop Upload Canvas */}
        <DragDropCanvas
          smtDataset={smtDataset}
          blazorDataset={blazorDataset}
          isLoading={isLoading}
          onFileUpload={handleFileUpload}
          onClearDataset={handleClearDataset}
        />

        {/* Database Join Configuration Builder */}
        <JoinBuilder
          smtDataset={smtDataset}
          blazorDataset={blazorDataset}
          onExecuteJoin={handleExecuteJoin}
          isExecuting={isJoinExecuting}
        />

        {/* Side-by-Side Diff Inspector (dfdiff) */}
        <DiffViewer
          smtDataset={smtDataset}
          blazorDataset={blazorDataset}
          joinKeys={joinConfig.keys}
          joinedRows={joinedRows}
        />

        {/* Calibration Graphs for all 7 Target Metrics */}
        <CalibrationGraphs
          joinedRows={joinedRows}
          joinDimensionKey={joinConfig.groupBy || joinConfig.keys[0] || 'period'}
        />
      </main>

      {/* Interactive SQL Console Modal */}
      <SqlConsoleModal
        isOpen={isSqlConsoleOpen}
        onClose={() => setIsSqlConsoleOpen(false)}
        onApplyToCalibration={handleApplyFromSqlConsole}
      />
    </div>
  );
};
