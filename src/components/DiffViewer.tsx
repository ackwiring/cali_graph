import React, { useState, useMemo } from 'react';
import { Search, ArrowRightLeft, Columns } from 'lucide-react';
import { ParsedDataset, TARGET_METRICS } from '../services/fileParser';
import { extractMetricValue } from '../services/metricExtraction';
import { Tooltip } from './Tooltip';

interface DiffViewerProps {
  smtDataset: ParsedDataset | null;
  blazorDataset: ParsedDataset | null;
  joinKeys: string[];
  joinedRows?: Record<string, any>[];
}

type DiffStatus = 'ALL' | 'DIFF_ONLY' | 'MATCH_ONLY' | 'SMT_ONLY' | 'BLAZOR_ONLY';

export const DiffViewer: React.FC<DiffViewerProps> = ({
  smtDataset,
  blazorDataset,
  joinKeys,
  joinedRows = [],
}) => {
  const [filterStatus, setFilterStatus] = useState<DiffStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [tolerancePct, setTolerancePct] = useState<number>(0.1); // 0.1% tolerance
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Build key-matched diff rows
  const { diffRows, stats, allComparedColumns } = useMemo(() => {
    // If we have calibrated SQL joinedRows, build diff view directly from SQL results
    if (joinedRows && joinedRows.length > 0) {
      const firstRow = joinedRows[0];
      const dimKey = Object.keys(firstRow).find(k => /period|year|label/i.test(k)) || Object.keys(firstRow)[0] || 'period';

      const metricsToCompare = TARGET_METRICS.map((m) => ({
        key: m.key,
        name: m.shortName,
      }));

      let matches = 0;
      let diffs = 0;

      const rows = joinedRows.map((r, idx) => {
        const keyVal = r[dimKey] !== undefined && r[dimKey] !== null ? String(r[dimKey]) : `Row ${idx + 1}`;
        let hasSignificantDiff = false;
        let maxPct = 0;
        const metricDeltas: Record<string, { smtVal: number; blazorVal: number; delta: number; pctDiff: number; isDiff: boolean }> = {};

        metricsToCompare.forEach((m) => {
          const sVal = extractMetricValue(r, 'smt', m.key);
          const bVal = extractMetricValue(r, 'blazor', m.key);
          const delta = bVal - sVal;
          const base = Math.max(Math.abs(sVal), Math.abs(bVal));
          const pctDiff = base > 0 ? (Math.abs(delta) / base) * 100 : 0;
          const isDiff = pctDiff > tolerancePct && Math.abs(delta) >= 1;

          if (isDiff) hasSignificantDiff = true;
          if (pctDiff > maxPct) maxPct = pctDiff;

          metricDeltas[m.key] = {
            smtVal: sVal,
            blazorVal: bVal,
            delta,
            pctDiff,
            isDiff,
          };
        });

        if (hasSignificantDiff) {
          diffs++;
          return {
            key: keyVal,
            status: 'DIFF' as const,
            smtRow: r,
            blazorRow: r,
            metricDeltas,
            maxDeltaPct: maxPct,
          };
        } else {
          matches++;
          return {
            key: keyVal,
            status: 'MATCH' as const,
            smtRow: r,
            blazorRow: r,
            metricDeltas,
            maxDeltaPct: maxPct,
          };
        }
      });

      return {
        diffRows: rows,
        stats: {
          total: joinedRows.length,
          matches,
          diffs,
          smtOnly: 0,
          blazorOnly: 0,
        },
        allComparedColumns: metricsToCompare,
      };
    }

    if (!smtDataset || !blazorDataset) {
      return { diffRows: [], stats: { total: 0, matches: 0, diffs: 0, smtOnly: 0, blazorOnly: 0 }, allComparedColumns: [] };
    }

    const smtKeyCol = joinKeys.find((k) => smtDataset.headers.includes(k)) || smtDataset.detectedKeys[0] || smtDataset.headers[0];
    const blazorKeyCol = joinKeys.find((k) => blazorDataset.headers.includes(k)) || blazorDataset.detectedKeys[0] || blazorDataset.headers[0];

    // Determine target metrics to compare
    const metricsToCompare = TARGET_METRICS.map((m) => ({
      key: m.key,
      name: m.shortName,
      smtCol: smtDataset.detectedMetrics[m.key],
      blazorCol: blazorDataset.detectedMetrics[m.key],
    })).filter((m) => m.smtCol && m.blazorCol);

    const makeKey = (row: Record<string, any>, keyCol: string, secKey?: string) => {
      const p1 = row[keyCol] !== undefined ? String(row[keyCol]).trim() : '';
      const p2 = secKey && row[secKey] !== undefined ? String(row[secKey]).trim() : '';
      return p2 ? `${p1}_${p2}` : p1;
    };

    const secKeySmt = smtDataset.detectedKeys.find((k) => k !== smtKeyCol);
    const secKeyBlazor = blazorDataset.detectedKeys.find((k) => k !== blazorKeyCol);

    // Map SMT rows by key
    const smtKeyMap = new Map<string, Record<string, any>>();
    smtDataset.rows.forEach((r, idx) => {
      const k = smtKeyCol ? makeKey(r, smtKeyCol, secKeySmt) : `row_${idx}`;
      smtKeyMap.set(k, r);
    });

    // Map Blazor rows by key
    const blazorKeyMap = new Map<string, Record<string, any>>();
    blazorDataset.rows.forEach((r, idx) => {
      const k = blazorKeyCol ? makeKey(r, blazorKeyCol, secKeyBlazor) : `row_${idx}`;
      blazorKeyMap.set(k, r);
    });

    const allKeys = Array.from(new Set([...smtKeyMap.keys(), ...blazorKeyMap.keys()]));

    let matches = 0;
    let diffs = 0;
    let smtOnly = 0;
    let blazorOnly = 0;

    const rows = allKeys.map((key) => {
      const smtRow = smtKeyMap.get(key);
      const blazorRow = blazorKeyMap.get(key);

      if (smtRow && !blazorRow) {
        smtOnly++;
        return {
          key,
          status: 'SMT_ONLY' as const,
          smtRow,
          blazorRow: null,
          metricDeltas: {},
          maxDeltaPct: 0,
        };
      }

      if (!smtRow && blazorRow) {
        blazorOnly++;
        return {
          key,
          status: 'BLAZOR_ONLY' as const,
          smtRow: null,
          blazorRow,
          metricDeltas: {},
          maxDeltaPct: 0,
        };
      }

      // Both exist -> compare metric columns
      let hasSignificantDiff = false;
      let maxPct = 0;
      const metricDeltas: Record<string, { smtVal: number; blazorVal: number; delta: number; pctDiff: number; isDiff: boolean }> = {};

      metricsToCompare.forEach((m) => {
        const sCol = (m as any).smtCol;
        const bCol = (m as any).blazorCol;
        const sVal = sCol ? Number(smtRow![sCol]) || 0 : 0;
        const bVal = bCol ? Number(blazorRow![bCol]) || 0 : 0;
        const delta = bVal - sVal;
        const base = Math.max(Math.abs(sVal), Math.abs(bVal));
        const pctDiff = base > 0 ? (Math.abs(delta) / base) * 100 : 0;
        const isDiff = pctDiff > tolerancePct && Math.abs(delta) >= 1;

        if (isDiff) hasSignificantDiff = true;
        if (pctDiff > maxPct) maxPct = pctDiff;

        metricDeltas[m.key] = {
          smtVal: sVal,
          blazorVal: bVal,
          delta,
          pctDiff,
          isDiff,
        };
      });

      if (hasSignificantDiff) {
        diffs++;
        return {
          key,
          status: 'DIFF' as const,
          smtRow,
          blazorRow,
          metricDeltas,
          maxDeltaPct: maxPct,
        };
      } else {
        matches++;
        return {
          key,
          status: 'MATCH' as const,
          smtRow,
          blazorRow,
          metricDeltas,
          maxDeltaPct: maxPct,
        };
      }
    });

    return {
      diffRows: rows,
      stats: {
        total: allKeys.length,
        matches,
        diffs,
        smtOnly,
        blazorOnly,
      },
      allComparedColumns: metricsToCompare,
    };
  }, [smtDataset, blazorDataset, joinKeys, tolerancePct, joinedRows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return diffRows.filter((r) => {
      // Status filter
      if (filterStatus === 'DIFF_ONLY' && r.status !== 'DIFF') return false;
      if (filterStatus === 'MATCH_ONLY' && r.status !== 'MATCH') return false;
      if (filterStatus === 'SMT_ONLY' && r.status !== 'SMT_ONLY') return false;
      if (filterStatus === 'BLAZOR_ONLY' && r.status !== 'BLAZOR_ONLY') return false;


      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const keyMatch = r.key.toLowerCase().includes(q);
        const smtMatch = r.smtRow ? JSON.stringify(r.smtRow).toLowerCase().includes(q) : false;
        const blzMatch = r.blazorRow ? JSON.stringify(r.blazorRow).toLowerCase().includes(q) : false;
        return keyMatch || smtMatch || blzMatch;
      }

      return true;
    });
  }, [diffRows, filterStatus, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  if (!smtDataset || !blazorDataset) {
    return (
      <div
        className="cg-container"
        style={{
          padding: '40px 20px',
          textAlign: 'center',
          backgroundColor: '#f8fafc',
          marginBottom: '24px',
        }}
      >
        <ArrowRightLeft size={36} color="#64748b" style={{ margin: '0 auto 12px auto' }} />
        <h3 className="cg-title" style={{ fontSize: '18px', margin: 0 }}>
          Side-by-Side Diff Inspector Waiting for Files
        </h3>
        <p className="cg-subtitle" style={{ fontSize: '13px', marginTop: '6px' }}>
          Upload both SMT Tool Output and Blazor Composite file above to view side-by-side cell comparison.
        </p>
      </div>
    );
  }

  return (
    <section className="cg-container" style={{ padding: '20px', marginBottom: '24px', backgroundColor: '#ffffff' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
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
            <Columns size={20} color="#ea580c" />
            SIDE-BY-SIDE FILE DIFF INSPECTOR (DFDIFF)
          </h2>
          <p className="cg-subtitle" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>
            Synchronized comparison of SMT Output ({smtDataset.rows.length} rows) vs. Blazor Composite ({blazorDataset.rows.length} rows)
          </p>
        </div>

        {/* Diff KPI Badges */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Tooltip content="Total matched record keys across both datasets.">
            <span
              style={{
                backgroundColor: '#f1f5f9',
                border: '1.5px solid #000000',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              Total Keys: <strong>{stats.total.toLocaleString()}</strong>
            </span>
          </Tooltip>

          <Tooltip content="Rows where SMT and Blazor values match within tolerance threshold.">
            <span
              style={{
                backgroundColor: '#f0fdf4',
                color: '#16a34a',
                border: '1.5px solid #000000',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              ✓ Matches: {stats.matches.toLocaleString()}
            </span>
          </Tooltip>

          <Tooltip content="Rows with calibration discrepancies exceeding tolerance threshold.">
            <span
              style={{
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                border: '1.5px solid #000000',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              ⚠ Discrepancies: {stats.diffs.toLocaleString()}
            </span>
          </Tooltip>

          {stats.smtOnly > 0 && (
            <Tooltip content="Records present in SMT output but missing in Blazor composite.">
              <span
                style={{
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  border: '1.5px solid #000000',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                SMT Only: {stats.smtOnly}
              </span>
            </Tooltip>
          )}

          {stats.blazorOnly > 0 && (
            <Tooltip content="Records present in Blazor composite but missing in SMT output.">
              <span
                style={{
                  backgroundColor: '#faf5ff',
                  color: '#9333ea',
                  border: '1.5px solid #000000',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                Blazor Only: {stats.blazorOnly}
              </span>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Control Bar: Filters, Search, Tolerance */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: '#f8fafc',
          border: '1.5px solid #000000',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '14px',
        }}
      >
        {/* Status Filter Buttons */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(
            [
              { id: 'ALL', label: 'All Rows' },
              { id: 'DIFF_ONLY', label: 'Discrepancies Only' },
              { id: 'MATCH_ONLY', label: 'Matches Only' },
              { id: 'SMT_ONLY', label: 'SMT Only' },
              { id: 'BLAZOR_ONLY', label: 'Blazor Only' },
            ] as const
          ).map((st) => (
            <Tooltip key={st.id} content={`Filter diff table to view ${st.label.toLowerCase()}`}>
              <button
                className="cg-btn"
                style={{
                  padding: '5px 10px',
                  fontSize: '12px',
                  backgroundColor: filterStatus === st.id ? '#0d9488' : '#ffffff',
                  color: filterStatus === st.id ? '#ffffff' : '#0f172a',
                  borderColor: '#000000',
                }}
                onClick={() => {
                  setFilterStatus(st.id);
                  setPage(1);
                }}
              >
                {st.label}
              </button>
            </Tooltip>
          ))}
        </div>

        {/* Tolerance & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Tolerance Input */}
          <Tooltip content="Minimum percentage difference between SMT and Blazor to flag cell as a discrepancy.">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600 }}>
              <span>Tolerance:</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={tolerancePct}
                onChange={(e) => setTolerancePct(parseFloat(e.target.value) || 0)}
                className="cg-input"
                style={{ width: '64px', padding: '4px 6px', fontSize: '12px' }}
              />
              <span>%</span>
            </div>
          </Tooltip>

          {/* Search Box */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} color="#64748b" style={{ position: 'absolute', left: '10px' }} />
            <input
              type="text"
              placeholder="Search key or values..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="cg-input"
              style={{ paddingLeft: '28px', paddingRight: '10px', fontSize: '12px', width: '180px' }}
            />
          </div>
        </div>
      </div>

      {/* Synchronized Diff Table */}
      <div
        style={{
          border: '2px solid #000000',
          borderRadius: '8px',
          overflowX: 'auto',
          backgroundColor: '#ffffff',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            {/* Master Header Level */}
            <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #000000' }}>
              <th
                rowSpan={2}
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  borderRight: '2px solid #000000',
                  width: '180px',
                  fontWeight: 800,
                  color: '#0f172a',
                }}
              >
                Key / Dimension
              </th>
              <th
                rowSpan={2}
                style={{
                  padding: '10px 12px',
                  textAlign: 'center',
                  borderRight: '2px solid #000000',
                  width: '90px',
                  fontWeight: 800,
                  color: '#0f172a',
                }}
              >
                Diff Status
              </th>

              {allComparedColumns.map((col) => (
                <th
                  key={col.key}
                  colSpan={3}
                  style={{
                    padding: '8px',
                    textAlign: 'center',
                    borderRight: '2px solid #000000',
                    backgroundColor: '#e2e8f0',
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                >
                  <Tooltip content={`Comparing metric: ${col.name}`}>
                    <span>{col.name}</span>
                  </Tooltip>
                </th>
              ))}
            </tr>

            {/* Sub-header Level: SMT vs Blazor vs Delta */}
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #000000', fontSize: '11px' }}>
              {allComparedColumns.map((col) => (
                <React.Fragment key={`${col.key}-sub`}>
                  <th style={{ padding: '6px 8px', textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>SMT</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', color: '#9333ea', fontWeight: 700 }}>Blazor</th>
                  <th
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      color: '#ea580c',
                      fontWeight: 700,
                      borderRight: '2px solid #000000',
                    }}
                  >
                    Δ (Delta)
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + allComparedColumns.length * 3}
                  style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}
                >
                  No matching records found for the selected filter criteria.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, idx) => {
                const isEven = idx % 2 === 0;
                return (
                  <tr
                    key={row.key}
                    style={{
                      backgroundColor:
                        row.status === 'DIFF'
                          ? '#fff1f2'
                          : row.status === 'SMT_ONLY'
                          ? '#eff6ff'
                          : row.status === 'BLAZOR_ONLY'
                          ? '#faf5ff'
                          : isEven
                          ? '#ffffff'
                          : '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    {/* Key Column */}
                    <td
                      style={{
                        padding: '8px 12px',
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        borderRight: '2px solid #000000',
                        color: '#0f172a',
                      }}
                    >
                      {row.key}
                    </td>

                    {/* Status Badge */}
                    <td
                      style={{
                        padding: '8px 10px',
                        textAlign: 'center',
                        borderRight: '2px solid #000000',
                      }}
                    >
                      {row.status === 'MATCH' && (
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#dcfce7',
                            color: '#15803d',
                            fontWeight: 700,
                            fontSize: '11px',
                          }}
                        >
                          Match
                        </span>
                      )}
                      {row.status === 'DIFF' && (
                        <Tooltip content={`Max variance across metrics: ${row.maxDeltaPct.toFixed(1)}%`}>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#fee2e2',
                              color: '#b91c1c',
                              fontWeight: 700,
                              fontSize: '11px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                            }}
                          >
                            Δ {row.maxDeltaPct.toFixed(1)}%
                          </span>
                        </Tooltip>
                      )}
                      {row.status === 'SMT_ONLY' && (
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#dbeafe',
                            color: '#1d4ed8',
                            fontWeight: 700,
                            fontSize: '11px',
                          }}
                        >
                          SMT Only
                        </span>
                      )}
                      {row.status === 'BLAZOR_ONLY' && (
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#f3e8ff',
                            color: '#7e22ce',
                            fontWeight: 700,
                            fontSize: '11px',
                          }}
                        >
                          Blazor Only
                        </span>
                      )}
                    </td>

                    {/* Metric Columns */}
                    {allComparedColumns.map((col) => {
                      const deltaInfo = (row.metricDeltas as any)[col.key];

                      if (!deltaInfo) {
                        return (
                          <React.Fragment key={`${row.key}-${col.key}`}>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>-</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>-</td>
                            <td
                              style={{
                                padding: '8px',
                                textAlign: 'right',
                                color: '#94a3b8',
                                borderRight: '2px solid #000000',
                              }}
                            >
                              -
                            </td>
                          </React.Fragment>
                        );
                      }

                      return (
                        <React.Fragment key={`${row.key}-${col.key}`}>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {deltaInfo.smtVal.toLocaleString()}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {deltaInfo.blazorVal.toLocaleString()}
                          </td>
                          <td
                            style={{
                              padding: '8px',
                              textAlign: 'right',
                              fontFamily: 'monospace',
                              fontWeight: deltaInfo.isDiff ? 700 : 400,
                              color: deltaInfo.isDiff ? '#dc2626' : '#16a34a',
                              backgroundColor: deltaInfo.isDiff ? '#fef2f2' : 'transparent',
                              borderRight: '2px solid #000000',
                            }}
                          >
                            <Tooltip
                              content={`SMT: ${deltaInfo.smtVal.toLocaleString()} | Blazor: ${deltaInfo.blazorVal.toLocaleString()} | Delta: ${deltaInfo.delta.toLocaleString()} (${deltaInfo.pctDiff.toFixed(2)}%)`}
                            >
                              <span>
                                {deltaInfo.delta > 0 ? `+${deltaInfo.delta.toLocaleString()}` : deltaInfo.delta.toLocaleString()}
                              </span>
                            </Tooltip>
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '12px',
          fontSize: '12px',
          color: '#475569',
        }}
      >
        <div>
          Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredRows.length)} of{' '}
          {filteredRows.length} filtered rows ({diffRows.length} total)
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <Tooltip content="Previous page of diff table.">
            <button
              className="cg-btn"
              style={{ padding: '4px 10px', fontSize: '11px' }}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
          </Tooltip>

          <span style={{ padding: '4px 8px', fontWeight: 600 }}>
            Page {page} of {totalPages}
          </span>

          <Tooltip content="Next page of diff table.">
            <button
              className="cg-btn"
              style={{ padding: '4px 10px', fontSize: '11px' }}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </Tooltip>
        </div>
      </div>
    </section>
  );
};
