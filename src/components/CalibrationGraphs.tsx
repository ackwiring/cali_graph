import React, { useState, useRef } from 'react';
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
import {
  BarChart3,
  LineChart,
  SlidersHorizontal,
  Activity,
  TrendingUp,
  Sparkles,
  Download,
  FileImage,
  FileText,
} from 'lucide-react';
import { TARGET_METRICS } from '../services/fileParser';
import { extractMetricValue } from '../services/metricExtraction';
import { Tooltip } from './Tooltip';
import {
  exportGraphAsPng,
  exportGraphAsPdf,
  exportAllGraphsAsPdf,
  GraphExportParams,
} from '../services/graphExport';

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

export type ChartMode = 'BAR' | 'LINE' | 'TORNADO' | 'DELTA' | 'PARITY';

export const CalibrationGraphs: React.FC<CalibrationGraphsProps> = ({
  joinedRows,
  joinDimensionKey,
}) => {
  const [selectedMetricKey, setSelectedMetricKey] = useState<string>('ALL');
  const [globalChartMode, setGlobalChartMode] = useState<ChartMode>('BAR');
  const [perGraphModes, setPerGraphModes] = useState<Record<string, ChartMode>>({});
  const [isExportingAll, setIsExportingAll] = useState<boolean>(false);

  // Store Chart.js instance references for high-res canvas exports
  const chartRefs = useRef<Record<string, any>>({});

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

  const getEffectiveMode = (metricKey: string): ChartMode => {
    return perGraphModes[metricKey] || globalChartMode;
  };

  const getModeLabel = (mode: ChartMode): string => {
    switch (mode) {
      case 'BAR':
        return 'Grouped Bar';
      case 'LINE':
        return 'Trend Line';
      case 'TORNADO':
        return 'Tornado Graph';
      case 'DELTA':
        return 'Variance Δ';
      case 'PARITY':
        return 'Parity (y=x)';
      default:
        return mode;
    }
  };

  // Helper to extract canvas element for a metric
  const getCanvasForMetric = (metricKey: string): HTMLCanvasElement | null => {
    const ref = chartRefs.current[metricKey];
    if (!ref) return null;
    return ref.canvas || ref.ctx?.canvas || null;
  };

  // Export Single Graph as PNG
  const handleExportPng = async (stat: (typeof metricStats)[0]) => {
    const canvas = getCanvasForMetric(stat.metric.key);
    if (!canvas) {
      alert('Graph is rendering, please try again in a moment.');
      return;
    }
    const currentMode = getEffectiveMode(stat.metric.key);
    await exportGraphAsPng({
      chartCanvas: canvas,
      metricName: stat.metric.canonicalName,
      shortName: stat.metric.shortName,
      chartMode: getModeLabel(currentMode),
      periodCount: joinedRows.length,
      kpis: {
        totalSmt: stat.totalSmt,
        totalBlz: stat.totalBlz,
        totalDelta: stat.totalDelta,
        totalPctDiff: stat.totalPctDiff,
        rSquared: stat.rSquared,
      },
    });
  };

  // Export Single Graph as PDF
  const handleExportPdf = async (stat: (typeof metricStats)[0]) => {
    const canvas = getCanvasForMetric(stat.metric.key);
    if (!canvas) {
      alert('Graph is rendering, please try again in a moment.');
      return;
    }
    const currentMode = getEffectiveMode(stat.metric.key);
    await exportGraphAsPdf({
      chartCanvas: canvas,
      metricName: stat.metric.canonicalName,
      shortName: stat.metric.shortName,
      chartMode: getModeLabel(currentMode),
      periodCount: joinedRows.length,
      kpis: {
        totalSmt: stat.totalSmt,
        totalBlz: stat.totalBlz,
        totalDelta: stat.totalDelta,
        totalPctDiff: stat.totalPctDiff,
        rSquared: stat.rSquared,
      },
    });
  };

  // Export All 7 Graphs as a Comprehensive PDF Report
  const handleExportAllPdf = async () => {
    setIsExportingAll(true);
    try {
      const itemsToExport: GraphExportParams[] = [];

      for (const stat of metricStats) {
        const canvas = getCanvasForMetric(stat.metric.key);
        if (canvas) {
          const currentMode = getEffectiveMode(stat.metric.key);
          itemsToExport.push({
            chartCanvas: canvas,
            metricName: stat.metric.canonicalName,
            shortName: stat.metric.shortName,
            chartMode: getModeLabel(currentMode),
            periodCount: joinedRows.length,
            kpis: {
              totalSmt: stat.totalSmt,
              totalBlz: stat.totalBlz,
              totalDelta: stat.totalDelta,
              totalPctDiff: stat.totalPctDiff,
              rSquared: stat.rSquared,
            },
          });
        }
      }

      if (itemsToExport.length === 0) {
        alert('Please switch to "All 7 Graphs View" to export the full comprehensive report.');
        return;
      }

      await exportAllGraphsAsPdf(itemsToExport);
    } catch (err: any) {
      alert(`Error generating PDF report: ${err.message || err}`);
    } finally {
      setIsExportingAll(false);
    }
  };

  const renderSingleGraph = (stat: (typeof metricStats)[0]) => {
    const { metric, smtValues, blzValues, deltas, totalSmt, totalBlz, totalDelta, totalPctDiff, rSquared } = stat;
    const mode = getEffectiveMode(metric.key);

    let chartComponent = null;

    if (mode === 'BAR') {
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

      chartComponent = <Bar ref={(el) => (chartRefs.current[metric.key] = el)} data={data} options={options} />;
    } else if (mode === 'LINE') {
      const data = {
        labels,
        datasets: [
          {
            label: 'SMT Tool Output',
            data: smtValues,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.12)',
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
            backgroundColor: 'rgba(147, 51, 234, 0.12)',
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

      chartComponent = <Line ref={(el) => (chartRefs.current[metric.key] = el)} data={data} options={options} />;
    } else if (mode === 'TORNADO') {
      // Bidirectional Horizontal Tornado / Butterfly Graph
      const maxVal = Math.max(...smtValues.map(Math.abs), ...blzValues.map(Math.abs), 1);

      const data = {
        labels,
        datasets: [
          {
            label: 'SMT Tool (Left / Baseline)',
            data: smtValues.map((v) => -Math.abs(v)),
            backgroundColor: '#2563eb',
            borderColor: '#000000',
            borderWidth: 1.5,
            borderRadius: 4,
          },
          {
            label: 'Blazor Composite (Right)',
            data: blzValues.map((v) => Math.abs(v)),
            backgroundColor: '#9333ea',
            borderColor: '#000000',
            borderWidth: 1.5,
            borderRadius: 4,
          },
        ],
      };

      const options: any = {
        indexAxis: 'y' as const,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' as const, labels: { font: { weight: 'bold' } } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const isSmt = ctx.datasetIndex === 0;
                const prefix = isSmt ? 'SMT Output' : 'Blazor Composite';
                return `${prefix}: ${Math.abs(ctx.raw).toLocaleString()} Tonnes`;
              },
              afterLabel: (ctx: any) => {
                const idx = ctx.dataIndex;
                const s = smtValues[idx] || 0;
                const b = blzValues[idx] || 0;
                const d = b - s;
                const pct = s > 0 ? ((d / s) * 100).toFixed(2) : '0.00';
                return `Period Variance Δ: ${d >= 0 ? '+' : ''}${Math.round(d).toLocaleString()} t (${pct}%)`;
              },
            },
          },
        },
        scales: {
          x: {
            suggestedMin: -maxVal * 1.08,
            suggestedMax: maxVal * 1.08,
            ticks: {
              callback: (val: any) => Math.abs(Number(val)).toLocaleString(),
            },
            title: {
              display: true,
              text: '← SMT Tool (Wet Tonnes)  |  Blazor Composite (Wet Tonnes) →',
              font: { weight: 'bold' },
              color: '#0f172a',
            },
            grid: {
              color: (ctx: any) => (ctx.tick && ctx.tick.value === 0 ? '#000000' : '#e2e8f0'),
              lineWidth: (ctx: any) => (ctx.tick && ctx.tick.value === 0 ? 2 : 1),
            },
          },
          y: {
            title: { display: true, text: 'Period / Time Horizon', font: { weight: 'bold' } },
          },
        },
      };

      chartComponent = <Bar ref={(el) => (chartRefs.current[metric.key] = el)} data={data} options={options} />;
    } else if (mode === 'DELTA') {
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

      chartComponent = <Bar ref={(el) => (chartRefs.current[metric.key] = el)} data={data} options={options} />;
    } else if (mode === 'PARITY') {
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

      chartComponent = <Scatter ref={(el) => (chartRefs.current[metric.key] = el)} data={data as any} options={options} />;
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
        {/* Metric Header with Titles & Per-Graph Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          {/* Title & Period Info */}
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
              Comparison across {joinedRows.length} calibration periods  •  Current View: {getModeLabel(mode)}
            </div>
          </div>

          {/* Controls: Mode Switcher, R² Badge & Export Actions */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* R² Badge */}
            <Tooltip content="Calibration correlation goodness-of-fit R² value (1.0 = perfect parity).">
              <span
                style={{
                  backgroundColor: '#f1f5f9',
                  border: '1.5px solid #000000',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  marginRight: '4px',
                }}
              >
                R² = {rSquared.toFixed(4)}
              </span>
            </Tooltip>

            {/* Per-Graph View Selector Buttons */}
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '6px', padding: '2px', border: '1px solid #cbd5e1' }}>
              {(
                [
                  { id: 'BAR', label: 'Bar', icon: BarChart3, tip: 'Grouped Bar View' },
                  { id: 'LINE', label: 'Line', icon: LineChart, tip: 'Trend Line View' },
                  { id: 'TORNADO', label: 'Tornado', icon: SlidersHorizontal, tip: 'Bidirectional Tornado / Butterfly View' },
                  { id: 'DELTA', label: 'Δ', icon: Activity, tip: 'Variance Δ View' },
                  { id: 'PARITY', label: 'Parity', icon: Sparkles, tip: '45° Parity View' },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                const isSelected = mode === m.id;
                return (
                  <Tooltip key={m.id} content={m.tip}>
                    <button
                      style={{
                        background: isSelected ? '#0d9488' : 'transparent',
                        color: isSelected ? '#ffffff' : '#475569',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 7px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                      onClick={() => setPerGraphModes((prev) => ({ ...prev, [metric.key]: m.id }))}
                    >
                      <Icon size={12} />
                      {m.label}
                    </button>
                  </Tooltip>
                );
              })}
            </div>

            {/* PNG Download Button */}
            <Tooltip content={`Download '${metric.shortName}' graph as high-resolution PNG image with KPIs.`}>
              <button
                className="cg-btn"
                style={{
                  padding: '4px 9px',
                  fontSize: '11px',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                }}
                onClick={() => handleExportPng(stat)}
              >
                <FileImage size={13} color="#2563eb" />
                PNG
              </button>
            </Tooltip>

            {/* PDF Download Button */}
            <Tooltip content={`Download '${metric.shortName}' graph as publication-ready PDF report.`}>
              <button
                className="cg-btn"
                style={{
                  padding: '4px 9px',
                  fontSize: '11px',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                }}
                onClick={() => handleExportPdf(stat)}
              >
                <FileText size={13} color="#ea580c" />
                PDF
              </button>
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
      {/* Top Header & Global Chart View Mode Switcher */}
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

        {/* Global Controls: View Mode Toggles & Report Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginRight: '2px' }}>Global View:</span>

          {(
            [
              { id: 'BAR', label: 'Grouped Bar', icon: BarChart3, tip: 'Side-by-side comparison bars for each period' },
              { id: 'LINE', label: 'Trend Line', icon: LineChart, tip: 'Continuous trajectory comparison over time' },
              { id: 'TORNADO', label: 'Tornado Graph', icon: SlidersHorizontal, tip: 'Bidirectional diverging butterfly graph comparing SMT vs Blazor' },
              { id: 'DELTA', label: 'Variance Δ', icon: Activity, tip: 'Direct period-by-period delta discrepancy bar chart' },
              { id: 'PARITY', label: 'Parity (y=x)', icon: Sparkles, tip: '45-degree parity plot assessing model calibration agreement' },
            ] as const
          ).map((m) => {
            const Icon = m.icon;
            const isSelected = globalChartMode === m.id;
            return (
              <Tooltip key={m.id} content={m.tip}>
                <button
                  className="cg-btn"
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: isSelected ? '#0d9488' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#0f172a',
                  }}
                  onClick={() => {
                    setGlobalChartMode(m.id);
                    setPerGraphModes({}); // reset individual overrides to align with global
                  }}
                >
                  <Icon size={14} />
                  {m.label}
                </button>
              </Tooltip>
            );
          })}

          {/* Export All Graphs PDF Report Button */}
          <div style={{ marginLeft: '4px' }}>
            <Tooltip content="Export comprehensive multi-page PDF calibration report containing all 7 target metric graphs.">
              <button
                className="cg-btn cg-btn-primary"
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                }}
                disabled={isExportingAll}
                onClick={handleExportAllPdf}
              >
                <Download size={14} />
                {isExportingAll ? 'Generating PDF...' : 'Export All PDF Report'}
              </button>
            </Tooltip>
          </div>
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
