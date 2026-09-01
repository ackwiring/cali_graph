import React, { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2, Trash2, FileText, Loader2 } from 'lucide-react';
import { ParsedDataset, TARGET_METRICS } from '../services/fileParser';
import { Tooltip } from './Tooltip';

interface DragDropCanvasProps {
  smtDataset: ParsedDataset | null;
  blazorDataset: ParsedDataset | null;
  isLoading: boolean;
  onFileUpload: (file: File, target: 'smt' | 'blazor') => Promise<void>;
  onClearDataset: (target: 'smt' | 'blazor') => void;
}

export const DragDropCanvas: React.FC<DragDropCanvasProps> = ({
  smtDataset,
  blazorDataset,
  isLoading,
  onFileUpload,
  onClearDataset,
}) => {
  const [isDragOverSmt, setIsDragOverSmt] = useState(false);
  const [isDragOverBlazor, setIsDragOverBlazor] = useState(false);

  const smtInputRef = useRef<HTMLInputElement | null>(null);
  const blazorInputRef = useRef<HTMLInputElement | null>(null);

  const handleDrop = async (e: React.DragEvent, target: 'smt' | 'blazor') => {
    e.preventDefault();
    if (target === 'smt') setIsDragOverSmt(false);
    if (target === 'blazor') setIsDragOverBlazor(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await onFileUpload(file, target);
    }
  };

  const handleDragOver = (e: React.DragEvent, target: 'smt' | 'blazor') => {
    e.preventDefault();
    if (target === 'smt') setIsDragOverSmt(true);
    if (target === 'blazor') setIsDragOverBlazor(true);
  };

  const handleDragLeave = (e: React.DragEvent, target: 'smt' | 'blazor') => {
    e.preventDefault();
    if (target === 'smt') setIsDragOverSmt(false);
    if (target === 'blazor') setIsDragOverBlazor(false);
  };

  const renderDropzone = (
    target: 'smt' | 'blazor',
    dataset: ParsedDataset | null,
    isDragOver: boolean,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) => {
    const isSmt = target === 'smt';
    const title = isSmt ? '1. Internal SMT Tool Output' : '2. Blazor Composite File';
    const subtitle = isSmt
      ? 'Exported mine schedule results from SMT (CSV, TSV, Parquet/TXT, XLSX, JSON)'
      : 'Composite mine schedule export from Blazor framework (CSV, XLSX, TSV, JSON)';
    const color = isSmt ? '#2563eb' : '#9333ea';
    const tableName = isSmt ? 'smt_data' : 'blazor_data';

    const matchedMetricsCount = dataset
      ? TARGET_METRICS.filter((m) => !!dataset.detectedMetrics[m.key]).length
      : 0;

    return (
      <div
        className="cg-container"
        style={{
          flex: 1,
          minWidth: '380px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: isDragOver ? '#e0f2fe' : '#f8fafc',
          borderColor: isDragOver ? color : '#000000',
          transition: 'all 0.2s ease',
        }}
        onDrop={(e) => handleDrop(e, target)}
        onDragOver={(e) => handleDragOver(e, target)}
        onDragLeave={(e) => handleDragLeave(e, target)}
      >
        <input
          type="file"
          ref={inputRef as any}
          style={{ display: 'none' }}
          accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsb,.json"
          onChange={async (e) => {
            if (e.target.files && e.target.files.length > 0) {
              await onFileUpload(e.target.files[0], target);
            }
          }}
        />

        {/* Card Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div>
            <h2
              className="cg-title"
              style={{
                fontSize: '18px',
                margin: 0,
                color: '#ea580c',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px',
                  backgroundColor: color,
                  border: '1.5px solid #000000',
                  display: 'inline-block',
                }}
              />
              {title}
            </h2>
            <p className="cg-subtitle" style={{ fontSize: '12px', margin: '3px 0 0 0' }}>
              {subtitle}
            </p>
          </div>

          <Tooltip content={`PostgreSQL database target table: public.${tableName}`}>
            <span
              style={{
                backgroundColor: '#ffffff',
                border: '1.5px solid #000000',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'monospace',
                color: '#0f172a',
              }}
            >
              tbl: {tableName}
            </span>
          </Tooltip>
        </div>

        {/* Dropzone / Upload State */}
        {!dataset ? (
          <div
            style={{
              flex: 1,
              minHeight: '190px',
              border: '2px dashed #000000',
              borderRadius: '10px',
              backgroundColor: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              textAlign: 'center',
              cursor: 'pointer',
            }}
            onClick={() => inputRef.current?.click()}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                backgroundColor: isDragOver ? '#bae6fd' : '#f1f5f9',
                border: '2px solid #000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              {isLoading ? <Loader2 size={28} color={color} /> : <UploadCloud size={28} color={color} />}
            </div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', marginBottom: '4px' }}>
              Drag & Drop file here or click to browse
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Supports CSV, TSV, TXT, Excel (.xlsx, .xls), and JSON
            </div>
            <Tooltip content={`Select file to parse and store into PostgreSQL table '${tableName}'`}>
              <button
                className="cg-btn"
                style={{
                  marginTop: '14px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  backgroundColor: '#f8fafc',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                Choose {isSmt ? 'SMT' : 'Blazor'} File
              </button>
            </Tooltip>
          </div>
        ) : (
          <div
            className="cg-card"
            style={{
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              flex: 1,
            }}
          >
            {/* File Info */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#ffffff',
                border: '1.5px solid #000000',
                borderRadius: '8px',
                padding: '10px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={22} color={color} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
                    {dataset.fileName}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {(dataset.fileSize / 1024).toFixed(1)} KB • {dataset.rows.length.toLocaleString()} rows •{' '}
                    {dataset.headers.length} columns
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tooltip content={`Replace current ${isSmt ? 'SMT' : 'Blazor'} file with a new upload.`}>
                  <button
                    className="cg-btn"
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                    onClick={() => inputRef.current?.click()}
                  >
                    Change File
                  </button>
                </Tooltip>

                <Tooltip content={`Remove ${isSmt ? 'SMT' : 'Blazor'} dataset and truncate PostgreSQL table '${tableName}'.`}>
                  <button
                    className="cg-btn"
                    style={{ padding: '4px 8px', fontSize: '11px', color: '#dc2626' }}
                    onClick={() => onClearDataset(target)}
                  >
                    <Trash2 size={13} />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Ingestion & Metrics Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #000000',
                  borderRadius: '6px',
                  padding: '8px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Postgres Status
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#16a34a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    marginTop: '2px',
                  }}
                >
                  <CheckCircle2 size={14} /> Ingested
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #000000',
                  borderRadius: '6px',
                  padding: '8px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Target Metrics
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: matchedMetricsCount === 7 ? '#16a34a' : '#ea580c',
                    marginTop: '2px',
                  }}
                >
                  {matchedMetricsCount} / 7 Detected
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #000000',
                  borderRadius: '6px',
                  padding: '8px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Candidate Keys
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0d9488', marginTop: '2px' }}>
                  {dataset.detectedKeys.length} Identified
                </div>
              </div>
            </div>

            {/* Target Metric Badges */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                DETECTED CALIBRATION METRICS:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {TARGET_METRICS.map((m) => {
                  const actualCol = dataset.detectedMetrics[m.key];
                  const isPresent = !!actualCol;
                  return (
                    <Tooltip
                      key={m.key}
                      content={
                        isPresent
                          ? `Mapped to column '${actualCol}' in PostgreSQL table '${tableName}'.`
                          : `Metric '${m.canonicalName}' not detected in this file.`
                      }
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '3px 7px',
                          borderRadius: '6px',
                          border: '1.5px solid #000000',
                          backgroundColor: isPresent ? '#ffffff' : '#f1f5f9',
                          color: isPresent ? '#0f172a' : '#94a3b8',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: isPresent ? 600 : 400,
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: isPresent ? m.color : '#cbd5e1',
                          }}
                        />
                        {m.shortName}
                        {isPresent ? ' ✓' : ' ✗'}
                      </span>
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            {/* Candidate Key Badges */}
            {dataset.detectedKeys.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  DETECTED JOIN DIMENSIONS:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {dataset.detectedKeys.map((k) => (
                    <Tooltip key={k} content={`Available dimension column for PostgreSQL JOIN operations: ${k}`}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid #000000',
                          backgroundColor: '#f1f5f9',
                          color: '#0d9488',
                          fontWeight: 600,
                          fontFamily: 'monospace',
                        }}
                      >
                        {k}
                      </span>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {renderDropzone('smt', smtDataset, isDragOverSmt, smtInputRef)}
        {renderDropzone('blazor', blazorDataset, isDragOverBlazor, blazorInputRef)}
      </div>
    </section>
  );
};
