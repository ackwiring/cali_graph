import React, { useState, useEffect } from 'react';
import { GitMerge, Play, Code, Check } from 'lucide-react';
import { ParsedDataset, TARGET_METRICS } from '../services/fileParser';
import { Tooltip } from './Tooltip';
import { sanitizeIdentifier } from '../services/db';

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL OUTER';

interface JoinBuilderProps {
  smtDataset: ParsedDataset | null;
  blazorDataset: ParsedDataset | null;
  onExecuteJoin: (sql: string, joinConfig: { joinType: JoinType; keys: string[]; groupBy: string }) => Promise<void>;
  isExecuting: boolean;
}

export const JoinBuilder: React.FC<JoinBuilderProps> = ({
  smtDataset,
  blazorDataset,
  onExecuteJoin,
  isExecuting,
}) => {
  const [joinType, setJoinType] = useState<JoinType>('INNER');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [groupByDim, setGroupByDim] = useState<string>('period');
  const [generatedSql, setGeneratedSql] = useState<string>('');
  const [showSqlEditor, setShowSqlEditor] = useState<boolean>(false);

  // Available common keys between SMT and Blazor
  const commonKeys = React.useMemo(() => {
    if (!smtDataset || !blazorDataset) return [];
    const smtClean = smtDataset.headers.map((h) => ({ orig: h, clean: sanitizeIdentifier(h) }));
    const blzClean = blazorDataset.headers.map((h) => ({ orig: h, clean: sanitizeIdentifier(h) }));

    const blzCleanNames = new Set(blzClean.map((b) => b.clean));
    return smtClean.filter((s) => blzCleanNames.has(s.clean)).map((s) => s.clean);
  }, [smtDataset, blazorDataset]);

  // Set initial default keys when datasets load
  useEffect(() => {
    if (commonKeys.length > 0 && selectedKeys.length === 0) {
      const priorityKeys = ['period', 'timestep', 'time', 'case_id', 'pit', 'bench'];
      const defaultKey = priorityKeys.find((k) => commonKeys.includes(k)) || commonKeys[0];
      setSelectedKeys([defaultKey]);
      setGroupByDim(defaultKey);
    }
  }, [commonKeys, selectedKeys.length]);

  // Generate PostgreSQL JOIN statement dynamically
  useEffect(() => {
    if (!smtDataset || !blazorDataset || selectedKeys.length === 0) {
      setGeneratedSql('-- Upload both SMT and Blazor datasets and select join keys to build SQL query');
      return;
    }

    const joinConditions = selectedKeys
      .map((k) => `s."${k}" = b."${k}"`)
      .join(' AND ');

    // Metrics SELECT clauses
    const metricSelects = TARGET_METRICS.map((m) => {
      const sCol = smtDataset.detectedMetrics[m.key] ? sanitizeIdentifier(smtDataset.detectedMetrics[m.key]) : null;
      const bCol = blazorDataset.detectedMetrics[m.key] ? sanitizeIdentifier(blazorDataset.detectedMetrics[m.key]) : null;

      const sSql = sCol ? `COALESCE(SUM(s."${sCol}"), 0)` : `0`;
      const bSql = bCol ? `COALESCE(SUM(b."${bCol}"), 0)` : `0`;

      return `  -- ${m.canonicalName}\n  ${sSql} AS "smt_${m.key}",\n  ${bSql} AS "blazor_${m.key}",\n  (${bSql} - ${sSql}) AS "delta_${m.key}"`;
    }).join(',\n');

    const keySelects = selectedKeys.map((k) => `COALESCE(s."${k}", b."${k}") AS "${k}"`).join(',\n  ');
    const groupClause = selectedKeys.map((k) => `COALESCE(s."${k}", b."${k}")`).join(', ');

    const sql = `SELECT
  ${keySelects},
${metricSelects}
FROM smt_data s
${joinType} JOIN blazor_data b
  ON ${joinConditions}
GROUP BY ${groupClause}
ORDER BY ${groupClause};`;

    setGeneratedSql(sql);
  }, [smtDataset, blazorDataset, joinType, selectedKeys, groupByDim]);

  const handleKeyToggle = (key: string) => {
    setSelectedKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev; // Keep at least one
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

        {/* 2. Key Dimensions */}
        <div className="cg-card" style={{ padding: '14px', backgroundColor: '#ffffff' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
            2. JOIN KEY COLUMNS (COMPOSITE KEYS):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {commonKeys.map((key) => {
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
            })}
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

      {/* SQL Code Preview (Collapsible) */}
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
            overflowX: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '6px' }}>
            <span>-- PostgreSQL Executable SQL Query (PGlite WASM)</span>
            <span style={{ color: '#0d9488' }}>Standard PostgreSQL 16</span>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#f8fafc' }}>{generatedSql}</pre>
        </div>
      )}
    </section>
  );
};
