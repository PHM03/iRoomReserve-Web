import PDFDocument from 'pdfkit';
import type {
  FeedbackAnalyticsReport,
  FeedbackAnalyticsReportLocationPerformance,
  FeedbackAnalyticsReportTrend,
  FeedbackAnalyticsReportTrendBucket,
  FeedbackAnalyticsReportReview,
} from './feedback-report';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = PAGE_HEIGHT - MARGIN - 12;

const COLORS = {
  ink: '#172033',
  muted: '#667085',
  lightMuted: '#98A2B3',
  rule: '#D0D5DD',
  panel: '#F8FAFC',
  navy: '#7A191C',
  blue: '#A12124',
  teal: '#149D9A',
  green: '#2E8B57',
  amber: '#C77700',
  red: '#C0392B',
  purple: '#7657A6',
};

type PdfDocument = InstanceType<typeof PDFDocument>;

function finite(value: number | null | undefined, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return value.toFixed(digits).replace(/\.00$/, '');
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${formatNumber(value, 1)}%`;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value: string | null | undefined, fallback: string) {
  return value && value.trim() ? value : fallback;
}

function formatDate(value: string | null | undefined, fallback = '-') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

function safeFilenamePart(value: string) {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const sanitized = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || 'scope';
}

export function getFeedbackAnalyticsReportFilename(report: FeedbackAnalyticsReport) {
  const scope = report.metadata.scope.selectedBuildingLabel || report.metadata.scope.type;
  const date = new Date(report.metadata.generatedAt);
  const datePart = Number.isNaN(date.getTime())
    ? 'report'
    : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return `feedback-analytics-${safeFilenamePart(scope)}-${datePart}.pdf`;
}

function drawRule(doc: PdfDocument, y: number, color = COLORS.rule) {
  doc.save().strokeColor(color).lineWidth(0.7).moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke().restore();
}

function drawFooter(doc: PdfDocument, pageNumber: number) {
  doc.save().fontSize(7.5).fillColor(COLORS.muted);
  doc.text('e-RoomReserve Feedback Analytics', MARGIN, FOOTER_Y, { lineBreak: false });
  doc.text(`Page ${pageNumber}`, PAGE_WIDTH - MARGIN - 45, FOOTER_Y, { width: 45, align: 'right', lineBreak: false });
  doc.restore();
}

function addPage(doc: PdfDocument, pageNumber: number) {
  drawFooter(doc, pageNumber);
  doc.addPage({ size: 'A4', margin: MARGIN });
  return pageNumber + 1;
}

function ensureSpace(doc: PdfDocument, y: number, height: number, pageNumber: number) {
  if (y + height <= FOOTER_Y - 10) return { y, pageNumber };
  return { y: MARGIN + 10, pageNumber: addPage(doc, pageNumber) };
}

function startSection(doc: PdfDocument, y: number, pageNumber: number, minimumHeight: number) {
  return ensureSpace(doc, y, minimumHeight, pageNumber);
}

function drawSectionTitle(doc: PdfDocument, title: string, y: number) {
  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.navy).text(title, MARGIN, y, { lineBreak: false });
  drawRule(doc, y + 22, COLORS.blue);
  return y + 34;
}

function drawSmallLabel(doc: PdfDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted).text(label.toUpperCase(), x, y, { width, lineBreak: false });
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.ink).text(value, x, y + 11, { width, lineBreak: false });
}

function drawMetricCard(doc: PdfDocument, label: string, value: string, detail: string | undefined, x: number, y: number, width: number) {
  doc.save().roundedRect(x, y, width, 55, 5).fillAndStroke(COLORS.panel, COLORS.rule);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted).text(label.toUpperCase(), x + 10, y + 9, { width: width - 20, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.ink).text(value, x + 10, y + 21, { width: width - 20, lineBreak: false });
  if (detail) doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(detail, x + 10, y + 42, { width: width - 20, lineBreak: false });
  doc.restore();
}

function drawEmptyState(doc: PdfDocument, message: string, y: number) {
  doc.save().roundedRect(MARGIN, y, CONTENT_WIDTH, 44, 5).fillAndStroke('#F8FAFC', COLORS.rule);
  doc.font('Helvetica-Oblique').fontSize(10).fillColor(COLORS.muted).text(message, MARGIN + 14, y + 15, { width: CONTENT_WIDTH - 28, align: 'center', lineBreak: false });
  doc.restore();
  return y + 58;
}

function drawHorizontalBarChart(
  doc: PdfDocument,
  items: Array<{ label: string; value: number; detail: string; color?: string }>,
  y: number,
  color = COLORS.blue,
) {
  const chartHeight = Math.max(42, items.length * 22 + 12);
  const max = Math.max(...items.map((item) => finite(item.value)), 1);
  const labelWidth = 112;
  const valueWidth = 55;
  const barWidth = CONTENT_WIDTH - labelWidth - valueWidth - 16;

  items.forEach((item, index) => {
    const rowY = y + index * 22;
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.ink).text(item.label, MARGIN, rowY + 3, { width: labelWidth, lineBreak: false });
    doc.save().roundedRect(MARGIN + labelWidth, rowY + 3, barWidth, 10, 3).fill('#E6EAF0');
    const width = barWidth * Math.max(0, finite(item.value)) / max;
    if (width > 0) doc.roundedRect(MARGIN + labelWidth, rowY + 3, width, 10, 3).fill(item.color || color);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.ink).text(item.detail, PAGE_WIDTH - MARGIN - valueWidth, rowY + 2, { width: valueWidth, align: 'right', lineBreak: false });
  });
  return y + chartHeight;
}

function drawLineChart(
  doc: PdfDocument,
  title: string,
  buckets: FeedbackAnalyticsReportTrendBucket[],
  series: Array<{ label: string; color: string; values: number[] }>,
  min: number,
  max: number,
  y: number,
  formatter: (value: number) => string,
) {
  const chartHeight = 148;
  const chartTop = y + 20;
  const chartBottom = chartTop + chartHeight;
  const chartLeft = MARGIN + 42;
  const chartRight = PAGE_WIDTH - MARGIN;
  const chartWidth = chartRight - chartLeft;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink).text(title, MARGIN, y, { lineBreak: false });
  if (buckets.length === 0 || series.every((item) => item.values.every((value) => !Number.isFinite(value)))) {
    return drawEmptyState(doc, 'No trend data available for the selected period.', y + 28);
  }

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = min + ((max - min) * tick) / 4;
    const gridY = chartBottom - (chartHeight * tick) / 4;
    doc.save().strokeColor('#E6EAF0').lineWidth(0.5).moveTo(chartLeft, gridY).lineTo(chartRight, gridY).stroke().restore();
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted).text(formatter(value), MARGIN, gridY - 4, { width: 35, align: 'right', lineBreak: false });
  }

  const pointX = (index: number) => buckets.length === 1 ? chartLeft + chartWidth / 2 : chartLeft + (chartWidth * index) / (buckets.length - 1);
  series.forEach((item) => {
    doc.save().strokeColor(item.color).lineWidth(1.6);
    item.values.forEach((rawValue, index) => {
      const value = Math.min(max, Math.max(min, finite(rawValue, min)));
      const pointY = chartBottom - (chartHeight * (value - min)) / (max - min || 1);
      if (index === 0) doc.moveTo(pointX(index), pointY); else doc.lineTo(pointX(index), pointY);
    });
    doc.stroke().restore();
    item.values.forEach((rawValue, index) => {
      const value = Math.min(max, Math.max(min, finite(rawValue, min)));
      const pointY = chartBottom - (chartHeight * (value - min)) / (max - min || 1);
      doc.circle(pointX(index), pointY, 2.3).fill(item.color);
    });
  });

  const labelStep = Math.max(1, Math.ceil(buckets.length / 6));
  buckets.forEach((bucket, index) => {
    if (index % labelStep !== 0 && index !== buckets.length - 1) return;
    doc.save().font('Helvetica').fontSize(6.5).fillColor(COLORS.muted).text(bucket.label, pointX(index) - 30, chartBottom + 8, { width: 60, align: 'center', lineBreak: false }).restore();
  });

  let legendX = chartLeft;
  series.forEach((item) => {
    doc.circle(legendX + 3, chartBottom + 30, 3).fill(item.color);
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text(item.label, legendX + 10, chartBottom + 26, { lineBreak: false });
    legendX += 74 + item.label.length * 2.2;
  });
  return chartBottom + 42;
}

function drawTableHeader(doc: PdfDocument, columns: Array<{ label: string; width: number }>, y: number) {
  let x = MARGIN;
  doc.save().rect(MARGIN, y, CONTENT_WIDTH, 20).fill(COLORS.navy);
  columns.forEach((column) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF').text(column.label, x + 5, y + 6, { width: column.width - 10, lineBreak: false });
    x += column.width;
  });
  doc.restore();
  return y + 20;
}

function drawTableRow(doc: PdfDocument, values: string[], columns: Array<{ label: string; width: number }>, y: number, rowHeight = 23) {
  let x = MARGIN;
  doc.save().rect(MARGIN, y, CONTENT_WIDTH, rowHeight).fillAndStroke(y % 2 === 0 ? '#FFFFFF' : '#F8FAFC', COLORS.rule);
  values.forEach((value, index) => {
    const column = columns[index];
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.ink).text(value, x + 5, y + 7, { width: column.width - 10, height: rowHeight - 8, ellipsis: true, lineBreak: false });
    x += column.width;
  });
  doc.restore();
  return y + rowHeight;
}

function drawMetricTable(
  doc: PdfDocument,
  title: string,
  rows: Array<string[]>,
  columns: Array<{ label: string; width: number }>,
  y: number,
  pageNumber: number,
) {
  let state = ensureSpace(doc, y, 42, pageNumber);
  y = state.y;
  pageNumber = state.pageNumber;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink).text(title, MARGIN, y, { lineBreak: false });
  y += 16;
  y = drawTableHeader(doc, columns, y);
  rows.forEach((row) => {
    state = ensureSpace(doc, y, 23, pageNumber);
    y = state.y;
    pageNumber = state.pageNumber;
    if (y === MARGIN + 10) y = drawTableHeader(doc, columns, y);
    y = drawTableRow(doc, row, columns, y);
  });
  return { y: y + 14, pageNumber };
}

function renderOverview(doc: PdfDocument, report: FeedbackAnalyticsReport, y: number) {
  y = drawSectionTitle(doc, 'Data Overview', y);
  const overview = report.overview;
  const cardGap = 8;
  const cardWidth = (CONTENT_WIDTH - cardGap * 2) / 3;
  drawMetricCard(doc, 'Total Reviews', String(overview.totalReviews), undefined, MARGIN, y, cardWidth);
  drawMetricCard(doc, 'Average Rating', `${formatNumber(overview.averageRating)} / 5`, undefined, MARGIN + cardWidth + cardGap, y, cardWidth);
  drawMetricCard(doc, 'Average Sentiment', formatNumber(overview.averageSentimentScore, 3), undefined, MARGIN + (cardWidth + cardGap) * 2, y, cardWidth);
  y += 70;
  const sentimentRows = [
    ['Positive', overview.positiveCount, overview.positiveRate, COLORS.green],
    ['Neutral', overview.neutralCount, overview.neutralRate, COLORS.muted],
    ['Negative', overview.negativeCount, overview.negativeRate, COLORS.red],
    ['Insufficient Context', overview.insufficientContextCount, overview.insufficientContextRate, COLORS.amber],
  ] as const;
  sentimentRows.forEach(([label, count, rate, color]) => {
    doc.circle(MARGIN + 5, y + 5, 3.5).fill(color);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink).text(label, MARGIN + 15, y, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink).text(`${count}`, MARGIN + 160, y, { width: 35, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(`(${formatPercent(rate)})`, MARGIN + 202, y, { lineBreak: false });
    y += 18;
  });
  return y + 12;
}

function renderFilters(doc: PdfDocument, report: FeedbackAnalyticsReport, y: number) {
  y = drawSectionTitle(doc, 'Applied Filters', y);
  const filters = report.metadata.filters;
  const scopeLabel = displayValue(report.metadata.scope.selectedBuildingLabel, titleCase(report.metadata.scope.type));
  const values = [
    ['Building / Campus', scopeLabel],
    ['Location Scope', titleCase(filters.locationScope)],
    ['Floor', displayValue(filters.floor, 'All Floors')],
    ['Room', displayValue(filters.roomId, 'All Rooms')],
    ['Period', titleCase(filters.period)],
    ['Academic Year', displayValue(filters.academicYear, 'All Academic Years')],
    ['Semester', displayValue(filters.semester, 'All Semesters')],
    ['Rating', filters.star ? `${filters.star} Star${filters.star === 1 ? '' : 's'}` : 'All Ratings'],
    ['Date From', displayValue(filters.dateFrom, 'All Dates')],
    ['Date To', displayValue(filters.dateTo, 'All Dates')],
    ['Role', displayValue(filters.role, 'All Roles')],
    ['Gender', displayValue(filters.gender, 'All Genders')],
  ];
  const colWidth = (CONTENT_WIDTH - 12) / 2;
  values.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    drawSmallLabel(doc, label, value, MARGIN + column * (colWidth + 12), y + row * 34, colWidth);
  });
  return y + Math.ceil(values.length / 2) * 34 + 10;
}

function renderRatingAnalysis(doc: PdfDocument, report: FeedbackAnalyticsReport, y: number) {
  y = drawSectionTitle(doc, 'Rating Analysis', y);
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.ink).text(`Average rating: ${formatNumber(report.overview.averageRating)} / 5`, MARGIN, y, { lineBreak: false });
  y += 20;
  const bars = ([1, 2, 3, 4, 5] as const).map((rating) => ({
    label: `${rating} Star${rating === 1 ? '' : 's'}`,
    value: report.ratingAnalysis.distribution[rating].count,
    detail: `${report.ratingAnalysis.distribution[rating].count} (${formatPercent(report.ratingAnalysis.percentages[rating])})`,
  }));
  y = drawHorizontalBarChart(doc, bars, y, COLORS.blue) + 18;
  return y;
}

function renderSentimentAnalysis(doc: PdfDocument, report: FeedbackAnalyticsReport, y: number) {
  y = drawSectionTitle(doc, 'Sentiment Analysis', y);
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(`Average VADER / compound score: ${formatNumber(report.sentimentAnalysis.averageCompoundScore, 3)}`, MARGIN, y, { lineBreak: false });
  y += 20;
  const colors: Record<string, string> = {
    very_positive: COLORS.green,
    positive: COLORS.teal,
    neutral: COLORS.muted,
    negative: COLORS.red,
    very_negative: '#8C1D18',
    insufficient_context: COLORS.amber,
  };
  const bars = report.sentimentAnalysis.distribution.map((item) => ({
    label: titleCase(item.label),
    value: item.count,
    detail: `${item.count} (${formatPercent(item.percentage)})`,
    color: colors[item.label] || COLORS.purple,
  }));
  return drawHorizontalBarChart(doc, bars, y, COLORS.purple) + 18;
}

function renderTrends(doc: PdfDocument, trend: FeedbackAnalyticsReportTrend, y: number, pageNumber: number) {
  y = drawSectionTitle(doc, 'Sentiment and Rating Trends', y);
  if (!trend.configured || trend.buckets.length === 0) return { y: drawEmptyState(doc, trend.message || 'No trend data available for the selected period.', y), pageNumber };
  let state = ensureSpace(doc, y, 410, pageNumber);
  y = state.y;
  pageNumber = state.pageNumber;
  const buckets = trend.buckets;
  y = drawLineChart(doc, 'Sentiment rates', buckets, [
    { label: 'Positive', color: COLORS.green, values: buckets.map((item) => finite(item.positiveRate)) },
    { label: 'Neutral', color: COLORS.muted, values: buckets.map((item) => finite(item.neutralRate)) },
    { label: 'Negative', color: COLORS.red, values: buckets.map((item) => finite(item.negativeRate)) },
    { label: 'Insufficient', color: COLORS.amber, values: buckets.map((item) => finite(item.insufficientContextRate)) },
  ], 0, 100, y, (value) => `${Math.round(value)}%`);
  y += 14;
  y = drawLineChart(doc, 'Average rating by bucket', buckets, [
    { label: 'Rating', color: COLORS.blue, values: buckets.map((item) => finite(item.averageRating)) },
  ], 0, 5, y, (value) => formatNumber(value, 1));
  y += 12;
  const columns = [
    { label: 'Bucket', width: 118 },
    { label: 'Reviews', width: 55 },
    { label: 'Rating', width: 55 },
    { label: 'VADER', width: 55 },
    { label: 'Positive', width: 65 },
    { label: 'Neutral', width: 65 },
    { label: 'Negative', width: 65 },
  ];
  const rows = buckets.map((item) => [item.label, String(item.totalReviews), formatNumber(item.averageRating), formatNumber(item.averageCompoundScore, 3), formatPercent(item.positiveRate), formatPercent(item.neutralRate), formatPercent(item.negativeRate)]);
  state = drawMetricTable(doc, 'Trend Detail', rows, columns, y, pageNumber);
  return state;
}

function groupRooms(performance: FeedbackAnalyticsReportLocationPerformance) {
  const buildings = new Map<string, { name: string; rooms: typeof performance.rooms }>();
  performance.rooms.forEach((room) => {
    const building = buildings.get(room.buildingId) || { name: room.buildingId, rooms: [] };
    building.rooms.push(room);
    buildings.set(room.buildingId, building);
  });
  performance.buildings.forEach((building) => {
    if (!buildings.has(building.id)) buildings.set(building.id, { name: building.name, rooms: [] });
  });
  return [...buildings.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function renderRoomAnalytics(doc: PdfDocument, report: FeedbackAnalyticsReport, y: number, pageNumber: number) {
  y = drawSectionTitle(doc, 'Room Performance', y);
  const groups = groupRooms(report.roomAnalytics);
  if (groups.length === 0) return { y: drawEmptyState(doc, 'No room analytics available for the selected filters.', y), pageNumber };
  const columns = [
    { label: 'Building / Floor / Room', width: 190 },
    { label: 'Reviews', width: 52 },
    { label: 'Rating', width: 55 },
    { label: 'Sentiment', width: 58 },
    { label: 'Positive', width: 58 },
    { label: 'Negative', width: 58 },
    { label: 'Trend', width: 40 },
  ];
  groups.forEach(([buildingId, group]) => {
    const state = ensureSpace(doc, y, 55, pageNumber);
    y = state.y;
    pageNumber = state.pageNumber;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.navy).text(`${group.name} (${buildingId})`, MARGIN, y, { lineBreak: false });
    y += 16;
    y = drawTableHeader(doc, columns, y);
    group.rooms.sort((left, right) => `${left.floor}-${left.name}`.localeCompare(`${right.floor}-${right.name}`)).forEach((room) => {
      const row = [
        `${displayValue(room.floor, 'Floor -')} / ${room.name}`,
        String(room.totalReviews),
        formatNumber(room.averageRating),
        formatNumber(room.averageCompound, 3),
        formatPercent(room.positiveRate),
        formatPercent(room.negativeRate),
        titleCase(room.trendDirection),
      ];
      const rowState = ensureSpace(doc, y, 23, pageNumber);
      y = rowState.y;
      pageNumber = rowState.pageNumber;
      if (y === MARGIN + 10) y = drawTableHeader(doc, columns, y);
      y = drawTableRow(doc, row, columns, y);
    });
    y += 12;
  });
  return { y, pageNumber };
}

function renderLocationPerformance(doc: PdfDocument, performance: FeedbackAnalyticsReportLocationPerformance, y: number, pageNumber: number) {
  y = drawSectionTitle(doc, 'Location Performance', y);
  const renderRows = (title: string, items: FeedbackAnalyticsReportLocationPerformance['buildings']) => {
    const columns = [
      { label: title === 'Rooms' ? 'Building / Floor / Room' : title === 'Floors' ? 'Building / Floor' : 'Building', width: 165 },
      { label: 'Reviews', width: 50 },
      { label: 'Rating', width: 50 },
      { label: 'VADER', width: 55 },
      { label: 'Positive', width: 55 },
      { label: 'Negative', width: 55 },
      { label: 'Trend', width: 81 },
    ];
    const rows = items.map((item) => {
      const name = title === 'Rooms'
        ? `${item.buildingId} / ${displayValue(item.floor, 'Floor -')} / ${item.name}`
        : title === 'Floors'
          ? `${item.buildingId} / ${displayValue(item.floor, 'Floor -')}`
          : `${item.name} (${item.buildingId})`;
      return [name, String(item.totalReviews), formatNumber(item.averageRating), formatNumber(item.averageCompound, 3), formatPercent(item.positiveRate), formatPercent(item.negativeRate), titleCase(item.trendDirection)];
    });
    return { title, rows, columns };
  };
  for (const table of [renderRows('Buildings', performance.buildings), renderRows('Floors', performance.floors), renderRows('Rooms', performance.rooms)]) {
    if (table.rows.length === 0) continue;
    const state = drawMetricTable(doc, table.title, table.rows, table.columns, y, pageNumber);
    y = state.y;
    pageNumber = state.pageNumber;
  }
  if (performance.buildings.length === 0 && performance.floors.length === 0 && performance.rooms.length === 0) y = drawEmptyState(doc, 'No location performance available for the selected filters.', y);

  const detailItems = [
    ...performance.buildings.map((item) => ({ label: `${item.name} (${item.buildingId})`, item })),
    ...performance.floors.map((item) => ({ label: `${item.buildingId} / ${displayValue(item.floor, 'Floor -')}`, item })),
    ...performance.rooms.map((item) => ({ label: `${item.buildingId} / ${displayValue(item.floor, 'Floor -')} / ${item.name}`, item })),
  ];
  const detailRows = detailItems
    .map(({ label, item }) => {
      const lowRatingCategories = Object.values(item.categoryRatings)
        .filter((category) => category && category.lowRatingCount > 0)
        .map((category) => category!.label)
        .join(', ');
      const facilityConcerns = item.relevantFacilityConcerns.join(', ');
      return [label, facilityConcerns || '-', lowRatingCategories || '-'];
    })
    .filter((row) => row[1] !== '-' || row[2] !== '-');
  if (detailRows.length > 0) {
    const detailState = drawMetricTable(doc, 'Facility and low-rating indicators', detailRows, [
      { label: 'Location', width: 160 },
      { label: 'Facility Concerns', width: 180 },
      { label: 'Low-Rating Categories', width: 171 },
    ], y, pageNumber);
    y = detailState.y;
    pageNumber = detailState.pageNumber;
  }
  return { y, pageNumber };
}

function renderConcerns(doc: PdfDocument, report: FeedbackAnalyticsReport, y: number, pageNumber: number) {
  y = drawSectionTitle(doc, 'Top Concerns and Praised Aspects', y);
  const items = [
    ...report.topConcerns.negative.map((item) => ({ ...item, kind: 'Concern' })),
    ...report.topConcerns.positive.map((item) => ({ ...item, kind: 'Praised Aspect' })),
  ];
  if (items.length === 0) return { y: drawEmptyState(doc, 'No concerns or praised aspects available for the selected filters.', y), pageNumber };
  const columns = [
    { label: 'Type', width: 80 },
    { label: 'Aspect', width: 150 },
    { label: 'Count', width: 50 },
    { label: 'Share', width: 55 },
    { label: 'Locations', width: 176 },
  ];
  const rows = items.map((item) => [item.kind, item.label, String(item.count), formatPercent(item.percentage), item.locations.slice(0, 3).map((location) => `${location.buildingId}/${location.name}`).join(', ') || '-']);
  return drawMetricTable(doc, 'Ranked findings', rows, columns, y, pageNumber);
}

function renderCategories(doc: PdfDocument, report: FeedbackAnalyticsReport, y: number, pageNumber: number) {
  y = drawSectionTitle(doc, 'Category Performance', y);
  const items = Object.values(report.ratingAnalysis.categoryPerformance).filter(Boolean);
  if (items.length === 0) return { y: drawEmptyState(doc, 'No category performance available for the selected filters.', y), pageNumber };
  const rows = items.map((item) => [item!.label, formatNumber(item!.averageRating), String(item!.ratingCount), String(item!.lowRatingCount), formatPercent(item!.lowRatingRate), titleCase(item!.direction)]);
  return drawMetricTable(doc, 'Category ratings', rows, [
    { label: 'Category', width: 190 },
    { label: 'Average', width: 65 },
    { label: 'Rated', width: 55 },
    { label: 'Low', width: 45 },
    { label: 'Low Rate', width: 65 },
    { label: 'Trend', width: 75 },
  ], y, pageNumber);
}

function renderDemographics(doc: PdfDocument, report: FeedbackAnalyticsReport, y: number, pageNumber: number) {
  y = drawSectionTitle(doc, 'Demographic Analysis', y);
  if (report.demographics.length === 0) return { y: drawEmptyState(doc, 'No demographic analytics available for the selected filters.', y), pageNumber };
  const rows = report.demographics.map((item) => [item.label, String(item.totalReviews), formatNumber(item.averageRating), formatPercent(item.positiveRate), formatPercent(item.negativeRate), item.reliable ? 'Reliable' : 'Insufficient data']);
  return drawMetricTable(doc, 'Role and gender groups', rows, [
    { label: 'Group', width: 165 },
    { label: 'Reviews', width: 55 },
    { label: 'Rating', width: 55 },
    { label: 'Positive', width: 65 },
    { label: 'Negative', width: 65 },
    { label: 'Evidence', width: 106 },
  ], y, pageNumber);
}

function renderInsights(doc: PdfDocument, report: FeedbackAnalyticsReport, y: number) {
  y = drawSectionTitle(doc, 'Actionable Findings', y);
  const items = report.actionableInsights.items;
  if (items.length === 0) return drawEmptyState(doc, 'No actionable findings were produced for the selected filters.', y);
  items.forEach((item) => {
    doc.circle(MARGIN + 5, y + 5, 2.5).fill(COLORS.blue);
    doc.font('Helvetica').fontSize(9);
    const height = doc.heightOfString(item, { width: CONTENT_WIDTH - 22, lineGap: 2 });
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink).text(item, MARGIN + 16, y, { width: CONTENT_WIDTH - 16, lineGap: 2 });
    y += Math.max(18, height + 8);
  });
  return y + 8;
}

function reviewHeight(doc: PdfDocument, review: FeedbackAnalyticsReportReview) {
  doc.font('Helvetica').fontSize(9);
  const feedbackHeight = doc.heightOfString(review.feedbackText || '-', { width: CONTENT_WIDTH - 24, lineGap: 2 });
  doc.fontSize(8);
  const responseHeight = review.adminResponse ? doc.heightOfString(`Admin response: ${review.adminResponse}`, { width: CONTENT_WIDTH - 24, lineGap: 2 }) : 0;
  return 64 + feedbackHeight + responseHeight + (review.extractedKeywords.length ? 20 : 0);
}

function renderReview(doc: PdfDocument, review: FeedbackAnalyticsReportReview, y: number) {
  const height = reviewHeight(doc, review);
  doc.save().roundedRect(MARGIN, y, CONTENT_WIDTH, height, 5).fillAndStroke('#FFFFFF', COLORS.rule);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.navy).text(`${formatDate(review.date)} - ${review.buildingName || review.buildingId}`, MARGIN + 12, y + 11, { width: CONTENT_WIDTH - 24, lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(`${displayValue(review.floor, 'Floor -')} / ${displayValue(review.roomName, 'Room -')}    Rating: ${formatNumber(review.rating, 0)}    Sentiment: ${titleCase(review.sentiment)}    Score: ${formatNumber(review.sentimentScore, 3)}`, MARGIN + 12, y + 27, { width: CONTENT_WIDTH - 24, lineBreak: false });
  let textY = y + 43;
  doc.font('Helvetica').fontSize(9);
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink).text(review.feedbackText || '-', MARGIN + 12, textY, { width: CONTENT_WIDTH - 24, lineGap: 2 });
  textY += doc.heightOfString(review.feedbackText || '-', { width: CONTENT_WIDTH - 24, lineGap: 2 }) + 5;
  if (review.extractedKeywords.length) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.muted).text(`Aspects: ${review.extractedKeywords.join(', ')}`, MARGIN + 12, textY, { width: CONTENT_WIDTH - 24, lineBreak: false });
    textY += 15;
  }
  if (review.adminResponse) doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(`Admin response: ${review.adminResponse}`, MARGIN + 12, textY, { width: CONTENT_WIDTH - 24, lineGap: 2 });
  doc.restore();
  return y + height + 10;
}

function renderReviews(doc: PdfDocument, report: FeedbackAnalyticsReport, y: number, pageNumber: number) {
  y = drawSectionTitle(doc, 'Review Details', y);
  if (report.reviews.length === 0) return { y: drawEmptyState(doc, 'No reviews matched the selected filters.', y), pageNumber };
  for (const review of report.reviews) {
    const height = reviewHeight(doc, review);
    const state = ensureSpace(doc, y, height, pageNumber);
    y = state.y;
    pageNumber = state.pageNumber;
    if (y === MARGIN + 10) y = drawSectionTitle(doc, 'Review Details (continued)', y);
    y = renderReview(doc, review, y);
  }
  return { y, pageNumber };
}

function renderCover(doc: PdfDocument, report: FeedbackAnalyticsReport, y: number) {
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 188, 8).fill(COLORS.navy);
  doc.font('Helvetica-Bold').fontSize(25).fillColor('#FFFFFF').text('FEEDBACK ANALYTICS', MARGIN + 24, y + 30, { width: CONTENT_WIDTH - 48, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(25).fillColor('#FFFFFF').text('FINDINGS REPORT', MARGIN + 24, y + 61, { width: CONTENT_WIDTH - 48, lineBreak: false });
  doc.font('Helvetica').fontSize(12).fillColor('#F8E7E7').text('e-RoomReserve / iRoomReserv', MARGIN + 24, y + 105, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#FFFFFF').text(report.metadata.scope.selectedBuildingLabel, MARGIN + 24, y + 133, { width: CONTENT_WIDTH - 48, lineBreak: false });
  doc.font('Helvetica').fontSize(11).fillColor('#F8E7E7').text(`Period: ${titleCase(report.metadata.period)}`, MARGIN + 24, y + 155, { lineBreak: false });
  return y + 218;
}

export interface FeedbackAnalyticsPdfOptions {
  generatedAtLabel?: string;
}

/**
 * Renders the already-computed report contract. This is intentionally a Node/server
 * utility: it has no Firestore, filter, sentiment, or React dependencies.
 */
export function generateFeedbackAnalyticsReportPdf(
  report: FeedbackAnalyticsReport,
  options: FeedbackAnalyticsPdfOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: false, compress: true, info: { Title: report.metadata.title, Author: 'e-RoomReserve' } });
    const chunks: Buffer[] = [];
    let pageNumber = 1;
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      let y = renderCover(doc, report, MARGIN + 18);
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(`Generated: ${options.generatedAtLabel || formatDateTime(report.metadata.generatedAt)}`, MARGIN, y, { lineBreak: false });
      y += 30;
      y = renderFilters(doc, report, y);
      y = renderOverview(doc, report, y);

      let sectionState = startSection(doc, y, pageNumber, 190);
      y = sectionState.y;
      pageNumber = sectionState.pageNumber;
      y = renderRatingAnalysis(doc, report, y);

      sectionState = startSection(doc, y, pageNumber, 190);
      y = sectionState.y;
      pageNumber = sectionState.pageNumber;
      y = renderSentimentAnalysis(doc, report, y);

      sectionState = startSection(doc, y, pageNumber, 500);
      y = sectionState.y;
      pageNumber = sectionState.pageNumber;
      let state = renderTrends(doc, report.sentimentAnalysis.trends, y, pageNumber);
      y = state.y;
      pageNumber = state.pageNumber;

      sectionState = startSection(doc, y, pageNumber, 300);
      y = sectionState.y;
      pageNumber = sectionState.pageNumber;
      state = renderRoomAnalytics(doc, report, y, pageNumber);
      y = state.y;
      pageNumber = state.pageNumber;

      sectionState = startSection(doc, y, pageNumber, 220);
      y = sectionState.y;
      pageNumber = sectionState.pageNumber;
      state = renderLocationPerformance(doc, report.locationPerformance, y, pageNumber);
      y = state.y;
      pageNumber = state.pageNumber;

      sectionState = startSection(doc, y, pageNumber, 180);
      y = sectionState.y;
      pageNumber = sectionState.pageNumber;
      state = renderConcerns(doc, report, y, pageNumber);
      y = state.y;
      pageNumber = state.pageNumber;

      sectionState = startSection(doc, y, pageNumber, 170);
      y = sectionState.y;
      pageNumber = sectionState.pageNumber;
      state = renderCategories(doc, report, y, pageNumber);
      y = state.y;
      pageNumber = state.pageNumber;

      sectionState = startSection(doc, y, pageNumber, 150);
      y = sectionState.y;
      pageNumber = sectionState.pageNumber;
      state = renderDemographics(doc, report, y, pageNumber);
      y = state.y;
      pageNumber = state.pageNumber;

      sectionState = startSection(doc, y, pageNumber, 100);
      y = sectionState.y;
      pageNumber = sectionState.pageNumber;
      y = renderInsights(doc, report, y);

      sectionState = startSection(doc, y, pageNumber, 120);
      y = sectionState.y;
      pageNumber = sectionState.pageNumber;
      state = renderReviews(doc, report, y, pageNumber);
      pageNumber = state.pageNumber;
      drawFooter(doc, pageNumber);
      doc.end();
    } catch (error) {
      reject(error);
      doc.end();
    }
  });
}
