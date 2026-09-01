import React, { useState, useEffect } from 'react';
import { GitMerge, Play, Code, Check, Layers } from 'lucide-react';
import { ParsedDataset } from '../services/fileParser';
import { Tooltip } from './Tooltip';
import { sanitizeIdentifier, generateCalibrationSql, JoinType, JoinConfig } from '../services/db';

interface JoinBuilderProps {
  smtDataset: ParsedDataset | null;
  blazorDataset: ParsedDataset | null;
  onExecuteJoin: (sql: string, joinConfig: JoinConfig) => Promise<void>;
  isExecuting: boolean;
}

export const JoinBuilder: React.FC<JoinBuilderProps> = ({
  smtDataset,
  blazorDataset,
  onExecuteJoin,
  isExecuting,
}) => {
  const [joinType, setJoinType] = useState<JoinType>('INNER');
  const [selectedKeys, setSelectedKeys] = useState<string[]>(['period']);
  const [groupByDim, setGroupByDim] = useState<string>('period');
  const [caseId, setCaseId] = useState<string>('270');
  const [generatedSql, setGeneratedSql] = useState<string>('');
  const [showSqlEditor, setShowSqlEditor] = useState<boolean>(false);
  // Tracks whether the user has hand-edited the SQL textarea. While true, the
  // join-config controls below stop overwriting it — otherwise every click on
  // Join Type / Keys / Case silently discarded the user's manual SQL edits.
  const [isSqlDirty, setIsSqlDirty] = useState<boolean>(false);

  // Available common keys between SMT and Blazor
  const commonKeys = React.useMemo(() => {
    if (!smtDataset || !blazorDataset) return [];
    const smtClean = smtDataset.headers.map((h) => ({ orig: h, clean: sanitizeIdentifier(h) }));
    const blzClean = blazorDataset.headers.map((h) => ({ orig: h, clean: sanitizeIdentifier(h) }));

    const blzCleanNames = new Set(blzClean.map((b) => b.clean));
    return smtClean.filter((s) => blzCleanNames.has(s.clean)).map((s) => s.clean);
  }, [smtDataset, blazorDataset]);

  // Available Cases in SMT
  const availableCases = React.useMemo(() => {
    if (!smtDataset) return ['270', '269'];
    const caseCol = smtDataset.headers.find((h) => /^case(_id)?$/i.test(h));
    if (!caseCol) return ['270', '269'];
    const cases = Array.from(new Set(smtDataset.rows.map((r) => String(r[caseCol] || '').trim()).filter(Boolean)));
    return cases.length > 0 ? cases : ['270', '269'];
  }, [smtDataset]);

  // Set initial default keys when datasets load
  useEffect(() => {
    if (commonKeys.length > 0 && selectedKeys.length === 0) {
      const priorityKeys = ['period', 'timestep', 'time', 'case_id', 'pit', 'bench'];
      const defaultKey = priorityKeys.find((k) => commonKeys.includes(k)) || commonKeys[0];
      setSelectedKeys([defaultKey]);
      setGroupByDim(defaultKey);
    }
  }, [commonKeys, selectedKeys.length]);

  // Reset the dirty flag whenever a fresh dataset is loaded — a new upload
  // invalidates any hand-edited SQL from the previous dataset anyway.
  useEffect(() => {
    setIsSqlDirty(false);
  }, [smtDataset, blazorDataset]);

  // Generate PostgreSQL JOIN statement dynamically from the controls above.
  // Skipped while the user has manually edited the SQL, so we never silently
  // clobber their edits when they touch a Join Type / Key / Case control.
  useEffect(() => {
    if (!smtDataset || !blazorDataset) {
      setGeneratedSql('-- Upload both SMT and Blazor datasets to build SQL query');
      return;
    }

    if (isSqlDirty) return;

    const sql = generateCalibrationSql(smtDataset, blazorDataset, {
      joinType,
      keys: selectedKeys,
      groupBy: groupByDim,
      caseId,
    });

    setGeneratedSql(sql);
  }, [smtDataset, blazorDataset, joinType, selectedKeys, groupByDim, caseId, isSqlDirty]);

  // Explicitly discard manual edits and resync SQL from the current controls
  const handleSyncSqlFromControls = () => {
    if (!smtDataset || !blazorDataset) return;
    const sql = generateCalibrationSql(smtDataset, blazorDataset, {
      joinType,
      keys: selectedKeys,
      groupBy: groupByDim,
      caseId,
    });
    setGeneratedSql(sql);
    setIsSqlDirty(false);
  };

  const handleKeyToggle = (key: string) => {
    setSelectedKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const handleExecute = () => {
    onExecuteJoin(generatedSql, {
      joinType,
      keys: selectedKeys,
      groupBy: groupByDim,
      caseId,
    });
  };

  if (!smtDataset || !blazorDataset) {
    return null;
  }

  return (
    <section className="cg-container" style={{ padding: '20px', marginBottom: '24px', backgroundColor: '#f8fafc' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2
            className="cg-title"
            style={{
              fontSize: '18px',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <GitMerge size={20} color="#ea580c" />
            DATABASE JOIN & CALIBRATION CONFIGURATION
          </h2>
          <p className="cg-subtitle" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>
            Configure PostgreSQL relational joins between <span style={{ color: '#2563eb' }}>smt_data</span> and{' '}
            <span style={{ color: '#9333ea' }}>blazor_data</span>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isSqlDirty && (
            <Tooltip content="SQL has been hand-edited and is no longer synced with the controls above.">
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#b91c1c',
                  backgroundColor: '#fef2f2',
                  border: '1.5px solid #b91c1c',
                  borderRadius: '6px',
                  padding: '3px 8px',
                }}
              >
                ⚠ Custom SQL
              </span>
            </Tooltip>
          )}
          <Tooltip content="Toggle raw PostgreSQL SQL query editor and viewer">
            <button
              className="cg-btn"
              style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: '#ffffff' }}
              onClick={() => setShowSqlEditor(!showSqlEditor)}
            >
              <Code size={14} />
              {showSqlEditor ? 'Hide SQL Code' : 'View SQL Code'}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Join Controls Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        {/* 1. Join Type Selection */}
        <div className="cg-card" style={{ padding: '14px', backgroundColor: '#ffffff' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
            1. POSTGRESQL JOIN TYPE:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {(
              [
                { id: 'INNER', label: 'INNER JOIN', tip: 'Returns records that have matching keys in both SMT and Blazor' },
                { id: 'LEFT', label: 'LEFT JOIN (SMT Base)', tip: 'Keeps all SMT records; Blazor columns will be NULL if no match' },
                { id: 'RIGHT', label: 'RIGHT JOIN (Blazor Base)', tip: 'Keeps all Blazor records; SMT columns will be NULL if no match' },
                { id: 'FULL OUTER', label: 'FULL OUTER JOIN', tip: 'Includes all records from both SMT and Blazor regardless of match' },
              ] as const
            ).map((jt) => (
              <Tooltip key={jt.id} content={jt.tip}>
                <button
                  className="cg-btn"
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '11px',
                    textAlign: 'center',
                    justifyContent: 'center',
                    backgroundColor: joinType === jt.id ? '#0d9488' : '#f8fafc',
                    color: joinType === jt.id ? '#ffffff' : '#0f172a',
                    fontWeight: joinType === jt.id ? 700 : 500,
                  }}
                  onClick={() => setJoinType(jt.id)}
                >
                  {jt.label}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* 2. Case / Scenario Filter */}
        {availableCases.length > 0 && (
          <div className="cg-card" style={{ padding: '14px', backgroundColor: '#ffffff' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} color="#2563eb" />
              2. SMT CASE_ID / SCENARIO:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {availableCases.map((c) => {
                const isSelected = caseId === c;
                const label = c === '270' ? 'Case 270 (Rows 17-31)' : c === '269' ? 'Case 269 (Rows 2-16)' : `Case ${c}`;
                return (
                  <Tooltip key={c} content={`Filter SMT schedule dataset for CASE_ID = '${c}'`}>
                    <button
                      className="cg-btn"
                      style={{
                        padding: '6px 12px',
                        fontSize: '11px',
                        fontWeight: isSelected ? 700 : 500,
                        backgroundColor: isSelected ? '#2563eb' : '#f1f5f9',
                        color: isSelected ? '#ffffff' : '#0f172a',
                      }}
                      onClick={() => setCaseId(c)}
                    >
                      {isSelected && <Check size={12} />}
                      {label}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Key Dimensions */}
        <div className="cg-card" style={{ padding: '14px', backgroundColor: '#ffffff' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
            3. JOIN KEY COLUMNS:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {commonKeys.length > 0 ? (
              commonKeys.map((key) => {
                const isSelected = selectedKeys.includes(key);
                return (
                  <Tooltip key={key} content={`Join on column '${key}' (ON s."${key}" = b."${key}")`}>
                    <button
                      className="cg-btn"
                      style={{
                        padding: '5px 10px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        backgroundColor: isSelected ? '#ea580c' : '#f1f5f9',
                        color: isSelected ? '#ffffff' : '#0f172a',
                        fontWeight: isSelected ? 700 : 500,
                      }}
                      onClick={() => handleKeyToggle(key)}
                    >
                      {isSelected && <Check size={12} />}
                      {key}
                    </button>
                  </Tooltip>
                );
              })
            ) : (
              <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                Auto-detected Period / Row Labels decoder mapping active
              </span>
            )}
          </div>
        </div>

        {/* 3. Execution Action */}
        <div
          className="cg-card"
          style={{
            padding: '14px',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
              3. EXECUTE CALIBRATION:
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
              Executes PostgreSQL SQL aggregation and automatically updates all 7 calibration graphs.
            </div>
          </div>

          <Tooltip content="Execute PostgreSQL query in-browser via PGlite and generate all 7 calibration graphs.">
            <button
              className="cg-btn cg-btn-primary"
              style={{
                width: '100%',
                padding: '10px 16px',
                fontSize: '14px',
                justifyContent: 'center',
                backgroundColor: '#ea580c',
                color: '#ffffff',
              }}
              disabled={isExecuting}
              onClick={handleExecute}
            >
              <Play size={16} />
              {isExecuting ? 'Querying PostgreSQL Engine...' : 'Run Join & Generate Graphs'}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* SQL Code Preview (Collapsible & Editable) */}
      {showSqlEditor && (
        <div
          style={{
            marginTop: '12px',
            border: '2px solid #000000',
            borderRadius: '8px',
            backgroundColor: '#0f172a',
            color: '#38bdf8',
            padding: '14px',
            fontFamily: 'Consolas, monospace',
            fontSize: '12px',
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <span>-- PostgreSQL Executable SQL Query (PGlite WASM)</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {isSqlDirty && (
                <Tooltip content="You've hand-edited this SQL, so the Join Type / Key / Case controls above no longer regenerate it. Click to discard your edits and resync from those controls.">
                  <button
                    className="cg-btn"
                    style={{ padding: '4px 10px', fontSize: '11px', backgroundColor: '#fef2f2', color: '#b91c1c', borderColor: '#b91c1c' }}
                    onClick={handleSyncSqlFromControls}
                  >
                    ⚠ Custom SQL — Sync from Controls
                  </button>
                </Tooltip>
              )}
              <Tooltip content="Execute this exact SQL query directly against the database to generate graphs">
                <button
                  className="cg-btn cg-btn-teal"
                  style={{ padding: '4px 10px', fontSize: '11px' }}
                  onClick={handleExecute}
                >
                  <Play size={12} />
                  Execute This SQL
                </button>
              </Tooltip>
            </div>
          </div>
          <textarea
            value={generatedSql}
            onChange={(e) => {
              setGeneratedSql(e.target.value);
              setIsSqlDirty(true);
            }}
            rows={10}
            style={{
              width: '100%',
              backgroundColor: '#090d16',
              color: '#38bdf8',
              fontFamily: 'Consolas, monospace',
              fontSize: '12px',
              lineHeight: 1.4,
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '10px',
            }}
          />
        </div>
      )}
    </section>
  );
};
