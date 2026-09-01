import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { DragDropCanvas } from './components/DragDropCanvas';
import { DiffViewer } from './components/DiffViewer';
import { JoinBuilder, JoinType } from './components/JoinBuilder';
import { CalibrationGraphs } from './components/CalibrationGraphs';
import { SqlConsoleModal } from './components/SqlConsoleModal';
import { ParsedDataset, parseFile, TARGET_METRICS } from './services/fileParser';
import { getDb, ingestTable, executeSql, sanitizeIdentifier } from './services/db';
import { generateSampleDatasets } from './services/sampleData';

export const App: React.FC = () => {
  const [smtDataset, setSmtDataset] = useState<ParsedDataset | null>(null);
  const [blazorDataset, setBlazorDataset] = useState<ParsedDataset | null>(null);
  const [dbReady, setDbReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isJoinExecuting, setIsJoinExecuting] = useState<boolean>(false);
  const [isSqlConsoleOpen, setIsSqlConsoleOpen] = useState<boolean>(false);

  const [joinConfig, setJoinConfig] = useState<{ joinType: JoinType; keys: string[]; groupBy: string }>({
    joinType: 'INNER',
    keys: ['period'],
    groupBy: 'period',
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
      config: { joinType: JoinType; keys: string[]; groupBy: string }
    ) => {
      if (!smt || !blz || config.keys.length === 0) {
        setJoinedRows([]);
        return;
      }

      setIsJoinExecuting(true);

      const joinConditions = config.keys.map((k) => `s."${k}" = b."${k}"`).join(' AND ');

      const metricSelects = TARGET_METRICS.map((m) => {
        const sCol = smt.detectedMetrics[m.key] ? sanitizeIdentifier(smt.detectedMetrics[m.key]) : null;
        const bCol = blz.detectedMetrics[m.key] ? sanitizeIdentifier(blz.detectedMetrics[m.key]) : null;

        const sSql = sCol ? `COALESCE(SUM(s."${sCol}"), 0)` : `0`;
        const bSql = bCol ? `COALESCE(SUM(b."${bCol}"), 0)` : `0`;

        return `${sSql} AS "smt_${m.key}", ${bSql} AS "blazor_${m.key}", (${bSql} - ${sSql}) AS "delta_${m.key}"`;
      }).join(',\n  ');

      const keySelects = config.keys.map((k) => `COALESCE(s."${k}", b."${k}") AS "${k}"`).join(',\n  ');
      const groupClause = config.keys.map((k) => `COALESCE(s."${k}", b."${k}")`).join(', ');

      const sql = `SELECT
  ${keySelects},
  ${metricSelects}
FROM smt_data s
${config.joinType} JOIN blazor_data b
  ON ${joinConditions}
GROUP BY ${groupClause}
ORDER BY ${groupClause};`;

      try {
        const res = await executeSql(sql);
        if (!res.error && res.rows) {
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

  // File Upload Handler
  const handleFileUpload = async (file: File, target: 'smt' | 'blazor') => {
    setIsLoading(true);
    try {
      const parsed = await parseFile(file);
      const tableName = target === 'smt' ? 'smt_data' : 'blazor_data';

      // Store in PostgreSQL database
      await ingestTable(tableName, parsed.headers, parsed.rows);

      if (target === 'smt') {
        setSmtDataset(parsed);
        if (blazorDataset) {
          const keys = parsed.detectedKeys.filter((k) => blazorDataset.detectedKeys.includes(k));
          const activeKeys = keys.length > 0 ? [keys[0]] : ['period'];
          const newConfig = { ...joinConfig, keys: activeKeys, groupBy: activeKeys[0] };
          setJoinConfig(newConfig);
          await runJoinQuery(parsed, blazorDataset, newConfig);
        }
      } else {
        setBlazorDataset(parsed);
        if (smtDataset) {
          const keys = smtDataset.detectedKeys.filter((k) => parsed.detectedKeys.includes(k));
          const activeKeys = keys.length > 0 ? [keys[0]] : ['period'];
          const newConfig = { ...joinConfig, keys: activeKeys, groupBy: activeKeys[0] };
          setJoinConfig(newConfig);
          await runJoinQuery(smtDataset, parsed, newConfig);
        }
      }
    } catch (err: any) {
      alert(`Error parsing file: ${err.message || err}`);
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
    await db.exec(`DROP TABLE IF EXISTS ${tableName};`);

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
    await db.exec(`DROP TABLE IF EXISTS smt_data; DROP TABLE IF EXISTS blazor_data;`);
    setSmtDataset(null);
    setBlazorDataset(null);
    setJoinedRows([]);
  };

  // Custom Join Execution Handler
  const handleExecuteJoin = async (
    _sql: string,
    config: { joinType: JoinType; keys: string[]; groupBy: string }
  ) => {
    setJoinConfig(config);
    await runJoinQuery(smtDataset, blazorDataset, config);
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
      />
    </div>
  );
};
