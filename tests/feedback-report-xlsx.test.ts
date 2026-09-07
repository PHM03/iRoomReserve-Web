import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { buildFeedbackAnalyticsReport } from '../lib/feedback/feedback-report';
import { buildFeedbackDemographicAnalytics, buildFeedbackLocationAnalytics, compareCategoryPerformance, summarizeFeedbackAnalytics } from '../lib/feedback/feedback-analytics';
import { buildFeedbackInsights } from '../lib/feedback/feedback-insights';
import { summarizeFeedbackSentiment } from '../lib/feedback/feedback-sentiment';
import { buildSentimentTrend } from '../lib/feedback/feedback-trend';
import { buildFeedbackAnalyticsReportXlsx, generateFeedbackAnalyticsReportXlsx, getFeedbackAnalyticsReportXlsxFilename } from '../lib/feedback/feedback-report-xlsx';
import type { Feedback } from '../lib/feedback/feedback';

function feedback(input: Record<string, unknown> = {}): Feedback {
  return {
    id: String(input.id ?? 'review'),
    reservationId: 'private-reservation',
    userId: 'private-user',
    userName: 'Private Reviewer',
    buildingId: 'gd1',
    buildingName: 'GD1',
    roomId: 'gd1-room-101',
    roomName: 'Room 101',
    rating: 4,
    overallRating: 4,
    compoundScore: 0.8,
    vaderCompoundScore: 0.8,
    sentimentClassification: 'very_positive',
    categoryRatings: { cleanliness: 4, comfort: 4, air_conditioning: 4, equipment_projector: 4, internet_connectivity: 4 },
    detectedAspects: { cleanliness: 'positive' },
    extractedKeywords: ['cleanliness'],
    text: 'The room was clean.',
    message: 'The room was clean.',
    feedbackText: 'The room was clean.',
    adminResponse: null,
    role: 'Student',
    gender: 'female',
    createdAt: { toDate: () => new Date('2026-08-24T09:00:00Z') },
    ...input,
  } as unknown as Feedback;
}

function buildReport(items: Feedback[]) {
  const rooms = [
    { id: 'gd1-room-101', name: 'Room 101', buildingId: 'gd1', floor: '1' },
    { id: 'gd2-room-101', name: 'Room 101', buildingId: 'gd2', floor: '1' },
    { id: 'gd3-room-201', name: 'Room 201', buildingId: 'gd3', floor: '2' },
  ];
  const previous: Feedback[] = [];
  return buildFeedbackAnalyticsReport({
    filteredFeedback: items,
    filters: {
      scope: 'main-whole-campus', locationScope: 'building', floor: '', roomId: '', period: 'monthly',
      academicYear: 'A.Y. 2026-2027', semester: '1st Semester', star: null,
      dateFrom: '2026-08-01', dateTo: '2026-08-31', role: 'Student', gender: 'female',
    },
    scope: {
      type: 'whole_campus', selectedBuildingId: null, selectedBuildingLabel: 'Main Campus - Whole Campus',
      buildingIds: ['gd1', 'gd2', 'gd3'], buildings: [{ id: 'gd1', label: 'GD1' }, { id: 'gd2', label: 'GD2' }, { id: 'gd3', label: 'GD3' }],
    },
    metrics: summarizeFeedbackAnalytics(items),
    sentimentSummary: summarizeFeedbackSentiment(items),
    categoryPerformance: compareCategoryPerformance(items, previous, false),
    locationAnalytics: buildFeedbackLocationAnalytics(items, previous, rooms, false),
    demographicAnalytics: buildFeedbackDemographicAnalytics(items),
    trend: buildSentimentTrend(items, 'monthly', new Date('2026-08-31T12:00:00Z')),
    insights: buildFeedbackInsights(items, previous, false, rooms),
    generatedAt: '2026-09-07T00:00:00Z',
  });
}

function readRows(workbook: XLSX.WorkBook, sheetName: string) {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true }) as unknown[][];
}

function readWorkbook(bytes: Uint8Array) {
  return XLSX.read(Buffer.from(bytes), { type: 'buffer', cellDates: true });
}

describe('feedback analytics XLSX report', () => {
  it('generates the expected workbook sheets and summary metadata', () => {
    const report = buildReport([feedback()]);
    const workbook = buildFeedbackAnalyticsReportXlsx(report);

    expect(workbook.SheetNames).toEqual([
      'Summary', 'Rating Analysis', 'Sentiment Analysis', 'Trends', 'Room Analytics',
      'Location Performance', 'Top Concerns', 'Categories', 'Demographics', 'Actionable Findings', 'Reviews',
    ]);
    const summary = readRows(workbook, 'Summary');
    expect(summary[0][0]).toBe('Feedback Analytics Findings Report');
    expect(summary.find((row) => row[0] === 'Campus / Building')?.[1]).toBe('Main Campus - Whole Campus');
    expect(summary.find((row) => row[0] === 'Gender')?.[1]).toBe('female');
    expect(summary.find((row) => row[0] === 'Total Reviews')?.[1]).toBe(1);
  });

  it('round-trips rating, six-class sentiment, trend, and filter values', () => {
    const report = buildReport([
      feedback({ rating: 1, overallRating: 1, sentimentClassification: 'very_negative' }),
      feedback({ id: 'neutral', rating: 3, overallRating: 3, sentimentClassification: 'neutral', compoundScore: 0, vaderCompoundScore: 0 }),
      feedback({ id: 'insufficient', rating: 5, overallRating: 5, sentimentClassification: 'insufficient_context', compoundScore: 0.2, vaderCompoundScore: 0.2 }),
    ]);
    const workbook = readWorkbook(generateFeedbackAnalyticsReportXlsx(report));
    const ratingRows = readRows(workbook, 'Rating Analysis');
    const sentimentRows = readRows(workbook, 'Sentiment Analysis');
    const trendRows = readRows(workbook, 'Trends');

    expect(ratingRows.slice(6, 11).map((row) => row[1])).toEqual([1, 0, 1, 0, 1]);
    expect(sentimentRows.slice(5, 11).map((row) => row[0])).toEqual([
      'very_positive', 'positive', 'neutral', 'negative', 'very_negative', 'insufficient_context',
    ]);
    expect(sentimentRows.find((row) => row[0] === 'neutral')?.[1]).toBe(1);
    expect(sentimentRows.find((row) => row[0] === 'insufficient_context')?.[1]).toBe(1);
    expect(trendRows[3]).toEqual([
      'Period / Bucket', 'Review Count', 'Scored Count', 'Average Rating', 'Average VADER / Compound',
      'Positive Rate', 'Neutral Rate', 'Negative Rate', 'Insufficient Context Rate',
    ]);
    expect(trendRows.length).toBeGreaterThan(4);
  });

  it('preserves Whole Campus building identity and report row counts', () => {
    const report = buildReport([
      feedback({ id: 'gd1-review', buildingId: 'gd1', buildingName: 'GD1', roomId: 'gd1-room-101' }),
      feedback({ id: 'gd2-review', buildingId: 'gd2', buildingName: 'GD2', roomId: 'gd2-room-101' }),
      feedback({ id: 'gd3-review', buildingId: 'gd3', buildingName: 'GD3', roomId: 'gd3-room-201' }),
    ]);
    const workbook = readWorkbook(generateFeedbackAnalyticsReportXlsx(report));
    const rooms = readRows(workbook, 'Room Analytics').slice(4);
    const locations = readRows(workbook, 'Location Performance').slice(4);
    const reviews = readRows(workbook, 'Reviews').slice(4);

    expect(rooms.map((row) => row[0])).toEqual(['gd1', 'gd2', 'gd3']);
    expect(locations.some((row) => row[1] === 'gd1')).toBe(true);
    expect(locations.some((row) => row[1] === 'gd2')).toBe(true);
    expect(locations.some((row) => row[1] === 'gd3')).toBe(true);
    expect(reviews).toHaveLength(report.reviews.length);
  });

  it('exports full privacy-conscious review content without internal identifiers', () => {
    const longText = 'Long feedback text '.repeat(500);
    const report = buildReport([feedback({ feedbackText: longText, text: longText, message: longText, adminResponse: 'Response recorded.' })]);
    const workbook = readWorkbook(generateFeedbackAnalyticsReportXlsx(report));
    const reviews = readRows(workbook, 'Reviews');
    const serialized = JSON.stringify(reviews);

    expect(reviews[4][8]).toBe(longText);
    expect(reviews[4][11]).toBe('Response recorded.');
    expect(serialized).not.toContain('private-user');
    expect(serialized).not.toContain('private-reservation');
    expect(serialized).not.toContain('Private Reviewer');
  });

  it('creates a valid empty workbook with explicit no-data messages', () => {
    const report = buildReport([]);
    const workbook = readWorkbook(generateFeedbackAnalyticsReportXlsx(report));
    const trendRows = readRows(workbook, 'Trends');
    const reviewRows = readRows(workbook, 'Reviews');
    const allValues = JSON.stringify(workbook);

    expect(workbook.SheetNames).toHaveLength(11);
    expect(trendRows.some((row) => row.some((cell) => typeof cell === 'string' && cell.includes('No trend data available')))).toBe(true);
    expect(reviewRows.some((row) => row.some((cell) => typeof cell === 'string' && cell.includes('No reviews matched')))).toBe(true);
    expect(allValues).not.toMatch(/NaN|Infinity|undefined|\[object Object\]/);
  });

  it('uses a deterministic privacy-safe filename', () => {
    expect(getFeedbackAnalyticsReportXlsxFilename(buildReport([]))).toBe(
      'feedback-analytics-main-campus-whole-campus-2026-09.xlsx',
    );
  });
});
