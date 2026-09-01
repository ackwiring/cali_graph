import jsPDF from 'jspdf';

export interface GraphKpiData {
  totalSmt: number;
  totalBlz: number;
  totalDelta: number;
  totalPctDiff: number;
  rSquared: number;
}

export interface GraphExportParams {
  chartCanvas: HTMLCanvasElement;
  metricName: string;
  shortName: string;
  chartMode: string;
  periodCount: number;
  kpis: GraphKpiData;
  filenamePrefix?: string;
}

/**
 * Clean up a string for use in a file name
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');
}

/**
 * Format numbers with commas and unit
 */
function formatTonnes(val: number): string {
  return `${Math.round(val).toLocaleString()} t`;
}

/**
 * Export a single graph as a high-resolution PNG file with title and KPI metadata
 */
export async function exportGraphAsPng({
  chartCanvas,
  metricName,
  shortName,
  chartMode,
  periodCount,
  kpis,
  filenamePrefix = 'Calibration_Graph',
}: GraphExportParams): Promise<void> {
  const dpr = Math.max(2, window.devicePixelRatio || 2);
  const padding = 24 * dpr;
  const headerHeight = 110 * dpr;
  const footerHeight = 40 * dpr;

  const chartWidth = chartCanvas.width;
  const chartHeight = chartCanvas.height;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = Math.max(chartWidth + padding * 2, 900 * dpr);
  exportCanvas.height = chartHeight + headerHeight + footerHeight + padding * 2;

  const ctx = exportCanvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D canvas context for PNG export');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  // Top Accent Bar
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(0, 0, exportCanvas.width, 6 * dpr);

  // Title
  ctx.fillStyle = '#ea580c';
  ctx.font = `bold ${18 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(metricName, padding, padding + 18 * dpr);

  // Subtitle
  ctx.fillStyle = '#0d9488';
  ctx.font = `600 ${12 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(
    `Mode: ${chartMode} View  |  Comparison across ${periodCount} periods  |  R² = ${kpis.rSquared.toFixed(4)}`,
    padding,
    padding + 38 * dpr
  );

  // KPI Summary Bar
  const kpiY = padding + 52 * dpr;
  const kpiBoxWidth = (exportCanvas.width - padding * 2 - 24 * dpr) / 4;
  const kpiBoxHeight = 44 * dpr;

  const kpiItems = [
    { label: 'SMT TOTAL', value: formatTonnes(kpis.totalSmt), bg: '#eff6ff', border: '#2563eb', color: '#2563eb' },
    { label: 'BLAZOR TOTAL', value: formatTonnes(kpis.totalBlz), bg: '#faf5ff', border: '#9333ea', color: '#9333ea' },
    {
      label: 'NET VARIANCE Δ',
      value: (kpis.totalDelta > 0 ? '+' : '') + formatTonnes(kpis.totalDelta),
      bg: kpis.totalDelta >= 0 ? '#f0fdf4' : '#fef2f2',
      border: kpis.totalDelta >= 0 ? '#16a34a' : '#dc2626',
      color: kpis.totalDelta >= 0 ? '#16a34a' : '#dc2626',
    },
    {
      label: 'VARIANCE %',
      value: (kpis.totalPctDiff > 0 ? '+' : '') + kpis.totalPctDiff.toFixed(2) + '%',
      bg: '#f8fafc',
      border: '#64748b',
      color: Math.abs(kpis.totalPctDiff) < 1 ? '#16a34a' : '#ea580c',
    },
  ];

  kpiItems.forEach((item, idx) => {
    const bx = padding + idx * (kpiBoxWidth + 8 * dpr);
    ctx.fillStyle = item.bg;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.roundRect(bx, kpiY, kpiBoxWidth, kpiBoxHeight, 6 * dpr);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = item.color;
    ctx.font = `bold ${8.5 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(item.label, bx + 8 * dpr, kpiY + 14 * dpr);

    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${12 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(item.value, bx + 8 * dpr, kpiY + 32 * dpr);
  });

  // Chart Rendering Area
  const chartY = padding + headerHeight;
  const chartDrawWidth = exportCanvas.width - padding * 2;
  const chartDrawHeight = exportCanvas.height - chartY - footerHeight - padding;

  // Chart Border Box
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1 * dpr;
  ctx.strokeRect(padding, chartY, chartDrawWidth, chartDrawHeight);

  // Draw chart image onto composite canvas
  ctx.drawImage(chartCanvas, padding, chartY, chartDrawWidth, chartDrawHeight);

  // Footer
  const footerY = exportCanvas.height - padding / 2;
  ctx.fillStyle = '#64748b';
  ctx.font = `500 ${10 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(
    `Calibration Grapher  •  Generated on ${new Date().toLocaleString()}  •  PGlite Embedded PostgreSQL Engine`,
    padding,
    footerY
  );

  // Download Trigger
  const dataUrl = exportCanvas.toDataURL('image/png', 1.0);
  const link = document.createElement('a');
  link.download = `${filenamePrefix}_${sanitizeFilename(shortName)}_${chartMode}_${new Date().toISOString().slice(0, 10)}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export a single graph as a high quality PDF report
 */
export async function exportGraphAsPdf({
  chartCanvas,
  metricName,
  shortName,
  chartMode,
  periodCount,
  kpis,
  filenamePrefix = 'Calibration_Report',
}: GraphExportParams): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 14;

  // Top Header Banner
  pdf.setFillColor(234, 88, 12); // #ea580c
  pdf.rect(0, 0, pageWidth, 5, 'F');

  // Title
  pdf.setTextColor(234, 88, 12);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(metricName, margin, 16);

  // Subtitle
  pdf.setTextColor(13, 148, 136); // #0d9488
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text(
    `Visual Mode: ${chartMode}  |  Comparison across ${periodCount} calibration periods  |  R² Goodness of Fit = ${kpis.rSquared.toFixed(4)}`,
    margin,
    22
  );

  // KPI Summary Cards
  const kpiY = 27;
  const cardWidth = (pageWidth - margin * 2 - 9) / 4;
  const cardHeight = 16;

  const kpisList = [
    { label: 'SMT TOTAL OUTPUT', val: formatTonnes(kpis.totalSmt), color: [37, 99, 235], bg: [239, 246, 255] },
    { label: 'BLAZOR COMPOSITE', val: formatTonnes(kpis.totalBlz), color: [147, 51, 234], bg: [250, 245, 255] },
    {
      label: 'NET VARIANCE Δ',
      val: (kpis.totalDelta > 0 ? '+' : '') + formatTonnes(kpis.totalDelta),
      color: kpis.totalDelta >= 0 ? [22, 163, 74] : [220, 38, 38],
      bg: kpis.totalDelta >= 0 ? [240, 253, 244] : [254, 242, 242],
    },
    {
      label: 'VARIANCE %',
      val: (kpis.totalPctDiff > 0 ? '+' : '') + kpis.totalPctDiff.toFixed(2) + '%',
      color: Math.abs(kpis.totalPctDiff) < 1 ? [22, 163, 74] : [234, 88, 12],
      bg: [248, 250, 252],
    },
  ];

  kpisList.forEach((item, idx) => {
    const x = margin + idx * (cardWidth + 3);

    // Card background
    pdf.setFillColor(item.bg[0], item.bg[1], item.bg[2]);
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(x, kpiY, cardWidth, cardHeight, 2, 2, 'FD');

    // Card Label
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(item.color[0], item.color[1], item.color[2]);
    pdf.text(item.label, x + 3, kpiY + 5.5);

    // Card Value
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text(item.val, x + 3, kpiY + 12);
  });

  // Chart Graphic
  const chartImgY = 47;
  const chartImgWidth = pageWidth - margin * 2;
  const chartImgHeight = 145;

  // Chart container border
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.3);
  pdf.rect(margin, chartImgY, chartImgWidth, chartImgHeight, 'S');

  const chartDataUrl = chartCanvas.toDataURL('image/png', 1.0);
  pdf.addImage(chartDataUrl, 'PNG', margin + 1, chartImgY + 1, chartImgWidth - 2, chartImgHeight - 2);

  // Footer
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    `Calibration Grapher Engine  •  Generated: ${new Date().toLocaleString()}  •  Confidential Mining Calibration Report`,
    margin,
    pageHeight - 6
  );
  pdf.text(`Page 1 of 1`, pageWidth - margin - 15, pageHeight - 6);

  // Trigger Save
  pdf.save(`${filenamePrefix}_${sanitizeFilename(shortName)}_${chartMode}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * Export all 7 calibration graphs as a consolidated multi-page PDF Report
 */
export async function exportAllGraphsAsPdf(
  graphs: GraphExportParams[],
  filenamePrefix = 'Calibration_Comprehensive_Report'
): Promise<void> {
  if (graphs.length === 0) return;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 14;
  const totalPages = graphs.length;

  graphs.forEach((g, pageIndex) => {
    if (pageIndex > 0) {
      pdf.addPage('a4', 'landscape');
    }

    // Top Header Banner
    pdf.setFillColor(234, 88, 12);
    pdf.rect(0, 0, pageWidth, 5, 'F');

    // Title
    pdf.setTextColor(234, 88, 12);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text(`[Metric ${pageIndex + 1}/${totalPages}] ${g.metricName}`, margin, 15);

    // Subtitle
    pdf.setTextColor(13, 148, 136);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.text(
      `Visual Mode: ${g.chartMode}  |  ${g.periodCount} Periods  |  R² Goodness of Fit = ${g.kpis.rSquared.toFixed(4)}`,
      margin,
      21
    );

    // KPI Cards
    const kpiY = 26;
    const cardWidth = (pageWidth - margin * 2 - 9) / 4;
    const cardHeight = 15;

    const kpisList = [
      { label: 'SMT TOTAL OUTPUT', val: formatTonnes(g.kpis.totalSmt), color: [37, 99, 235], bg: [239, 246, 255] },
      { label: 'BLAZOR COMPOSITE', val: formatTonnes(g.kpis.totalBlz), color: [147, 51, 234], bg: [250, 245, 255] },
      {
        label: 'NET VARIANCE Δ',
        val: (g.kpis.totalDelta > 0 ? '+' : '') + formatTonnes(g.kpis.totalDelta),
        color: g.kpis.totalDelta >= 0 ? [22, 163, 74] : [220, 38, 38],
        bg: g.kpis.totalDelta >= 0 ? [240, 253, 244] : [254, 242, 242],
      },
      {
        label: 'VARIANCE %',
        val: (g.kpis.totalPctDiff > 0 ? '+' : '') + g.kpis.totalPctDiff.toFixed(2) + '%',
        color: Math.abs(g.kpis.totalPctDiff) < 1 ? [22, 163, 74] : [234, 88, 12],
        bg: [248, 250, 252],
      },
    ];

    kpisList.forEach((item, idx) => {
      const x = margin + idx * (cardWidth + 3);
      pdf.setFillColor(item.bg[0], item.bg[1], item.bg[2]);
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.35);
      pdf.roundedRect(x, kpiY, cardWidth, cardHeight, 2, 2, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(item.color[0], item.color[1], item.color[2]);
      pdf.text(item.label, x + 3, kpiY + 5);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(15, 23, 42);
      pdf.text(item.val, x + 3, kpiY + 11.5);
    });

    // Chart
    const chartImgY = 45;
    const chartImgWidth = pageWidth - margin * 2;
    const chartImgHeight = 148;

    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.3);
    pdf.rect(margin, chartImgY, chartImgWidth, chartImgHeight, 'S');

    const chartDataUrl = g.chartCanvas.toDataURL('image/png', 1.0);
    pdf.addImage(chartDataUrl, 'PNG', margin + 1, chartImgY + 1, chartImgWidth - 2, chartImgHeight - 2);

    // Footer
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      `Calibration Grapher  •  Generated: ${new Date().toLocaleString()}  •  Mine Planning Strategic Calibration`,
      margin,
      pageHeight - 5.5
    );
    pdf.text(`Page ${pageIndex + 1} of ${totalPages}`, pageWidth - margin - 18, pageHeight - 5.5);
  });

  pdf.save(`${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
