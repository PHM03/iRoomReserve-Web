import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';

import type {
  FeedbackAnalyticsReport,
  FeedbackAnalyticsReportReview,
  FeedbackAnalyticsReportTrend,
} from './feedback-report';
import type { CategoryPerformance, DemographicPerformance, LocationPerformance } from './feedback-analytics';

const COLORS = {
  deepMaroon: '7A191C',
  primaryMaroon: 'A12124',
  paleMaroon: 'F8E7E7',
  text: '222222',
  muted: '667085',
  border: 'D9D9D9',
  paleGray: 'F6F7F9',
  white: 'FFFFFF',
  positive: '166534',
  negative: 'B91C1C',
  warning: 'A16207',
  teal: '0F766E',
  purple: '6D28D9',
};

const CELL_MARGINS = { top: 100, bottom: 100, left: 120, right: 120 };
const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
  left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
  right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
};

type CellValue = string | number | null | undefined;
type ReportChild = Paragraph | Table;

function displayValue(value: CellValue, fallback = 'No data available') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function formatNumber(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'No data'
    : value.toFixed(digits);
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'No data'
    : `${value.toFixed(1)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'No data available';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(date);
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return 'No date';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(date);
}

function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function sentimentLabel(value: string) {
  return titleCase(value);
}

function safeFilenamePart(value: string) {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return normalized
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report';
}

function textRun(text: string, options: { bold?: boolean; color?: string; size?: number; italic?: boolean } = {}) {
  return new TextRun({
    text,
    font: 'Aptos',
    size: options.size ?? 20,
    bold: options.bold,
    color: options.color ?? COLORS.text,
    italics: options.italic,
  });
}

function paragraph(
  text: string,
  options: { bold?: boolean; color?: string; size?: number; italic?: boolean; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
) {
  return new Paragraph({
    alignment: options.alignment,
    spacing: { after: 120, line: 276 },
    children: [textRun(text, options)],
  });
}

function sectionHeading(title: string, level: 1 | 2 | 3 = 1) {
  const heading = level === 1
    ? HeadingLevel.HEADING_1
    : level === 2
      ? HeadingLevel.HEADING_2
      : HeadingLevel.HEADING_3;
  return new Paragraph({
    heading,
    keepNext: true,
    spacing: { before: level === 1 ? 300 : 180, after: 120 },
    children: [textRun(title, {
      bold: true,
      color: COLORS.deepMaroon,
      size: level === 1 ? 28 : level === 2 ? 24 : 21,
    })],
  });
}

function tableCell(
  value: CellValue,
  options: { header?: boolean; alternate?: boolean; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
) {
  const header = options.header === true;
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    shading: {
      type: ShadingType.CLEAR,
      fill: header ? COLORS.deepMaroon : options.alternate ? COLORS.paleGray : COLORS.white,
    },
    children: [new Paragraph({
      alignment: options.align,
      spacing: { after: 0, line: 240 },
      children: [textRun(displayValue(value), {
        bold: header,
        color: header ? COLORS.white : COLORS.text,
        size: 18,
      })],
    })],
  });
}

function dataTable(headers: string[], rows: CellValue[][], columnWidths?: number[]) {
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((header, index) => tableCell(header, {
      header: true,
      width: columnWidths?.[index],
    })),
  });
  const bodyRows = rows.map((row, rowIndex) => new TableRow({
    cantSplit: true,
    children: headers.map((_, columnIndex) => tableCell(row[columnIndex], {
      alternate: rowIndex % 2 === 1,
      width: columnWidths?.[columnIndex],
    })),
  }));

  return new Table({
    rows: [headerRow, ...bodyRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths,
    layout: 'fixed',
    borders: TABLE_BORDERS,
    margins: CELL_MARGINS,
  });
}

function emptyTableMessage(message = 'No data available for the selected filters.') {
  return paragraph(message, { italic: true, color: COLORS.muted });
}

function renderTrendTable(
  children: ReportChild[],
  title: string,
  trend: FeedbackAnalyticsReportTrend,
  mode: 'rating' | 'sentiment',
) {
  children.push(sectionHeading(title, 2));
  if (!trend.configured || trend.buckets.length === 0) {
    children.push(emptyTableMessage(trend.message || 'No trend data available for the selected filters.'));
    return;
  }

  const rows = trend.buckets.map((bucket) => mode === 'rating'
    ? [
        bucket.label,
        bucket.totalReviews,
        formatNumber(bucket.averageRating),
        formatNumber(bucket.averageCompound ?? bucket.averageCompoundScore, 3),
      ]
    : [
        bucket.label,
        bucket.totalReviews,
        formatPercent(bucket.positiveRate),
        formatPercent(bucket.neutralRate),
        formatPercent(bucket.negativeRate),
        formatPercent(bucket.insufficientContextRate),
      ]);

  children.push(mode === 'rating'
    ? dataTable(['Period / Bucket', 'Reviews', 'Average Rating', 'Average VADER / Compound'], rows, [3000, 1200, 1900, 3260])
    : dataTable(['Period / Bucket', 'Reviews', 'Positive', 'Neutral', 'Negative', 'Insufficient Context'], rows, [2600, 1100, 1400, 1400, 1400, 1460]));
}

function locationLabel(report: FeedbackAnalyticsReport, buildingId: string) {
  return report.metadata.scope.buildings.find((building) => building.id === buildingId)?.label || buildingId;
}

function performanceRows(items: LocationPerformance[]) {
  return items.map((item) => [
    item.name,
    item.buildingId,
    item.floor || 'All floors',
    item.totalReviews,
    formatNumber(item.averageRating),
    formatNumber(item.averageCompound, 3),
    `${formatPercent(item.positiveRate)} / ${formatPercent(item.negativeRate)}`,
    titleCase(item.trendDirection),
  ]);
}

function renderPerformanceTable(children: ReportChild[], title: string, items: LocationPerformance[]) {
  children.push(sectionHeading(title, 2));
  if (items.length === 0) {
    children.push(emptyTableMessage());
    return;
  }

  children.push(dataTable(
    ['Location', 'Building', 'Floor', 'Reviews', 'Average Rating', 'Average VADER', 'Positive / Negative', 'Trend'],
    performanceRows(items),
    [1600, 1200, 1200, 700, 1250, 1250, 1450, 710],
  ));
}

function renderRoomHierarchy(children: ReportChild[], report: FeedbackAnalyticsReport) {
  const roomItems = report.roomAnalytics.rooms;
  if (roomItems.length === 0) {
    children.push(emptyTableMessage());
    return;
  }

  const buildingIds = [
    ...report.metadata.scope.buildings.map((building) => building.id),
    ...roomItems.map((room) => room.buildingId),
  ].filter((id, index, values) => id && values.indexOf(id) === index);

  for (const buildingId of buildingIds) {
    const buildingRooms = roomItems.filter((room) => room.buildingId === buildingId);
    if (buildingRooms.length === 0) continue;
    children.push(sectionHeading(`Building ${locationLabel(report, buildingId)}`, 2));

    const floorValues = [...new Set(buildingRooms.map((room) => room.floor || 'Unspecified'))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    for (const floor of floorValues) {
      children.push(sectionHeading(`Floor ${floor}`, 3));
      children.push(dataTable(
        ['Room', 'Reviews', 'Average Rating', 'Average VADER', 'Positive / Negative', 'Trend'],
        buildingRooms
          .filter((room) => (room.floor || 'Unspecified') === floor)
          .map((room) => [
            room.name,
            room.totalReviews,
            formatNumber(room.averageRating),
            formatNumber(room.averageCompound, 3),
            `${formatPercent(room.positiveRate)} / ${formatPercent(room.negativeRate)}`,
            titleCase(room.trendDirection),
          ]),
        [2200, 900, 1450, 1450, 2000, 1360],
      ));
    }
  }
}

function renderConcernTable(children: ReportChild[], title: string, concerns: FeedbackAnalyticsReport['topConcerns']['negative']) {
  children.push(sectionHeading(title, 2));
  if (concerns.length === 0) {
    children.push(emptyTableMessage());
    return;
  }

  children.push(dataTable(
    ['Aspect', 'Sentiment', 'Count', 'Percentage', 'Relevant Locations'],
    concerns.map((concern) => [
      concern.label,
      titleCase(concern.sentiment),
      concern.count,
      formatPercent(concern.percentage),
      concern.locations.length > 0
        ? concern.locations.map((location) => `${location.name} (${location.floor || 'No floor'}) - ${location.count}`).join('; ')
        : 'No location detail',
    ]),
    [1900, 1100, 800, 1100, 4460],
  ));
}

function renderCategoryTable(children: ReportChild[], report: FeedbackAnalyticsReport) {
  children.push(sectionHeading('Categories', 1));
  const categories = Object.values(report.ratingAnalysis.categoryPerformance).filter(
    (category): category is CategoryPerformance => Boolean(category),
  );
  if (categories.length === 0) {
    children.push(emptyTableMessage());
    return;
  }

  children.push(dataTable(
    ['Category', 'Average Rating', 'Ratings', 'Low Rating Rate', 'Negative Mentions', 'Change', 'Direction', 'Reliable'],
    categories.map((category) => [
      category.label,
      formatNumber(category.averageRating),
      category.ratingCount,
      formatPercent(category.lowRatingRate),
      category.negativeMentionCount,
      category.averageChange === null ? 'No comparison' : formatNumber(category.averageChange),
      titleCase(category.direction),
      category.reliable ? 'Yes' : 'No',
    ]),
    [1650, 1250, 700, 1250, 1100, 900, 1350, 1160],
  ));
}

function renderDemographicTable(children: ReportChild[], demographics: DemographicPerformance[]) {
  children.push(sectionHeading('Demographics', 1));
  if (demographics.length === 0) {
    children.push(emptyTableMessage());
    return;
  }

  children.push(dataTable(
    ['Group', 'Label', 'Reviews', 'Average Rating', 'Average VADER', 'Positive', 'Negative', 'Reliable'],
    demographics.map((item) => [
      item.group,
      item.label,
      item.totalReviews,
      formatNumber(item.averageRating),
      formatNumber(item.averageCompound, 3),
      formatPercent(item.positiveRate),
      formatPercent(item.negativeRate),
      item.reliable ? 'Yes' : 'No',
    ]),
    [1100, 1700, 800, 1250, 1250, 1100, 1100, 1060],
  ));
}

function renderInsights(children: ReportChild[], report: FeedbackAnalyticsReport) {
  children.push(sectionHeading('Actionable Insights', 1));
  if (report.actionableInsights.items.length === 0) {
    children.push(emptyTableMessage());
  } else {
    for (const item of report.actionableInsights.items) {
      children.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 90, line: 276 },
        children: [textRun(item)],
      }));
    }
  }

  const analysis = report.actionableInsights.analysis;
  children.push(sectionHeading('Structured Insight Analysis', 2));
  children.push(dataTable(
    ['Measure', 'Value'],
    [
      ['Sentiment Direction', titleCase(analysis.sentimentDirection)],
      ['Current Average VADER', formatNumber(analysis.currentAverageCompoundScore, 3)],
      ['Previous Average VADER', formatNumber(analysis.previousAverageCompoundScore, 3)],
      ['Best Room', analysis.bestRoom ? `${analysis.bestRoom.roomName} (${analysis.bestRoom.feedbackCount} reviews)` : 'No data'],
      ['Room Needing Attention', analysis.roomNeedingAttention ? `${analysis.roomNeedingAttention.roomName} (${analysis.roomNeedingAttention.feedbackCount} reviews)` : 'No data'],
      ['Top Concern', analysis.topConcern ? `${analysis.topConcern.label} (${analysis.topConcern.count})` : 'No data'],
      ['Most Praised', analysis.mostPraised ? `${analysis.mostPraised.label} (${analysis.mostPraised.count})` : 'No data'],
      ['Current Positive Rate', formatPercent(analysis.currentPositiveRate)],
      ['Current Negative Rate', formatPercent(analysis.currentNegativeRate)],
    ],
    [3000, 6360],
  ));
}

function renderReview(children: ReportChild[], review: FeedbackAnalyticsReportReview, index: number) {
  children.push(sectionHeading(`Review ${index + 1}`, 2));
  children.push(dataTable(
    ['Field', 'Value'],
    [
      ['Date', formatDateOnly(review.date)],
      ['Building', review.buildingName || review.buildingId],
      ['Floor', review.floor || 'No floor recorded'],
      ['Room', review.roomName],
      ['Rating', review.rating === null ? 'No rating' : `${review.rating} / 5`],
      ['Sentiment', sentimentLabel(review.sentiment)],
      ['Sentiment Score', formatNumber(review.sentimentScore, 3)],
      ['Detected Aspects', Object.keys(review.detectedAspects).length > 0 ? Object.entries(review.detectedAspects).map(([key, value]) => `${titleCase(key)}: ${value}`).join('; ') : 'None'],
      ['Extracted Keywords', review.extractedKeywords.length > 0 ? review.extractedKeywords.join(', ') : 'None'],
    ],
    [2200, 7160],
  ));
  children.push(paragraph('Feedback Text', { bold: true, color: COLORS.deepMaroon, size: 19 }));
  children.push(paragraph(review.feedbackText || 'No feedback text available.'));
  if (review.adminResponse) {
    children.push(paragraph('Administrator Response', { bold: true, color: COLORS.deepMaroon, size: 19 }));
    children.push(paragraph(review.adminResponse));
  }
}

function renderReportReviews(children: ReportChild[], report: FeedbackAnalyticsReport) {
  children.push(sectionHeading('Review Details', 1));
  if (report.reviews.length === 0) {
    children.push(emptyTableMessage());
    return;
  }

  report.reviews.forEach((review, index) => renderReview(children, review, index));
}

function renderMetadataTable(report: FeedbackAnalyticsReport) {
  const filters = report.metadata.filters;
  const appliedFilters = [
    `Scope: ${titleCase(filters.locationScope)}`,
    `Floor: ${displayValue(filters.floor, 'All floors')}`,
    `Room: ${displayValue(filters.roomId, 'All rooms')}`,
    `Rating: ${filters.star === null ? 'All ratings' : `${filters.star} stars`}`,
    `Date range: ${filters.dateFrom || 'Any start'} to ${filters.dateTo || 'Any end'}`,
    `Role: ${displayValue(filters.role, 'All roles')}`,
    `Gender: ${displayValue(filters.gender, 'All genders')}`,
  ].join('; ');

  return dataTable(
    ['Report Field', 'Value'],
    [
      ['Generated', formatDate(report.metadata.generatedAt)],
      ['Building / Scope', report.metadata.scope.selectedBuildingLabel || titleCase(report.metadata.scope.type)],
      ['Reporting Period', titleCase(report.metadata.period)],
      ['Academic Year', displayValue(report.metadata.academicYear, 'All academic years')],
      ['Semester', displayValue(report.metadata.semester, 'All semesters')],
      ['Applied Filters', appliedFilters],
    ],
    [2200, 7160],
  );
}

export function getFeedbackAnalyticsReportDocxFilename(report: FeedbackAnalyticsReport) {
  const scope = report.metadata.scope.selectedBuildingLabel || report.metadata.scope.type;
  const date = new Date(report.metadata.generatedAt);
  const datePart = Number.isNaN(date.getTime())
    ? 'report'
    : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  return `feedback-analytics-${safeFilenamePart(scope)}-${datePart}.docx`;
}

export async function generateFeedbackAnalyticsReportDocx(report: FeedbackAnalyticsReport): Promise<Buffer> {
  const children: ReportChild[] = [
    new Paragraph({
      style: 'Title',
      spacing: { after: 180 },
      children: [textRun(report.metadata.title || 'Feedback Analytics Report', {
        bold: true,
        color: COLORS.deepMaroon,
        size: 34,
      })],
    }),
    paragraph('e-RoomReserve Feedback Analytics', { color: COLORS.primaryMaroon, bold: true, size: 22 }),
    renderMetadataTable(report),
    new Paragraph({ children: [new PageBreak()] }),
    sectionHeading('Executive Overview', 1),
    dataTable(
      ['Measure', 'Value', 'Rate / Detail'],
      [
        ['Total Reviews', report.overview.totalReviews, ''],
        ['Average Rating', report.overview.averageRating === null ? 'No rating' : `${formatNumber(report.overview.averageRating)} / 5`, ''],
        ['Positive Reviews', report.overview.positiveCount, formatPercent(report.overview.positiveRate)],
        ['Neutral Reviews', report.overview.neutralCount, formatPercent(report.overview.neutralRate)],
        ['Negative Reviews', report.overview.negativeCount, formatPercent(report.overview.negativeRate)],
        ['Insufficient Context Reviews', report.overview.insufficientContextCount, formatPercent(report.overview.insufficientContextRate)],
        ['Average Sentiment Score', formatNumber(report.overview.averageSentimentScore, 3), 'VADER / Compound'],
      ],
      [3300, 2000, 4060],
    ),
    sectionHeading('Rating Analysis', 1),
    dataTable(
      ['Rating', 'Count', 'Percentage'],
      [1, 2, 3, 4, 5].map((rating) => {
        const item = report.ratingAnalysis.distribution[rating as 1 | 2 | 3 | 4 | 5];
        return [`${rating} star${rating === 1 ? '' : 's'}`, item?.count ?? 0, formatPercent(item?.percentage ?? report.ratingAnalysis.percentages[rating as 1 | 2 | 3 | 4 | 5] ?? 0)];
      }),
      [4200, 2200, 2960],
    ),
  ];

  renderTrendTable(children, 'Rating Trends', report.ratingAnalysis.trends, 'rating');

  children.push(sectionHeading('Sentiment Analysis', 1));
  children.push(paragraph(`Average VADER / compound score: ${formatNumber(report.sentimentAnalysis.averageCompoundScore, 3)}`));
  const sentimentByLabel = new Map(report.sentimentAnalysis.distribution.map((item) => [item.label, item]));
  children.push(dataTable(
    ['Sentiment', 'Count', 'Percentage'],
    report.sentimentAnalysis.sentimentLabels.map((label) => {
      const item = sentimentByLabel.get(label);
      return [sentimentLabel(label), item?.count ?? 0, formatPercent(item?.percentage ?? 0)];
    }),
    [4200, 2200, 2960],
  ));

  renderTrendTable(children, 'Sentiment Trends', report.sentimentAnalysis.trends, 'sentiment');

  children.push(sectionHeading('Trends', 1));
  children.push(paragraph('The rating and sentiment trend tables above use the existing report trend data and preserve the selected reporting period.'));

  children.push(sectionHeading('Room Analytics', 1));
  renderPerformanceTable(children, 'Building Summary', report.roomAnalytics.buildings);
  renderRoomHierarchy(children, report);

  children.push(sectionHeading('Location Performance', 1));
  renderPerformanceTable(children, 'Buildings', report.locationPerformance.buildings);
  renderPerformanceTable(children, 'Floors', report.locationPerformance.floors);
  renderPerformanceTable(children, 'Rooms', report.locationPerformance.rooms);

  children.push(sectionHeading('Top Concerns', 1));
  renderConcernTable(children, 'Concerns', report.topConcerns.negative);
  renderConcernTable(children, 'Praised Aspects', report.topConcerns.positive);

  renderCategoryTable(children, report);
  renderDemographicTable(children, report.demographics);
  renderInsights(children, report);
  renderReportReviews(children, report);

  const document = new Document({
    title: report.metadata.title,
    subject: 'Feedback Analytics Report',
    creator: 'e-RoomReserve',
    description: 'Feedback analytics findings generated from the shared FeedbackAnalyticsReport contract.',
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720, header: 360, footer: 360 },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120 },
            children: [
              textRun('e-RoomReserve Feedback Analytics  |  Page ', { color: COLORS.muted, size: 16 }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Aptos', size: 16, color: COLORS.muted }),
            ],
          })],
        }),
      },
      children,
    }],
  });

  return Packer.toBuffer(document);
}
