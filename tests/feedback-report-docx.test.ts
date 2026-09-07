import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  buildFeedbackAnalyticsReport,
} from '../lib/feedback/feedback-report';
import {
  buildFeedbackDemographicAnalytics,
  buildFeedbackLocationAnalytics,
  compareCategoryPerformance,
  summarizeFeedbackAnalytics,
} from '../lib/feedback/feedback-analytics';
import { buildFeedbackInsights } from '../lib/feedback/feedback-insights';
import { summarizeFeedbackSentiment } from '../lib/feedback/feedback-sentiment';
import { buildSentimentTrend } from '../lib/feedback/feedback-trend';
import {
  generateFeedbackAnalyticsReportDocx,
  getFeedbackAnalyticsReportDocxFilename,
} from '../lib/feedback/feedback-report-docx';
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
    floor: '1',
    rating: 4,
    overallRating: 4,
    compoundScore: 0.8,
    vaderCompoundScore: 0.8,
    sentimentClassification: 'very_positive',
    categoryRatings: {
      cleanliness: 4,
      comfort: 4,
      air_conditioning: 4,
      equipment_projector: 4,
      internet_connectivity: 4,
    },
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
      scope: 'main-whole-campus',
      locationScope: 'building',
      floor: '',
      roomId: '',
      period: 'monthly',
      academicYear: 'A.Y. 2026-2027',
      semester: '1st Semester',
      star: null,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
      role: 'Student',
      gender: 'female',
    },
    scope: {
      type: 'whole_campus',
      selectedBuildingId: null,
      selectedBuildingLabel: 'Main Campus - Whole Campus',
      buildingIds: ['gd1', 'gd2', 'gd3'],
      buildings: [
        { id: 'gd1', label: 'GD1' },
        { id: 'gd2', label: 'GD2' },
        { id: 'gd3', label: 'GD3' },
      ],
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

async function readDocumentXml(bytes: Uint8Array) {
  const archive = await JSZip.loadAsync(bytes);
  const documentXml = archive.file('word/document.xml');
  if (!documentXml) throw new Error('Generated DOCX did not contain word/document.xml.');
  return documentXml.async('string');
}

describe('feedback analytics DOCX report', () => {
  it('generates a non-empty DOCX buffer from the shared report contract', async () => {
    const bytes = await generateFeedbackAnalyticsReportDocx(buildReport([feedback()]));

    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.length).toBeGreaterThan(2_000);
  });

  it('contains all report sections and preserves the six sentiment states', async () => {
    const bytes = await generateFeedbackAnalyticsReportDocx(buildReport([
      feedback({ id: 'gd1-review', sentimentClassification: 'very_positive', buildingId: 'gd1', buildingName: 'GD1' }),
      feedback({ id: 'gd2-review', sentimentClassification: 'positive', buildingId: 'gd2', buildingName: 'GD2', roomId: 'gd2-room-101' }),
      feedback({ id: 'neutral-review', sentimentClassification: 'neutral', compoundScore: 0, vaderCompoundScore: 0 }),
      feedback({ id: 'negative-review', sentimentClassification: 'negative', compoundScore: -0.4, vaderCompoundScore: -0.4 }),
      feedback({ id: 'gd3-review', sentimentClassification: 'very_negative', buildingId: 'gd3', buildingName: 'GD3', roomId: 'gd3-room-201', floor: '2', compoundScore: -0.8, vaderCompoundScore: -0.8 }),
      feedback({ id: 'insufficient-review', sentimentClassification: 'insufficient_context', compoundScore: 0.1, vaderCompoundScore: 0.1 }),
    ]));
    const xml = await readDocumentXml(bytes);

    for (const section of [
      'Feedback Analytics Findings Report',
      'Executive Overview',
      'Rating Analysis',
      'Sentiment Analysis',
      'Rating Trends',
      'Sentiment Trends',
      'Trends',
      'Room Analytics',
      'Location Performance',
      'Top Concerns',
      'Categories',
      'Demographics',
      'Actionable Insights',
      'Review Details',
    ]) {
      expect(xml).toContain(section);
    }

    for (const sentiment of [
      'Very Positive',
      'Positive',
      'Neutral',
      'Negative',
      'Very Negative',
      'Insufficient Context',
    ]) {
      expect(xml).toContain(sentiment);
    }

    expect(xml).toContain('GD1');
    expect(xml).toContain('GD2');
    expect(xml).toContain('GD3');
  });

  it('does not include privacy-sensitive identifiers', async () => {
    const bytes = await generateFeedbackAnalyticsReportDocx(buildReport([feedback()]));
    const xml = await readDocumentXml(bytes);

    expect(xml).not.toContain('private-user');
    expect(xml).not.toContain('private-reservation');
    expect(xml).not.toContain('Private Reviewer');
  });

  it('generates successfully for empty analytical data', async () => {
    const bytes = await generateFeedbackAnalyticsReportDocx(buildReport([]));
    const xml = await readDocumentXml(bytes);

    expect(bytes.length).toBeGreaterThan(2_000);
    expect(xml).toContain('No data available for the selected filters.');
    expect(xml).toContain('Insufficient Context');
  });

  it('uses a deterministic sanitized DOCX filename', () => {
    expect(getFeedbackAnalyticsReportDocxFilename(buildReport([]))).toBe(
      'feedback-analytics-main-campus-whole-campus-2026-09-07.docx',
    );
  });
});
