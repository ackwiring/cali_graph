import React from 'react';
import { Database, FileSpreadsheet, PlayCircle, RefreshCw, Terminal, Download, Sparkles } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface NavbarProps {
  smtCount: number;
  blazorCount: number;
  joinedCount: number;
  dbReady: boolean;
  onLoadSampleData: () => void;
  onOpenSqlConsole: () => void;
  onResetData: () => void;
  onExportJoinedCsv: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  smtCount,
  blazorCount,
  joinedCount,
  dbReady,
  onLoadSampleData,
  onOpenSqlConsole,
  onResetData,
  onExportJoinedCsv,
}) => {
  return (
    <header
      style={{
        backgroundColor: '#ffffff',
        borderBottom: '2px solid #000000',
        padding: '14px 24px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      }}
    >
      <div
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        {/* Title and Subtitle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              backgroundColor: '#ea580c',
              border: '2px solid #000000',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '2px 2px 0px #000000',
            }}
          >
            <Database size={24} />
          </div>
          <div>
            <h1
              className="cg-title"
              style={{
                fontSize: '22px',
                margin: 0,
                lineHeight: 1.2,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              CALIBRATION GRAPHER
              <span
                style={{
                  fontSize: '11px',
                  backgroundColor: '#0d9488',
                  color: '#ffffff',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1.5px solid #000000',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                PostgreSQL Engine
              </span>
            </h1>
            <div
              className="cg-subtitle"
              style={{
                fontSize: '13px',
                marginTop: '2px',
              }}
            >
              SMT Tool Output vs. Blazor Composite Mine Schedule Calibration
            </div>
          </div>
        </div>

        {/* Database & Data Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* DB Status Badge */}
          <Tooltip content="Embedded PostgreSQL 16 WebAssembly (PGlite) engine is active and ready in-memory / IndexedDB.">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: '#f1f5f9',
                border: '2px solid #000000',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: dbReady ? '#16a34a' : '#ea580c',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#0f172a' }}>PostgreSQL:</span>
              <span style={{ color: '#0d9488' }}>{dbReady ? 'Online (PGlite)' : 'Initializing...'}</span>
            </div>
          </Tooltip>

          {/* SMT Status Badge */}
          <Tooltip content="Current row count stored in PostgreSQL table 'smt_data'.">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: smtCount > 0 ? '#eff6ff' : '#f8fafc',
                border: '2px solid #000000',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <FileSpreadsheet size={14} color="#2563eb" />
              <span>SMT Data:</span>
              <span style={{ color: '#2563eb', fontWeight: 700 }}>{smtCount.toLocaleString()} rows</span>
            </div>
          </Tooltip>

          {/* Blazor Status Badge */}
          <Tooltip content="Current row count stored in PostgreSQL table 'blazor_data'.">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: blazorCount > 0 ? '#faf5ff' : '#f8fafc',
                border: '2px solid #000000',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <FileSpreadsheet size={14} color="#9333ea" />
              <span>Blazor Data:</span>
              <span style={{ color: '#9333ea', fontWeight: 700 }}>{blazorCount.toLocaleString()} rows</span>
            </div>
          </Tooltip>

          {/* Joined Status Badge */}
          <Tooltip content="Number of matched rows from joined calibration SQL query.">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: joinedCount > 0 ? '#f0fdf4' : '#f8fafc',
                border: '2px solid #000000',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <Sparkles size={14} color="#16a34a" />
              <span>Joined:</span>
              <span style={{ color: '#16a34a', fontWeight: 700 }}>{joinedCount.toLocaleString()} calibrated</span>
            </div>
          </Tooltip>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Sample Data Button */}
          <Tooltip content="Load pre-built realistic SMT & Blazor mining calibration datasets (24 periods, 3 pits, multi-case) with 1 click.">
            <button
              className="cg-btn cg-btn-primary"
              style={{ padding: '8px 14px', fontSize: '13px' }}
              onClick={onLoadSampleData}
            >
              <PlayCircle size={16} />
              Load Sample Data
            </button>
          </Tooltip>

          {/* SQL Console Button */}
          <Tooltip content="Open embedded PostgreSQL interactive SQL console to execute custom queries directly against 'smt_data' and 'blazor_data'.">
            <button
              className="cg-btn cg-btn-teal"
              style={{ padding: '8px 14px', fontSize: '13px' }}
              onClick={onOpenSqlConsole}
            >
              <Terminal size={16} />
              SQL Console
            </button>
          </Tooltip>

          {/* Export Joined CSV */}
          {joinedCount > 0 && (
            <Tooltip content="Export joined calibration dataset with all 7 metric comparisons and deltas as CSV.">
              <button
                className="cg-btn"
                style={{ padding: '8px 14px', fontSize: '13px', backgroundColor: '#f8fafc' }}
                onClick={onExportJoinedCsv}
              >
                <Download size={16} />
                Export Joined CSV
              </button>
            </Tooltip>
          )}

          {/* Reset Button */}
          {(smtCount > 0 || blazorCount > 0) && (
            <Tooltip content="Clear all ingested datasets and reset embedded PostgreSQL tables.">
              <button
                className="cg-btn"
                style={{ padding: '8px 12px', fontSize: '13px', color: '#dc2626' }}
                onClick={onResetData}
              >
                <RefreshCw size={15} />
                Reset
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </header>
  );
};
