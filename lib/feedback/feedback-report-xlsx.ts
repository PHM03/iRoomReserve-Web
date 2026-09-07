import * as XLSX from 'xlsx';

import type {
  FeedbackAnalyticsReport,
  FeedbackAnalyticsReportLocationPerformance,
  FeedbackAnalyticsReportReview,
  FeedbackAnalyticsReportTrend,
} from './feedback-report';

const SHEET_NAMES = [
  'Summary',
  'Rating Analysis',
  'Sentiment Analysis',
  'Trends',
  'Room Analytics',
  'Location Performance',
  'Top Concerns',
  'Categories',
  'Demographics',
  'Actionable Findings',
  'Reviews',
] as const;

const MAX_XLSX_CELL_TEXT_LENGTH = 32767;

const HEADER_STYLE = {
  fill: { fgColor: { rgb: '173B6C' } },
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
};

const TITLE_STYLE = {
  font: { bold: true, sz: 16, color: { rgb: '173B6C' } },
};

const TEXT_WRAP_STYLE = {
  alignment: { vertical: 'top', wrapText: true },
};

type SheetRows = Array<Array<unknown>>;
type XlsxCell = XLSX.CellObject & { s?: unknown };
type XlsxSheet = XLSX.WorkSheet & { '!freeze'?: unknown };

function formatStringNumber(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'N/A'
    : value.toFixed(digits);
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value: string | null | undefined, fallback = 'All') {
  return value && value.trim() ? value : fallback;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date;
}

function assertExcelText(value: string, field: string) {
  if (value.length > MAX_XLSX_CELL_TEXT_LENGTH) {
    throw new RangeError(`${field} exceeds Excel's ${MAX_XLSX_CELL_TEXT_LENGTH}-character cell limit.`);
  }
  return value;
}

function safeFilenamePart(value: string) {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'scope';
}

export function getFeedbackAnalyticsReportXlsxFilename(report: FeedbackAnalyticsReport) {
  const scope = report.metadata.scope.selectedBuildingLabel || report.metadata.scope.type;
  const generatedAt = new Date(report.metadata.generatedAt);
  const datePart = Number.isNaN(generatedAt.getTime())
    ? 'report'
    : `${generatedAt.getUTCFullYear()}-${String(generatedAt.getUTCMonth() + 1).padStart(2, '0')}`;
  return `feedback-analytics-${safeFilenamePart(scope)}-${datePart}.xlsx`;
}

function cell(ws: XLSX.WorkSheet, address: string) {
  return ws[address] as XlsxCell | undefined;
}

function setCellStyle(ws: XLSX.WorkSheet, address: string, style: unknown, numberFormat?: string) {
  const target = cell(ws, address);
  if (!target) return;
  target.s = style;
  if (numberFormat) target.z = numberFormat;
}

function columnLetter(index: number) {
  return XLSX.utils.encode_col(index);
}

function setHeaderStyle(ws: XLSX.WorkSheet, rowIndex: number, columnCount: number) {
  for (let column = 0; column < columnCount; column += 1) {
    setCellStyle(ws, `${columnLetter(column)}${rowIndex + 1}`, HEADER_STYLE);
  }
  ws['!rows'] = ws['!rows'] || [];
  ws['!rows'][rowIndex] = { hpt: 28 };
}

function setColumnFormats(ws: XLSX.WorkSheet, column: number, startRow: number, endRow: number, format: string) {
  for (let row = startRow; row <= endRow; row += 1) {
    const address = `${columnLetter(column)}${row + 1}`;
    const target = cell(ws, address);
    if (target) target.z = format;
  }
}

function configureDataSheet(
  ws: XlsxSheet,
  columnWidths: number[],
  headerRow: number,
  filterEndRow: number,
  freezeRows = headerRow + 1,
) {
  ws['!cols'] = columnWidths.map((wch) => ({ wch }));
  ws['!autofilter'] = {
    ref: `A${headerRow + 1}:${columnLetter(columnWidths.length - 1)}${filterEndRow + 1}`,
  };
  // SheetJS CE does not consistently serialize pane settings, but this metadata
  // is retained on the in-memory workbook for callers that apply workbook views.
  ws['!freeze'] = { xSplit: 0, ySplit: freezeRows, topLeftCell: `A${freezeRows + 1}` };
  setHeaderStyle(ws, headerRow, columnWidths.length);
}

function createSheet(rows: SheetRows, columnWidths: number[], headerRow?: number) {
  const ws = XLSX.utils.aoa_to_sheet(rows) as XlsxSheet;
  ws['!rows'] = ws['!rows'] || [];
  if (headerRow !== undefined) {
    configureDataSheet(ws, columnWidths, headerRow, Math.max(headerRow, rows.length - 1));
  } else {
    ws['!cols'] = columnWidths.map((wch) => ({ wch }));
  }
  return ws;
}

function setTitle(ws: XLSX.WorkSheet, title: string, subtitle?: string) {
  setCellStyle(ws, 'A1', TITLE_STYLE);
  if (subtitle) {
    setCellStyle(ws, 'A2', { font: { italic: true, color: { rgb: '667085' } } });
  }
}

function formatCategoryMetrics(item: { categoryRatings: FeedbackAnalyticsReportLocationPerformance['buildings'][number]['categoryRatings'] }) {
  return Object.values(item.categoryRatings)
    .filter((category) => category)
    .map((category) => `${category!.label}: ${formatStringNumber(category!.averageRating)}`)
    .join('; ') || '-';
}

function formatLowRatingIndicators(item: { categoryRatings: FeedbackAnalyticsReportLocationPerformance['buildings'][number]['categoryRatings'] }) {
  return Object.values(item.categoryRatings)
    .filter((category) => category && category.lowRatingCount > 0)
    .map((category) => `${category!.label}: ${category!.lowRatingCount} (${formatStringNumber(category!.lowRatingRate, 1)}%)`)
    .join('; ') || '-';
}

function formatAspectMetrics(item: { aspectMentions: FeedbackAnalyticsReportLocationPerformance['buildings'][number]['aspectMentions'] }) {
  return Object.entries(item.aspectMentions)
    .filter(([, aspect]) => aspect && aspect.total > 0)
    .map(([aspect, value]) => `${titleCase(aspect)}: ${value!.total}`)
    .join('; ') || '-';
}

function buildSummarySheet(report: FeedbackAnalyticsReport) {
  const filters = report.metadata.filters;
  const scope = report.metadata.scope;
  const rows: SheetRows = [
    [report.metadata.title],
    ['e-RoomReserve / iRoomReserv'],
    ['Generated At', report.metadata.generatedAt],
    ['Campus / Building', displayValue(scope.selectedBuildingLabel, titleCase(scope.type))],
    ['Building IDs', scope.buildingIds.join(', ') || 'N/A'],
    ['Reporting Period', titleCase(report.metadata.period)],
    ['Academic Year', displayValue(report.metadata.academicYear, 'All Academic Years')],
    ['Semester', displayValue(report.metadata.semester, 'All Semesters')],
    [],
    ['Applied Filters'],
    ['Filter', 'Value'],
    ['Campus / Building', displayValue(scope.selectedBuildingLabel, titleCase(scope.type))],
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
    [],
    ['Data Overview'],
    ['Metric', 'Value', 'Percentage'],
    ['Total Reviews', report.overview.totalReviews, ''],
    ['Average Rating', report.overview.averageRating, ''],
    ['Average Sentiment Score / VADER', report.overview.averageSentimentScore, ''],
    ['Positive', report.overview.positiveCount, report.overview.positiveRate / 100],
    ['Neutral', report.overview.neutralCount, report.overview.neutralRate / 100],
    ['Negative', report.overview.negativeCount, report.overview.negativeRate / 100],
    ['Insufficient Context', report.overview.insufficientContextCount, report.overview.insufficientContextRate / 100],
  ];
  const ws = createSheet(rows, [34, 30, 18]);
  setTitle(ws, report.metadata.title, '');
  setCellStyle(ws, 'A10', HEADER_STYLE);
  setCellStyle(ws, 'A11', HEADER_STYLE);
  setCellStyle(ws, 'B11', HEADER_STYLE);
  setCellStyle(ws, 'A25', HEADER_STYLE);
  setCellStyle(ws, 'A26', HEADER_STYLE);
  setCellStyle(ws, 'B26', HEADER_STYLE);
  setCellStyle(ws, 'C26', HEADER_STYLE);
  setColumnFormats(ws, 2, 26, 32, '0.0%');
  setColumnFormats(ws, 1, 27, 27, '0.00');
  setColumnFormats(ws, 1, 28, 28, '0.000');
  return ws;
}

function buildRatingSheet(report: FeedbackAnalyticsReport) {
  const distribution = report.ratingAnalysis.distribution;
  const rows: SheetRows = [
    ['Rating Analysis'],
    ['Total Reviews', report.overview.totalReviews],
    ['Average Rating', report.overview.averageRating],
    ['Valid Rated Reviews', report.ratingAnalysis.validRatingCount],
    [],
    ['Rating', 'Count', 'Percentage'],
    ...([1, 2, 3, 4, 5] as const).map((rating) => [
      `${rating} Star${rating === 1 ? '' : 's'}`,
      distribution[rating].count,
      distribution[rating].percentage / 100,
    ]),
  ];
  const ws = createSheet(rows, [20, 16, 18], 5);
  setTitle(ws, 'Rating Analysis');
  setColumnFormats(ws, 2, 6, 10, '0.0%');
  setColumnFormats(ws, 1, 2, 2, '0.00');
  return ws;
}

function buildSentimentSheet(report: FeedbackAnalyticsReport) {
  const rows: SheetRows = [
    ['Sentiment Analysis'],
    ['Total Reviews', report.overview.totalReviews],
    ['Average VADER / Compound Score', report.sentimentAnalysis.averageCompoundScore],
    [],
    ['Sentiment Class', 'Count', 'Percentage'],
    ...report.sentimentAnalysis.distribution.map((item) => [
      item.label,
      item.count,
      item.percentage / 100,
    ]),
  ];
  const ws = createSheet(rows, [25, 16, 18], 4);
  setTitle(ws, 'Sentiment Analysis');
  setColumnFormats(ws, 2, 5, 10, '0.0%');
  setColumnFormats(ws, 1, 2, 2, '0.000');
  return ws;
}

function buildTrendsSheet(report: FeedbackAnalyticsReport) {
  const trend: FeedbackAnalyticsReportTrend = report.sentimentAnalysis.trends;
  const hasTrendData = trend.buckets.some((bucket) => bucket.totalReviews > 0 || bucket.feedbackCount > 0);
  const noTrendMessage = trend.message || 'No trend data available for the selected filters.';
  const rows: SheetRows = [
    ['Trends'],
    [trend.configured && hasTrendData ? 'Trend buckets' : noTrendMessage],
    [],
    ['Period / Bucket', 'Review Count', 'Scored Count', 'Average Rating', 'Average VADER / Compound', 'Positive Rate', 'Neutral Rate', 'Negative Rate', 'Insufficient Context Rate'],
  ];
  if (trend.buckets.length === 0 || !hasTrendData) {
    rows.push([noTrendMessage]);
  } else {
    rows.push(...trend.buckets.map((bucket) => [
      bucket.label,
      bucket.totalReviews,
      bucket.feedbackCount,
      bucket.averageRating,
      bucket.averageCompoundScore,
      bucket.positiveRate / 100,
      bucket.neutralRate / 100,
      bucket.negativeRate / 100,
      bucket.insufficientContextRate / 100,
    ]));
  }
  const ws = createSheet(rows, [24, 16, 16, 18, 26, 16, 16, 16, 24], 3);
  setTitle(ws, 'Trends');
  setColumnFormats(ws, 3, 4, rows.length - 1, '0.00');
  setColumnFormats(ws, 4, 4, rows.length - 1, '0.000');
  for (const column of [5, 6, 7, 8]) setColumnFormats(ws, column, 4, rows.length - 1, '0.0%');
  return ws;
}

function locationRows(performance: FeedbackAnalyticsReportLocationPerformance, includeAspectMetrics: boolean) {
  const items = [
    ...performance.buildings.map((item) => ({ kind: 'Building', item })),
    ...performance.floors.map((item) => ({ kind: 'Floor', item })),
    ...performance.rooms.map((item) => ({ kind: 'Room', item })),
  ];
  return items.map(({ kind, item }) => [
    kind,
    item.buildingId,
    item.floor || '',
    kind === 'Room' ? item.name : '',
    item.totalReviews,
    item.averageRating,
    item.averageCompound,
    item.positiveRate / 100,
    item.negativeRate / 100,
    titleCase(item.trendDirection),
    formatCategoryMetrics(item),
    formatLowRatingIndicators(item),
    item.relevantFacilityConcerns.join('; ') || '-',
    includeAspectMetrics ? formatAspectMetrics(item) : '-',
  ]);
}

function buildRoomSheet(report: FeedbackAnalyticsReport) {
  const rows: SheetRows = [
    ['Room Analytics'],
    ['Building identity is explicit so Whole Campus locations remain distinct.'],
    [],
    ['Building', 'Floor', 'Room', 'Review Count', 'Average Rating', 'Average VADER / Compound', 'Positive Rate', 'Negative Rate', 'Trend Direction', 'Facility Concerns', 'Category Metrics', 'Aspect Metrics'],
  ];
  const roomRows = report.roomAnalytics.rooms.map((room) => [
    room.buildingId,
    room.floor || '',
    room.name,
    room.totalReviews,
    room.averageRating,
    room.averageCompound,
    room.positiveRate / 100,
    room.negativeRate / 100,
    titleCase(room.trendDirection),
    room.relevantFacilityConcerns.join('; ') || '-',
    formatCategoryMetrics(room),
    formatAspectMetrics(room),
  ]);
  rows.push(...(roomRows.length > 0 ? roomRows : [['No room analytics matched the selected filters.']]));
  const ws = createSheet(rows, [16, 12, 22, 14, 16, 24, 15, 15, 18, 32, 42, 42], 3);
  setTitle(ws, 'Room Analytics');
  setColumnFormats(ws, 4, 4, rows.length - 1, '0.00');
  setColumnFormats(ws, 5, 4, rows.length - 1, '0.000');
  for (const column of [6, 7]) setColumnFormats(ws, column, 4, rows.length - 1, '0.0%');
  return ws;
}

function buildLocationSheet(report: FeedbackAnalyticsReport) {
  const rows: SheetRows = [
    ['Location Performance'],
    ['Building, floor, and room identities are retained for all scopes.'],
    [],
    ['Level', 'Building', 'Floor', 'Room', 'Review Count', 'Average Rating', 'Average VADER / Compound', 'Positive Rate', 'Negative Rate', 'Trend Direction', 'Category Performance', 'Low-Rating Indicators', 'Facility Concerns', 'Aspect Information'],
    ...locationRows(report.locationPerformance, true),
  ];
  if (rows.length === 4) rows.push(['No location performance matched the selected filters.']);
  const ws = createSheet(rows, [13, 16, 12, 22, 14, 16, 24, 15, 15, 18, 42, 42, 36, 42], 3);
  setTitle(ws, 'Location Performance');
  setColumnFormats(ws, 5, 4, rows.length - 1, '0.00');
  setColumnFormats(ws, 6, 4, rows.length - 1, '0.000');
  for (const column of [7, 8]) setColumnFormats(ws, column, 4, rows.length - 1, '0.0%');
  return ws;
}

function buildConcernsSheet(report: FeedbackAnalyticsReport) {
  const concerns = [
    ...report.topConcerns.negative.map((item) => ({ ...item, type: 'Concern' })),
    ...report.topConcerns.positive.map((item) => ({ ...item, type: 'Praised Aspect' })),
  ];
  const rows: SheetRows = [
    ['Top Concerns and Praised Aspects'],
    [],
    ['Type', 'Aspect', 'Sentiment', 'Count', 'Percentage', 'Locations'],
    ...concerns.map((item) => [
      item.type,
      item.label,
      item.sentiment,
      item.count,
      item.percentage / 100,
      item.locations.map((location) => `${location.buildingId} / ${location.name} (${location.count})`).join('; ') || '-',
    ]),
  ];
  if (concerns.length === 0) rows.push(['No concerns were identified for the selected filters.']);
  const ws = createSheet(rows, [18, 24, 16, 12, 16, 55], 2);
  setTitle(ws, 'Top Concerns and Praised Aspects');
  setColumnFormats(ws, 4, 3, rows.length - 1, '0.0%');
  return ws;
}

function buildCategoriesSheet(report: FeedbackAnalyticsReport) {
  const categories = Object.values(report.ratingAnalysis.categoryPerformance).filter(Boolean);
  const rows: SheetRows = [
    ['Categories'],
    [],
    ['Category', 'Average Score', 'Review Count', 'Low-Rating Count', 'Low-Rating Rate', 'Average Change', 'Low-Rating Change Points', 'Trend Direction', 'Reliable'],
    ...categories.map((item) => [
      item!.label,
      item!.averageRating,
      item!.ratingCount,
      item!.lowRatingCount,
      item!.lowRatingRate / 100,
      item!.averageChange,
      item!.lowRatingRateChangePoints,
      titleCase(item!.direction),
      item!.reliable ? 'Yes' : 'Insufficient data',
    ]),
  ];
  if (categories.length === 0) rows.push(['No category performance matched the selected filters.']);
  const ws = createSheet(rows, [28, 17, 16, 18, 18, 17, 25, 18, 20], 2);
  setTitle(ws, 'Categories');
  setColumnFormats(ws, 1, 3, rows.length - 1, '0.00');
  setColumnFormats(ws, 4, 3, rows.length - 1, '0.0%');
  return ws;
}

function buildDemographicsSheet(report: FeedbackAnalyticsReport) {
  const rows: SheetRows = [
    ['Demographics'],
    ['Analytical summaries only; no personal identifiers are exported.'],
    [],
    ['Group', 'Label', 'Review Count', 'Average Rating', 'Average VADER / Compound', 'Positive Rate', 'Neutral Rate', 'Negative Rate', 'Insufficient Context Rate', 'Reliable'],
    ...report.demographics.map((item) => [
      item.group,
      item.label,
      item.totalReviews,
      item.averageRating,
      item.averageCompound,
      item.positiveRate / 100,
      item.neutralRate / 100,
      item.negativeRate / 100,
      item.insufficientContextRate / 100,
      item.reliable ? 'Yes' : 'Insufficient data',
    ]),
  ];
  if (report.demographics.length === 0) rows.push(['No demographic analytics matched the selected filters.']);
  const ws = createSheet(rows, [24, 20, 16, 17, 24, 15, 15, 15, 24, 20], 3);
  setTitle(ws, 'Demographics');
  setColumnFormats(ws, 3, 4, rows.length - 1, '0.00');
  setColumnFormats(ws, 4, 4, rows.length - 1, '0.000');
  for (const column of [5, 6, 7, 8]) setColumnFormats(ws, column, 4, rows.length - 1, '0.0%');
  return ws;
}

function buildInsightsSheet(report: FeedbackAnalyticsReport) {
  const analysis = report.actionableInsights.analysis;
  const rows: SheetRows = [
    ['Actionable Findings'],
    [],
    ['Finding', 'Supporting Value'],
    ...report.actionableInsights.items.map((item) => [item, '']),
    [],
    ['Structured Analysis', 'Value'],
    ['Sentiment Direction', analysis.sentimentDirection],
    ['Current Average Compound Score', analysis.currentAverageCompoundScore],
    ['Previous Average Compound Score', analysis.previousAverageCompoundScore],
    ['Current Positive Rate', analysis.currentPositiveRate / 100],
    ['Previous Positive Rate', analysis.previousPositiveRate === null ? 'N/A' : analysis.previousPositiveRate / 100],
    ['Current Negative Rate', analysis.currentNegativeRate / 100],
    ['Previous Negative Rate', analysis.previousNegativeRate === null ? 'N/A' : analysis.previousNegativeRate / 100],
    ['Positive Rate Change Points', analysis.positiveRateChangePoints],
    ['Negative Rate Change Points', analysis.negativeRateChangePoints],
  ];
  if (report.actionableInsights.items.length === 0) rows.push(['No actionable findings were produced for the selected filters.']);
  const ws = createSheet(rows, [80, 28], 2);
  setTitle(ws, 'Actionable Findings');
  setColumnFormats(ws, 1, 7, 7, '0.000');
  setColumnFormats(ws, 1, 8, 9, '0.0%');
  setColumnFormats(ws, 1, 10, 11, '0.0');
  return ws;
}

function formatDetectedAspects(review: FeedbackAnalyticsReportReview) {
  return Object.entries(review.detectedAspects)
    .map(([aspect, sentiment]) => `${titleCase(aspect)}: ${sentiment}`)
    .join('; ') || '-';
}

function buildReviewsSheet(report: FeedbackAnalyticsReport) {
  const rows: SheetRows = [
    ['Reviews'],
    ['Privacy-conscious export; userId, reservationId, and userName are intentionally excluded.'],
    [],
    ['Date', 'Building', 'Building ID', 'Floor', 'Room', 'Rating', 'Final Sentiment', 'Raw VADER / Compound Score', 'Feedback Text', 'Detected Aspects', 'Extracted Keywords', 'Admin Response'],
    ...report.reviews.map((review) => [
      formatDate(review.date),
      review.buildingName,
      review.buildingId,
      review.floor || '',
      review.roomName,
      review.rating,
      review.sentiment,
      review.sentimentScore,
      assertExcelText(review.feedbackText, 'Feedback text'),
      formatDetectedAspects(review),
      review.extractedKeywords.join(', '),
      assertExcelText(review.adminResponse || '', 'Admin response'),
    ]),
  ];
  if (report.reviews.length === 0) rows.push(['No reviews matched the selected filters.']);
  const ws = createSheet(rows, [20, 20, 16, 12, 22, 10, 24, 24, 70, 40, 30, 60], 3);
  setTitle(ws, 'Reviews');
  setColumnFormats(ws, 5, 4, rows.length - 1, '0');
  setColumnFormats(ws, 7, 4, rows.length - 1, '0.000');
  for (let row = 4; row <= rows.length; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      const address = `${columnLetter(column)}${row}`;
      const target = cell(ws, address);
      if (target) target.s = TEXT_WRAP_STYLE;
    }
    ws['!rows']![row - 1] = { hpt: 45 };
  }
  return ws;
}

export function buildFeedbackAnalyticsReportXlsx(report: FeedbackAnalyticsReport): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const sheets: Array<[string, XLSX.WorkSheet]> = [
    ['Summary', buildSummarySheet(report)],
    ['Rating Analysis', buildRatingSheet(report)],
    ['Sentiment Analysis', buildSentimentSheet(report)],
    ['Trends', buildTrendsSheet(report)],
    ['Room Analytics', buildRoomSheet(report)],
    ['Location Performance', buildLocationSheet(report)],
    ['Top Concerns', buildConcernsSheet(report)],
    ['Categories', buildCategoriesSheet(report)],
    ['Demographics', buildDemographicsSheet(report)],
    ['Actionable Findings', buildInsightsSheet(report)],
    ['Reviews', buildReviewsSheet(report)],
  ];
  sheets.forEach(([name, worksheet]) => XLSX.utils.book_append_sheet(workbook, worksheet, name));
  workbook.SheetNames = SHEET_NAMES.slice() as unknown as string[];
  return workbook;
}

export function generateFeedbackAnalyticsReportXlsx(report: FeedbackAnalyticsReport): Uint8Array {
  const workbook = buildFeedbackAnalyticsReportXlsx(report);
  const output = XLSX.write(workbook, {
    bookType: 'xlsx',
    cellDates: true,
    cellStyles: true,
    type: 'buffer',
  }) as Buffer;
  return new Uint8Array(output);
}
