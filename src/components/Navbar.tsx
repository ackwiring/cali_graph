import React from 'react';
import { FileSpreadsheet, PlayCircle, RefreshCw, Terminal, Download, Sparkles } from 'lucide-react';
import { Tooltip } from './Tooltip';
import qLogo from '../assets/q_logo.png';
import qsLogo from '../assets/qs_logo.png';

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
        borderBottom: '1.5px solid #0f172a',
        padding: '12px 24px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
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
        {/* Brand: Q Navicon, Title, and Subtitle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="q-navicon-badge" title="Quantified Strategies">
            <img src={qLogo} alt="Q Navicon" />
          </div>
          <div>
            <h1
              className="cg-title"
              style={{
                fontSize: '21px',
                margin: 0,
                lineHeight: 1.2,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              QS CALIBRATION GRAPHER
              <span
                style={{
                  fontSize: '11px',
                  backgroundColor: '#00a3a6',
                  color: '#ffffff',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid #0f172a',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Phase Analyser
              </span>
            </h1>
            <div
              className="cg-subtitle"
              style={{
                fontSize: '12.5px',
                marginTop: '2px',
                color: '#00a3a6',
              }}
            >
              SMT Tool Output vs. Blazor Composite Phase Analyser & Calibration
            </div>
          </div>
        </div>

        {/* Database & Data Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* DB Status Badge */}
          <Tooltip content="Embedded PostgreSQL 16 WebAssembly (PGlite) engine is active and ready in-memory / IndexedDB.">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                backgroundColor: '#f8fafc',
                border: '1.5px solid #0f172a',
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
                  backgroundColor: dbReady ? '#16a34a' : '#f7901e',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#0f172a' }}>PostgreSQL:</span>
              <span style={{ color: '#00a3a6', fontWeight: 700 }}>{dbReady ? 'Online (PGlite)' : 'Initializing...'}</span>
            </div>
          </Tooltip>

          {/* SMT Status Badge */}
          <Tooltip content="Current row count stored in PostgreSQL table 'smt_data'.">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                backgroundColor: smtCount > 0 ? '#eff6ff' : '#f8fafc',
                border: '1.5px solid #0f172a',
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
                padding: '5px 12px',
                backgroundColor: blazorCount > 0 ? '#faf5ff' : '#f8fafc',
                border: '1.5px solid #0f172a',
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
                padding: '5px 12px',
                backgroundColor: joinedCount > 0 ? '#f0fdf4' : '#f8fafc',
                border: '1.5px solid #0f172a',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <Sparkles size={14} color="#16a34a" />
              <span>Calibrated:</span>
              <span style={{ color: '#16a34a', fontWeight: 700 }}>{joinedCount.toLocaleString()} rows</span>
            </div>
          </Tooltip>
        </div>

        {/* Global Action Buttons & Corporate QS Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Sample Data Button */}
          <Tooltip content="Load pre-built realistic SMT & Blazor mining calibration datasets (24 periods, 3 pits, multi-case) with 1 click.">
            <button
              className="cg-btn cg-btn-primary"
              style={{ padding: '7px 13px', fontSize: '12.5px' }}
              onClick={onLoadSampleData}
            >
              <PlayCircle size={15} />
              Load Sample Data
            </button>
          </Tooltip>

          {/* SQL Console Button */}
          <Tooltip content="Open embedded PostgreSQL interactive SQL console to execute custom queries directly against 'smt_data' and 'blazor_data'.">
            <button
              className="cg-btn cg-btn-teal"
              style={{ padding: '7px 13px', fontSize: '12.5px' }}
              onClick={onOpenSqlConsole}
            >
              <Terminal size={15} />
              SQL Console
            </button>
          </Tooltip>

          {/* Export Joined CSV */}
          {joinedCount > 0 && (
            <Tooltip content="Export joined calibration dataset with all 7 metric comparisons and deltas as CSV.">
              <button
                className="cg-btn"
                style={{ padding: '7px 13px', fontSize: '12.5px', backgroundColor: '#f8fafc' }}
                onClick={onExportJoinedCsv}
              >
                <Download size={15} />
                Export CSV
              </button>
            </Tooltip>
          )}

          {/* Reset Button */}
          {(smtCount > 0 || blazorCount > 0) && (
            <Tooltip content="Clear all ingested datasets and reset embedded PostgreSQL tables.">
              <button
                className="cg-btn"
                style={{ padding: '7px 11px', fontSize: '12.5px', color: '#dc2626' }}
                onClick={onResetData}
              >
                <RefreshCw size={14} />
                Reset
              </button>
            </Tooltip>
          )}

          {/* Quantified Strategies Official Corporate Logo */}
          <div
            style={{
              paddingLeft: '10px',
              borderLeft: '1.5px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <img
              src={qsLogo}
              alt="Quantified Strategies"
              className="qs-logo-img"
              title="Quantified Strategies Corporate Tooling"
            />
          </div>
        </div>
      </div>
    </header>
  );
};
