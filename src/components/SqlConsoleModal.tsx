import React, { useState } from 'react';
import { X, Play, Terminal, Clock, Copy, Check, Table, Sparkles } from 'lucide-react';
import { executeSql, generateBhpDecoderSql, QueryResult } from '../services/db';
import { Tooltip } from './Tooltip';

interface SqlConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyToCalibration?: (rows: Record<string, any>[], sql: string) => void;
}

export const SqlConsoleModal: React.FC<SqlConsoleModalProps> = ({
  isOpen,
  onClose,
  onApplyToCalibration,
}) => {
  const [sql, setSql] = useState<string>(`-- PostgreSQL 16 Interactive Query Console
SELECT 
  s.period,
  s.sum_of_crusher_haul_wet_tonnes AS smt_crusher,
  b.sum_of_crusher_haul_wet_tonnes AS blz_crusher,
  (b.sum_of_crusher_haul_wet_tonnes - s.sum_of_crusher_haul_wet_tonnes) AS delta_crusher
FROM smt_data s
INNER JOIN blazor_data b ON s.period = b.period
ORDER BY s.period
LIMIT 20;`);

  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleRunQuery = async () => {
    setIsExecuting(true);
    const res = await executeSql(sql);
    setQueryResult(res);
    setIsExecuting(false);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const PRESETS = [
    {
      // Sourced from generateBhpDecoderSql — the same function the app's
      // auto-generated join uses — so this preset can never drift out of
      // sync with the "real" query the way the old hardcoded copy did.
      name: 'Decoder Calibration Join (SMT vs Blasor)',
      query: generateBhpDecoderSql('270', 'INNER'),
    },
    {
      name: 'SMT Data (First 50)',
      query: `SELECT * FROM smt_data LIMIT 50;`,
    },
    {
      name: 'Blazor Data (First 50)',
      query: `SELECT * FROM blazor_data LIMIT 50;`,
    },
    {
      name: 'Crusher & Waste Haul Joins',
      query: `SELECT 
  s.period, 
  s.sum_of_crusher_haul_wet_tonnes AS smt_crusher, 
  b.sum_of_crusher_haul_wet_tonnes AS blz_crusher,
  s.sum_of_waste_haul_wet_tonnes AS smt_waste,
  b.sum_of_waste_haul_wet_tonnes AS blz_waste
FROM smt_data s
JOIN blazor_data b ON s.period = b.period
ORDER BY s.period;`,
    },
    {
      name: 'ExPit Ore & Stockpile Balance',
      query: `SELECT 
  s.period,
  s.sum_of_expit_ore_wet_tonnes AS smt_ore,
  b.sum_of_expit_ore_wet_tonnes AS blz_ore,
  s.sum_of_from_stockpile_wet_tonnes AS smt_reclaim,
  b.sum_of_from_stockpile_wet_tonnes AS blz_reclaim
FROM smt_data s
JOIN blazor_data b ON s.period = b.period
ORDER BY s.period;`,
    },
    {
      name: 'PostgreSQL Schema Columns',
      query: `SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
ORDER BY table_name, ordinal_position;`,
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        className="cg-container"
        style={{
          width: '100%',
          maxWidth: '1100px',
          maxHeight: '90vh',
          backgroundColor: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1.5px solid #0f172a',
            backgroundColor: '#f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Terminal size={22} color="#f7901e" />
            <div>
              <h2 className="cg-title" style={{ fontSize: '18px', margin: 0, color: '#f7901e' }}>
                PostgreSQL 16 Interactive Query Console (PGlite WASM)
              </h2>
              <div className="cg-subtitle" style={{ fontSize: '12px', margin: '2px 0 0 0', color: '#00a3a6' }}>
                Query tables 'smt_data' and 'blazor_data' directly with authentic PostgreSQL syntax
              </div>
            </div>
          </div>

          <Tooltip content="Close SQL console window">
            <button
              className="cg-btn"
              style={{ padding: '6px', borderRadius: '50%' }}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </Tooltip>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Preset Buttons */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
              QUERY TEMPLATES:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {PRESETS.map((p) => (
                <Tooltip key={p.name} content={`Load template: ${p.name}`}>
                  <button
                    className="cg-btn"
                    style={{ padding: '4px 10px', fontSize: '11px', backgroundColor: '#f8fafc' }}
                    onClick={() => setSql(p.query)}
                  >
                    <Table size={12} />
                    {p.name}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* SQL Editor Area */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>SQL Statement:</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Tooltip content="Copy SQL statement to clipboard">
                  <button
                    className="cg-btn"
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                    onClick={handleCopySql}
                  >
                    {copied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </Tooltip>

                <Tooltip content="Clear SQL query text editor">
                  <button
                    className="cg-btn"
                    style={{ padding: '3px 8px', fontSize: '11px' }}
                    onClick={() => setSql('')}
                  >
                    Clear
                  </button>
                </Tooltip>
              </div>
            </div>

            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              rows={7}
              className="cg-input"
              style={{
                width: '100%',
                fontFamily: 'Consolas, monospace',
                fontSize: '13px',
                lineHeight: 1.4,
                backgroundColor: '#090d16',
                color: '#38bdf8',
                borderColor: '#0f172a',
                padding: '12px',
                borderRadius: '8px',
              }}
            />
          </div>

          {/* Run Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <Tooltip content="Execute SQL query against embedded in-browser PostgreSQL instance">
                <button
                  className="cg-btn cg-btn-primary"
                  style={{ padding: '8px 18px', fontSize: '13px' }}
                  disabled={isExecuting || !sql.trim()}
                  onClick={handleRunQuery}
                >
                  <Play size={15} />
                  {isExecuting ? 'Running Query...' : 'Execute SQL'}
                </button>
              </Tooltip>

              {onApplyToCalibration && queryResult && !queryResult.error && queryResult.rows.length > 0 && (
                <Tooltip content="Apply this SQL query and its calibrated rows to the main Calibration Graphs & Diff Inspector.">
                  <button
                    className="cg-btn cg-btn-teal"
                    style={{ padding: '8px 16px', fontSize: '13px', backgroundColor: '#00a3a6', color: '#ffffff' }}
                    onClick={() => {
                      onApplyToCalibration(queryResult.rows, sql);
                      onClose();
                    }}
                  >
                    <Sparkles size={15} />
                    Apply Results to Calibration Graphs ({queryResult.rowCount} calibrated rows)
                  </button>
                </Tooltip>
              )}
            </div>

            {queryResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#475569' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={13} /> Duration: <strong>{queryResult.durationMs} ms</strong>
                </span>
                <span>
                  Rows: <strong>{queryResult.rowCount.toLocaleString()}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Results / Error Area */}
          {queryResult && (
            <div style={{ marginTop: '8px' }}>
              {queryResult.error ? (
                <div
                  style={{
                    backgroundColor: '#fee2e2',
                    border: '2px solid #b91c1c',
                    borderRadius: '8px',
                    padding: '12px',
                    color: '#991b1b',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                  }}
                >
                  <strong>PostgreSQL Error:</strong>
                  <div>{queryResult.error}</div>
                </div>
              ) : (
                <div
                  style={{
                    border: '2px solid #000000',
                    borderRadius: '8px',
                    maxHeight: '260px',
                    overflow: 'auto',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #000000' }}>
                        {queryResult.columns.map((c) => (
                          <th
                            key={c}
                            style={{
                              padding: '8px 12px',
                              textAlign: 'left',
                              borderRight: '1px solid #cbd5e1',
                              fontWeight: 700,
                              color: '#0f172a',
                            }}
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.map((row, idx) => (
                        <tr
                          key={idx}
                          style={{
                            backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                          }}
                        >
                          {queryResult.columns.map((c) => (
                            <td
                              key={c}
                              style={{
                                padding: '6px 12px',
                                borderRight: '1px solid #e2e8f0',
                                fontFamily: typeof row[c] === 'number' ? 'monospace' : 'inherit',
                                textAlign: typeof row[c] === 'number' ? 'right' : 'left',
                              }}
                            >
                              {row[c] !== null && row[c] !== undefined ? String(row[c]) : 'NULL'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
