import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { DragDropCanvas } from './components/DragDropCanvas';
import { DiffViewer } from './components/DiffViewer';
import { JoinBuilder } from './components/JoinBuilder';
import { CalibrationGraphs } from './components/CalibrationGraphs';
import { SqlConsoleModal } from './components/SqlConsoleModal';
import { ParsedDataset, parseFile, detectDatasetRole, detectAvailableCaseIds, detectAvailableSentToSites } from './services/fileParser';
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

  // User-facing notice surfaced whenever a join query fails or silently falls
  // back to another query, so the graphs never show data the user didn't ask
  // for without them knowing why.
  const [joinNotice, setJoinNotice] = useState<string | null>(null);

  // Initialize embedded PostgreSQL
  useEffect(() => {
    getDb()
      .then(() => setDbReady(true))
      .catch((err) => console.error('Failed to initialize PGlite PostgreSQL engine:', err));
  }, []);

  // Execute the auto-generated Join Query. Returns whether it succeeded so
  // callers (e.g. the custom-SQL fallback path) can report what happened
  // instead of failing silently.
  const runJoinQuery = useCallback(
    async (
      smt: ParsedDataset | null,
      blz: ParsedDataset | null,
      config: JoinConfig
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!smt || !blz) {
        setJoinedRows([]);
        return { ok: false, error: 'Both SMT and Blazor datasets are required.' };
      }

      setIsJoinExecuting(true);
      const sql = generateCalibrationSql(smt, blz, config);

      try {
        const res = await executeSql(sql);
        if (!res.error && res.rows && res.rows.length > 0) {
          setJoinedRows(res.rows);
          return { ok: true };
        }
        setJoinedRows([]);
        const error = res.error || 'The join returned no matching rows.';
        console.error('SQL Join error:', error);
        return { ok: false, error };
      } catch (e: any) {
        setJoinedRows([]);
        const error = e?.message || String(e);
        console.error('Failed to run join query:', error);
        return { ok: false, error };
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
        // Auto-join on upload has to pick SOME case (and, for a multi-pit export, SOME
        // site) to show immediately, but neither '270' nor "whichever site is first" is
        // guaranteed to be the one actually being compared — a case-series run can carry
        // dozens of unrelated scenarios, and a multi-pit SMT export routes material to
        // several different sites under the identical "Sent to <Site>_<Stream>..." naming
        // shape. Use the first real case and site actually present in this file, and let
        // JoinBuilder's selectors (which compute the same values independently, so they
        // start in sync with this) make the deliberate choice from there.
        const [firstAvailableCaseId] = detectAvailableCaseIds(currentSmt);
        const [firstAvailableSite] = detectAvailableSentToSites(currentSmt.headers);
        const newConfig = { ...joinConfig, caseId: firstAvailableCaseId, siteFilter: firstAvailableSite };
        setJoinConfig(newConfig);
        const outcome = await runJoinQuery(currentSmt, currentBlazor, newConfig);
        setJoinNotice(outcome.ok ? null : `Could not auto-join the uploaded datasets: ${outcome.error}`);
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
      const outcome = await runJoinQuery(smt, blz, sampleConfig);
      setJoinNotice(outcome.ok ? null : `Could not auto-join the sample datasets: ${outcome.error}`);
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
    setJoinNotice(null);
  };

  // Reset All Datasets
  const handleResetAll = async () => {
    const db = await getDb();
    await db.exec(`TRUNCATE TABLE smt_data; TRUNCATE TABLE blazor_data;`);
    setSmtDataset(null);
    setBlazorDataset(null);
    setJoinedRows([]);
    setJoinNotice(null);
  };

  // Custom Join Execution Handler. If the user's SQL (hand-edited or a
  // preset) fails or returns nothing, we fall back to the auto-generated
  // join so the app keeps showing *something* useful — but that fallback
  // must never be silent: the graphs would otherwise show data the user
  // never asked for, with no indication their query didn't run.
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
        setJoinNotice(null);
        return;
      }

      const primaryError = res.error || 'Your SQL query returned no rows.';
      const fallback = await runJoinQuery(smtDataset, blazorDataset, config);
      setJoinNotice(
        fallback.ok
          ? `Your custom SQL failed (${primaryError}). Showing the auto-generated join instead — the graphs below do NOT reflect your edited query.`
          : `Your custom SQL failed (${primaryError}), and the auto-generated fallback also failed (${fallback.error}). No calibration data is currently shown.`
      );
    } catch (e: any) {
      const primaryError = e?.message || String(e);
      const fallback = await runJoinQuery(smtDataset, blazorDataset, config);
      setJoinNotice(
        fallback.ok
          ? `Your custom SQL threw an error (${primaryError}). Showing the auto-generated join instead — the graphs below do NOT reflect your edited query.`
          : `Your custom SQL threw an error (${primaryError}), and the auto-generated fallback also failed (${fallback.error}). No calibration data is currently shown.`
      );
    } finally {
      setIsJoinExecuting(false);
    }
  };

  // Handle SQL Console Results Applied to Dashboard
  const handleApplyFromSqlConsole = (rows: Record<string, any>[], _sql: string) => {
    if (rows && rows.length > 0) {
      setJoinedRows(rows);
      setJoinNotice(null);
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
        {/* Join / Query Notice Banner — surfaces silent-fallback situations so the
            graphs never appear to reflect a query that actually failed */}
        {joinNotice && (
          <div
            role="alert"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '12px',
              backgroundColor: '#fef2f2',
              border: '2px solid #b91c1c',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '20px',
              color: '#991b1b',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <span>⚠ {joinNotice}</span>
            <button
              className="cg-btn"
              style={{ padding: '2px 8px', fontSize: '11px', flexShrink: 0 }}
              onClick={() => setJoinNotice(null)}
            >
              Dismiss
            </button>
          </div>
        )}

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
