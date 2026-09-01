import React, { useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line, Scatter } from 'react-chartjs-2';
import { BarChart3, LineChart, Activity, TrendingUp, Sparkles } from 'lucide-react';
import { TARGET_METRICS } from '../services/fileParser';
import { Tooltip } from './Tooltip';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

interface CalibrationGraphsProps {
  joinedRows: Record<string, any>[];
  joinDimensionKey: string;
}

type ChartMode = 'BAR' | 'LINE' | 'DELTA' | 'PARITY';

export const CalibrationGraphs: React.FC<CalibrationGraphsProps> = ({
  joinedRows,
  joinDimensionKey,
}) => {
  const [selectedMetricKey, setSelectedMetricKey] = useState<string>('ALL');
  const [chartMode, setChartMode] = useState<ChartMode>('BAR');

  if (!joinedRows || joinedRows.length === 0) {
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
        <BarChart3 size={36} color="#64748b" style={{ margin: '0 auto 12px auto' }} />
        <h3 className="cg-title" style={{ fontSize: '18px', margin: 0 }}>
          Calibration Graphs Ready to Generate
        </h3>
        <p className="cg-subtitle" style={{ fontSize: '13px', marginTop: '6px' }}>
          Select join keys and click 'Run Join & Generate Graphs' above to view the 7 calibration metric graphs.
        </p>
      </div>
    );
  }

function extractMetricValue(row: Record<string, any>, prefix: 'smt' | 'blazor', metricKey: string): number {
  const shortAliases: Record<string, string[]> = {
    crusher_haul_wet_tonnes: ['crusher_haul_wet_tonnes', 'crusher_haul', 'crusher', 'crusher_haul_wt'],
    waste_haul_wet_tonnes: ['waste_haul_wet_tonnes', 'waste_haul', 'waste', 'waste_haul_wt'],
    total_expit_haul_wet_tonnes: ['total_expit_haul_wet_tonnes', 'total_expit_haul', 'total_expit', 'expit_haul', 'expit', 'total_expit_haul_wt'],
    expit_ore_wet_tonnes: ['expit_ore_wet_tonnes', 'expit_ore', 'ore_expit', 'expit_ore_wt'],
    from_stockpile_wet_tonnes: ['from_stockpile_wet_tonnes', 'from_stockpile', 'from_sp', 'from_stockpile_wt'],
    conveyor_from_min_cmn: ['conveyor_from_min_cmn', 'conveyor_min_cmn', 'conveyor', 'conveyor_from_min_cmn_wt'],
    to_stockpile_wet_tonnes: ['to_stockpile_wet_tonnes', 'to_stockpile', 'to_sp', 'to_stockpile_wt'],
  };

  const prefixes = prefix === 'smt' ? ['smt_', 'smt'] : ['blazor_', 'blz_', 'blazor', 'blz'];
  const aliases = shortAliases[metricKey] || [metricKey];

  for (const p of prefixes) {
    for (const a of aliases) {
      const fullKey = `${p}${a}`;
      if (row[fullKey] !== undefined && row[fullKey] !== null) {
        return Number(row[fullKey]) || 0;
      }
    }
  }

  // Case-insensitive check across row keys
  for (const k of Object.keys(row)) {
    const kLow = k.toLowerCase();
    for (const p of prefixes) {
      if (kLow.startsWith(p)) {
        for (const a of aliases) {
          if (kLow.includes(a)) {
            return Number(row[k]) || 0;
          }
        }
      }
    }
  }

  return 0;
}

  // Dimension labels
  const firstRow = joinedRows[0] || {};
  const dimKey =
    joinDimensionKey in firstRow
      ? joinDimensionKey
      : Object.keys(firstRow).find((k) => /period|year|label/i.test(k)) || Object.keys(firstRow)[0] || 'period';

  const labels = joinedRows.map((r, i) => {
    const val = r[dimKey];
    return val !== undefined && val !== null ? `${val}` : `Period ${i + 1}`;
  });

  // Calculate statistics for each metric
  const metricStats = TARGET_METRICS.map((metric) => {
    const smtValues = joinedRows.map((r) => extractMetricValue(r, 'smt', metric.key));
    const blzValues = joinedRows.map((r) => extractMetricValue(r, 'blazor', metric.key));
    const deltas = joinedRows.map((_, idx) => blzValues[idx] - smtValues[idx]);

    const totalSmt = smtValues.reduce((a, b) => a + b, 0);
    const totalBlz = blzValues.reduce((a, b) => a + b, 0);
    const totalDelta = totalBlz - totalSmt;
    const totalPctDiff = totalSmt > 0 ? (totalDelta / totalSmt) * 100 : 0;

    // Calculate R-squared for parity
    let rSquared = 1.0;
    if (smtValues.length > 1) {
      const meanS = totalSmt / smtValues.length;
      const meanB = totalBlz / blzValues.length;
      let num = 0;
      let denS = 0;
      let denB = 0;
      for (let i = 0; i < smtValues.length; i++) {
        const ds = smtValues[i] - meanS;
        const db = blzValues[i] - meanB;
        num += ds * db;
        denS += ds * ds;
        denB += db * db;
      }
      const r = denS > 0 && denB > 0 ? num / Math.sqrt(denS * denB) : 1;
      rSquared = Math.max(0, Math.min(1, r * r));
    }

    return {
      metric,
      smtValues,
      blzValues,
      deltas,
      totalSmt,
      totalBlz,
      totalDelta,
      totalPctDiff,
      rSquared,
    };
  });

  const renderSingleGraph = (stat: (typeof metricStats)[0]) => {
    const { metric, smtValues, blzValues, deltas, totalSmt, totalBlz, totalDelta, totalPctDiff, rSquared } = stat;

    // Prepare chart data based on mode
    let chartComponent = null;

    if (chartMode === 'BAR') {
      const data = {
        labels,
        datasets: [
          {
            label: 'SMT Tool Output',
            data: smtValues,
            backgroundColor: '#2563eb',
            borderColor: '#000000',
            borderWidth: 1.5,
            borderRadius: 4,
          },
          {
            label: 'Blazor Composite',
            data: blzValues,
            backgroundColor: '#9333ea',
            borderColor: '#000000',
            borderWidth: 1.5,
            borderRadius: 4,
          },
        ],
      };

      const options: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' as const, labels: { font: { weight: 'bold' } } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} Tonnes`,
            },
          },
        },
        scales: {
          y: {
            ticks: { callback: (val: any) => Number(val).toLocaleString() },
            title: { display: true, text: 'Wet Tonnes', font: { weight: 'bold' } },
          },
        },
      };

      chartComponent = <Bar data={data} options={options} />;
    } else if (chartMode === 'LINE') {
      const data = {
        labels,
        datasets: [
          {
            label: 'SMT Tool Output',
            data: smtValues,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.2,
            pointRadius: 4,
            pointBackgroundColor: '#2563eb',
            pointBorderColor: '#000000',
            pointBorderWidth: 1.5,
          },
          {
            label: 'Blazor Composite',
            data: blzValues,
            borderColor: '#9333ea',
            backgroundColor: 'rgba(147, 51, 234, 0.1)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.2,
            pointRadius: 4,
            pointBackgroundColor: '#9333ea',
            pointBorderColor: '#000000',
            pointBorderWidth: 1.5,
          },
        ],
      };

      const options: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' as const, labels: { font: { weight: 'bold' } } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} Tonnes`,
            },
          },
        },
        scales: {
          y: {
            ticks: { callback: (val: any) => Number(val).toLocaleString() },
            title: { display: true, text: 'Wet Tonnes', font: { weight: 'bold' } },
          },
        },
      };

      chartComponent = <Line data={data} options={options} />;
    } else if (chartMode === 'DELTA') {
      const data = {
        labels,
        datasets: [
          {
            label: 'Variance Δ (Blazor - SMT)',
            data: deltas,
            backgroundColor: deltas.map((d) => (d >= 0 ? '#16a34a' : '#dc2626')),
            borderColor: '#000000',
            borderWidth: 1.5,
            borderRadius: 4,
          },
        ],
      };

      const options: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' as const, labels: { font: { weight: 'bold' } } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => `Variance Δ: ${ctx.raw > 0 ? '+' : ''}${ctx.raw.toLocaleString()} Tonnes`,
            },
          },
        },
        scales: {
          y: {
            ticks: { callback: (val: any) => Number(val).toLocaleString() },
            title: { display: true, text: 'Delta (Wet Tonnes)', font: { weight: 'bold' } },
          },
        },
      };

      chartComponent = <Bar data={data} options={options} />;
    } else if (chartMode === 'PARITY') {
      const scatterPoints = smtValues.map((s, idx) => ({ x: s, y: blzValues[idx], label: labels[idx] }));
      const maxVal = Math.max(...smtValues, ...blzValues);

      const data = {
        datasets: [
          {
            label: 'Actual Calibration Points (SMT vs Blazor)',
            data: scatterPoints,
            backgroundColor: '#ea580c',
            borderColor: '#000000',
            borderWidth: 1.5,
            pointRadius: 6,
          },
          {
            type: 'line' as const,
            label: 'Ideal 45° Parity Line (y = x)',
            data: [
              { x: 0, y: 0 },
              { x: maxVal, y: maxVal },
            ],
            borderColor: '#0d9488',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          },
        ],
      };

      const options: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' as const, labels: { font: { weight: 'bold' } } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => `SMT: ${ctx.raw.x?.toLocaleString()} | Blazor: ${ctx.raw.y?.toLocaleString()}`,
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: 'SMT Tool Wet Tonnes', font: { weight: 'bold' } },
            ticks: { callback: (val: any) => Number(val).toLocaleString() },
          },
          y: {
            title: { display: true, text: 'Blazor Composite Wet Tonnes', font: { weight: 'bold' } },
            ticks: { callback: (val: any) => Number(val).toLocaleString() },
          },
        },
      };

      chartComponent = <Scatter data={data as any} options={options} />;
    }

    return (
      <div
        key={metric.key}
        className="cg-container"
        style={{
          padding: '18px',
          backgroundColor: '#ffffff',
          marginBottom: '20px',
        }}
      >
        {/* Metric Title & Subtitle */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '12px',
          }}
        >
          <div>
            <h3
              className="cg-title"
              style={{
                fontSize: '17px',
                margin: 0,
                color: '#ea580c',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: metric.color,
                  border: '1.5px solid #000000',
                  display: 'inline-block',
                }}
              />
              {metric.canonicalName}
            </h3>
            <div className="cg-subtitle" style={{ fontSize: '12px', marginTop: '2px' }}>
              Comparison across {joinedRows.length} calibration periods
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Tooltip content={`Calibration correlation goodness-of-fit R² value (1.0 = perfect parity).`}>
              <span
                style={{
                  backgroundColor: '#f1f5f9',
                  border: '1.5px solid #000000',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                R² = {rSquared.toFixed(4)}
              </span>
            </Tooltip>
          </div>
        </div>

        {/* KPI Mini-Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '8px',
            marginBottom: '14px',
          }}
        >
          <div
            style={{
              backgroundColor: '#eff6ff',
              border: '1.5px solid #000000',
              borderRadius: '6px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#2563eb' }}>SMT TOTAL</div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
              {Math.round(totalSmt).toLocaleString()} <span style={{ fontSize: '10px' }}>t</span>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#faf5ff',
              border: '1.5px solid #000000',
              borderRadius: '6px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#9333ea' }}>BLAZOR TOTAL</div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
              {Math.round(totalBlz).toLocaleString()} <span style={{ fontSize: '10px' }}>t</span>
            </div>
          </div>

          <div
            style={{
              backgroundColor: totalDelta >= 0 ? '#f0fdf4' : '#fef2f2',
              border: '1.5px solid #000000',
              borderRadius: '6px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 600, color: totalDelta >= 0 ? '#16a34a' : '#dc2626' }}>
              NET VARIANCE Δ
            </div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 800,
                color: totalDelta >= 0 ? '#16a34a' : '#dc2626',
              }}
            >
              {totalDelta > 0 ? `+${Math.round(totalDelta).toLocaleString()}` : Math.round(totalDelta).toLocaleString()}{' '}
              <span style={{ fontSize: '10px' }}>t</span>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1.5px solid #000000',
              borderRadius: '6px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#475569' }}>VARIANCE %</div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 800,
                color: Math.abs(totalPctDiff) < 1 ? '#16a34a' : '#ea580c',
              }}
            >
              {totalPctDiff > 0 ? `+${totalPctDiff.toFixed(2)}%` : `${totalPctDiff.toFixed(2)}%`}
            </div>
          </div>
        </div>

        {/* Chart Canvas */}
        <div
          style={{
            height: '320px',
            position: 'relative',
            backgroundColor: '#ffffff',
            padding: '8px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
          }}
        >
          {chartComponent}
        </div>
      </div>
    );
  };

  const displayedMetrics =
    selectedMetricKey === 'ALL'
      ? metricStats
      : metricStats.filter((m) => m.metric.key === selectedMetricKey);

  return (
    <section style={{ marginBottom: '32px' }}>
      {/* Top Header & Chart View Mode Switcher */}
      <div
        className="cg-container"
        style={{
          padding: '16px 20px',
          backgroundColor: '#f8fafc',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div>
          <h2
            className="cg-title"
            style={{
              fontSize: '19px',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <TrendingUp size={22} color="#ea580c" />
            CALIBRATION GRAPHS (7 REQUIRED METRIC SUITES)
          </h2>
          <p className="cg-subtitle" style={{ fontSize: '12px', margin: '3px 0 0 0' }}>
            Visual comparison of SMT optimization output vs. Blazor composite output across joined time periods
          </p>
        </div>

        {/* Chart Mode Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginRight: '4px' }}>Chart View:</span>

          {(
            [
              { id: 'BAR', label: 'Grouped Bar', icon: BarChart3, tip: 'Side-by-side comparison bars for each period' },
              { id: 'LINE', label: 'Trend Line', icon: LineChart, tip: 'Continuous trajectory comparison over time' },
              { id: 'DELTA', label: 'Variance Δ', icon: Activity, tip: 'Direct period-by-period delta discrepancy bar chart' },
              { id: 'PARITY', label: 'Parity (y=x)', icon: Sparkles, tip: '45-degree parity plot assessing model calibration agreement' },
            ] as const
          ).map((m) => {
            const Icon = m.icon;
            return (
              <Tooltip key={m.id} content={m.tip}>
                <button
                  className="cg-btn"
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: chartMode === m.id ? '#0d9488' : '#ffffff',
                    color: chartMode === m.id ? '#ffffff' : '#0f172a',
                  }}
                  onClick={() => setChartMode(m.id)}
                >
                  <Icon size={14} />
                  {m.label}
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Metric Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '8px',
          marginBottom: '16px',
        }}
      >
        <Tooltip content="Display all 7 required calibration metric graphs simultaneously.">
          <button
            className="cg-btn"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              backgroundColor: selectedMetricKey === 'ALL' ? '#ea580c' : '#f1f5f9',
              color: selectedMetricKey === 'ALL' ? '#ffffff' : '#0f172a',
              whiteSpace: 'nowrap',
            }}
            onClick={() => setSelectedMetricKey('ALL')}
          >
            All 7 Graphs View
          </button>
        </Tooltip>

        {TARGET_METRICS.map((m) => (
          <Tooltip key={m.key} content={`Focus view on '${m.canonicalName}' graph`}>
            <button
              className="cg-btn"
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: selectedMetricKey === m.key ? '#0d9488' : '#f1f5f9',
                color: selectedMetricKey === m.key ? '#ffffff' : '#0f172a',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onClick={() => setSelectedMetricKey(m.key)}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: m.color,
                  display: 'inline-block',
                }}
              />
              {m.canonicalName}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* Graphs List */}
      <div>{displayedMetrics.map((stat) => renderSingleGraph(stat))}</div>
    </section>
  );
};
