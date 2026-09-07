import { describe, expect, it } from 'vitest';

import { buildFeedbackAnalyticsReport } from '../lib/feedback/feedback-report';
import { buildFeedbackDemographicAnalytics, buildFeedbackLocationAnalytics, compareCategoryPerformance, summarizeFeedbackAnalytics } from '../lib/feedback/feedback-analytics';
import { buildFeedbackInsights } from '../lib/feedback/feedback-insights';
import { summarizeFeedbackSentiment } from '../lib/feedback/feedback-sentiment';
import { buildSentimentTrend } from '../lib/feedback/feedback-trend';
import { generateFeedbackAnalyticsReportPdf, getFeedbackAnalyticsReportFilename } from '../lib/feedback/feedback-report-pdf';
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

function report(items: Feedback[]) {
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

describe('feedback analytics PDF report', () => {
  it('generates a PDF from the shared report contract', async () => {
    const pdf = await generateFeedbackAnalyticsReportPdf(report([feedback()]));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2_000);
    expect(pdf.toString('latin1')).not.toContain('private-user');
    expect(pdf.toString('latin1')).not.toContain('private-reservation');
  });

  it('uses report metadata for a safe deterministic filename', () => {
    expect(getFeedbackAnalyticsReportFilename(report([feedback()]))).toBe(
      'feedback-analytics-main-campus-whole-campus-2026-09.pdf',
    );
  });

  it('handles all six sentiment classes and Whole Campus identity without a second data source', async () => {
    const pdf = await generateFeedbackAnalyticsReportPdf(report([
      feedback({ id: 'gd1', sentimentClassification: 'very_positive', buildingId: 'gd1', buildingName: 'GD1', roomId: 'gd1-room-101' }),
      feedback({ id: 'gd2', sentimentClassification: 'neutral', buildingId: 'gd2', buildingName: 'GD2', roomId: 'gd2-room-101' }),
      feedback({ id: 'gd3', sentimentClassification: 'insufficient_context', buildingId: 'gd3', buildingName: 'GD3', roomId: 'gd3-room-201' }),
    ]));
    const generated = report([]);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(generated.sentimentAnalysis.distribution.map((item) => item.label)).toEqual([
      'very_positive', 'positive', 'neutral', 'negative', 'very_negative', 'insufficient_context',
    ]);
    expect(generated.roomAnalytics.rooms.map((room) => room.buildingId)).toEqual(['gd1', 'gd2', 'gd3']);
  });

  it('generates a zero-review report and a long-review report', async () => {
    const emptyPdf = await generateFeedbackAnalyticsReportPdf(report([]));
    const longPdf = await generateFeedbackAnalyticsReportPdf(report([feedback({ feedbackText: 'A '.repeat(2_000), message: 'A '.repeat(2_000), text: 'A '.repeat(2_000) })]));

    expect(emptyPdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(longPdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(longPdf.length).toBeGreaterThan(emptyPdf.length);
  });
});
