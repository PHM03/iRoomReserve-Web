import { describe, expect, it } from 'vitest';

import {
  buildFeedbackAnalyticsReport,
  buildFeedbackRatingDistribution,
  createFeedbackAnalyticsReportFilters,
  type FeedbackAnalyticsReportFilters,
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
import type { Feedback } from '../lib/feedback/feedback';

function feedback(input: Record<string, unknown> = {}): Feedback {
  return {
    id: String(input.id ?? 'review'),
    reservationId: 'reservation-1',
    userId: 'user-1',
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

function filters(overrides: Partial<FeedbackAnalyticsReportFilters> = {}) {
  return createFeedbackAnalyticsReportFilters({
    scope: 'main-whole-campus',
    locationScope: 'building',
    floor: '',
    roomId: '',
    period: 'semester',
    academicYear: 'A.Y. 2026-2027',
    semester: '1st Semester',
    star: null,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
    role: 'Student',
    gender: 'female',
    ...overrides,
  });
}

function buildReport(items: ReturnType<typeof feedback>[]) {
  const rooms = [
    { id: 'gd1-room-101', name: 'Room 101', buildingId: 'gd1', floor: '1' },
    { id: 'gd2-room-101', name: 'Room 101', buildingId: 'gd2', floor: '1' },
    { id: 'gd3-room-201', name: 'Room 201', buildingId: 'gd3', floor: '2' },
  ];
  const metrics = summarizeFeedbackAnalytics(items);
  const sentimentSummary = summarizeFeedbackSentiment(items);
  const previousItems: typeof items = [];
  const locationAnalytics = buildFeedbackLocationAnalytics(items, previousItems, rooms, false);
  const insights = buildFeedbackInsights(items, previousItems, false, rooms);

  return buildFeedbackAnalyticsReport({
    filteredFeedback: items,
    filters: filters(),
    scope: {
      type: 'whole_campus',
      selectedBuildingId: null,
      selectedBuildingLabel: 'Main Campus — Whole Campus',
      buildingIds: ['gd1', 'gd2', 'gd3'],
      buildings: [
        { id: 'gd1', label: 'GD1' },
        { id: 'gd2', label: 'GD2' },
        { id: 'gd3', label: 'GD3' },
      ],
    },
    metrics,
    sentimentSummary,
    categoryPerformance: compareCategoryPerformance(items, previousItems, false),
    locationAnalytics,
    demographicAnalytics: buildFeedbackDemographicAnalytics(items),
    trend: buildSentimentTrend(items as never, 'all_time', new Date('2026-08-31T12:00:00Z')),
    insights,
    generatedAt: '2026-09-01T00:00:00Z',
  });
}

describe('feedback analytics report foundation', () => {
  it('builds a serializable report from existing analytics state', () => {
    const report = buildReport([
      feedback({ id: 'gd1-review', overallRating: 5, rating: 5 }),
      feedback({ id: 'gd2-review', buildingId: 'gd2', buildingName: 'GD2', roomId: 'gd2-room-101', overallRating: 3, rating: 3, compoundScore: 0, vaderCompoundScore: 0, sentimentClassification: 'neutral' }),
    ]);

    expect(report.metadata).toMatchObject({
      title: 'Feedback Analytics Findings Report',
      generatedAt: '2026-09-01T00:00:00.000Z',
      period: 'semester',
      academicYear: 'A.Y. 2026-2027',
      semester: '1st Semester',
    });
    expect(report.overview).toMatchObject({
      totalReviews: 2,
      averageRating: 4,
      positiveCount: 1,
      neutralCount: 1,
      insufficientContextCount: 0,
    });
    expect(report.ratingAnalysis.distribution[5].count).toBe(1);
    expect(report.sentimentAnalysis.distribution).toHaveLength(6);
    expect(report.reviews[0]).not.toHaveProperty('userId');
    expect(report.reviews[0]).not.toHaveProperty('reservationId');
    expect(report.reviews[0]).not.toHaveProperty('userName');
    expect(report.roomAnalytics.rooms.map((room) => room.buildingId)).toEqual([
      'gd1',
      'gd2',
      'gd3',
    ]);
    expect(JSON.stringify(report)).not.toContain('Private Reviewer');
  });

  it('counts valid ratings 1 through 5 and ignores invalid ratings safely', () => {
    const result = buildFeedbackRatingDistribution([
      feedback({ overallRating: 1, rating: 1 }),
      feedback({ overallRating: 2, rating: 2 }),
      feedback({ overallRating: 3, rating: 3 }),
      feedback({ overallRating: 4, rating: 4 }),
      feedback({ overallRating: 5, rating: 5 }),
      feedback({ overallRating: 0, rating: 0 }),
      feedback({ overallRating: undefined, rating: undefined }),
    ]);

    expect(result.validRatingCount).toBe(5);
    expect(Object.values(result.distribution).map((item) => item.count)).toEqual([1, 1, 1, 1, 1]);
    expect(Object.values(result.percentages)).toEqual([20, 20, 20, 20, 20]);
  });

  it('keeps insufficient context separate and preserves existing rate denominators', () => {
    const report = buildReport([
      feedback({ compoundScore: 0.8, vaderCompoundScore: 0.8, sentimentClassification: 'very_positive' }),
      feedback({ compoundScore: 0.4, vaderCompoundScore: 0.4, sentimentClassification: 'insufficient_context' }),
      feedback({ compoundScore: -0.8, vaderCompoundScore: -0.8, sentimentClassification: 'very_negative' }),
    ]);

    expect(report.overview).toMatchObject({
      positiveCount: 1,
      negativeCount: 1,
      neutralCount: 0,
      insufficientContextCount: 1,
      positiveRate: 50,
      negativeRate: 50,
      insufficientContextRate: 33.3,
    });
    expect(report.sentimentAnalysis.distribution.find((item) => item.label === 'insufficient_context')).toMatchObject({
      count: 1,
      percentage: 33.3,
    });
    expect(report.sentimentAnalysis.distribution.find((item) => item.label === 'neutral')).toMatchObject({
      count: 0,
    });
  });

  it('captures every current filter value explicitly', () => {
    const report = buildReport([feedback()]);

    expect(report.metadata.filters).toEqual(filters());
    expect(report.metadata.scope).toMatchObject({
      type: 'whole_campus',
      buildingIds: ['gd1', 'gd2', 'gd3'],
    });
  });

  it('preserves Whole Campus building identity when names and floors repeat', () => {
    const report = buildReport([
      feedback({ id: 'gd1-room', buildingId: 'gd1', buildingName: 'GD1', roomId: 'gd1-room-101', roomName: 'Room 101' }),
      feedback({ id: 'gd2-room', buildingId: 'gd2', buildingName: 'GD2', roomId: 'gd2-room-101', roomName: 'Room 101' }),
    ]);

    expect(report.reviews.map((review) => [review.buildingId, review.roomName])).toEqual([
      ['gd1', 'Room 101'],
      ['gd2', 'Room 101'],
    ]);
    expect(report.roomAnalytics.rooms.filter((room) => room.name === 'Room 101').map((room) => room.buildingId)).toEqual([
      'gd1',
      'gd2',
    ]);
  });

  it('handles an empty filtered dataset without non-finite values', () => {
    const report = buildReport([]);

    expect(report.overview).toMatchObject({
      totalReviews: 0,
      averageRating: null,
      averageSentimentScore: 0,
      positiveRate: 0,
      neutralRate: 0,
      negativeRate: 0,
      insufficientContextRate: 0,
    });
    expect(report.ratingAnalysis.validRatingCount).toBe(0);
    expect(Object.values(report.ratingAnalysis.percentages)).toEqual([0, 0, 0, 0, 0]);
    expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity/);
  });

  it('matches the existing analytics helpers for dashboard parity', () => {
    const items = [feedback({ overallRating: 5, rating: 5 }), feedback({ overallRating: 1, rating: 1, compoundScore: -0.8, vaderCompoundScore: -0.8, sentimentClassification: 'very_negative' })];
    const report = buildReport(items);
    const metrics = summarizeFeedbackAnalytics(items);
    const summary = summarizeFeedbackSentiment(items);

    expect(report.overview).toMatchObject({
      totalReviews: metrics.totalReviews,
      averageRating: metrics.averageRating,
      positiveCount: metrics.positiveCount,
      neutralCount: metrics.neutralCount,
      negativeCount: metrics.negativeCount,
      insufficientContextCount: metrics.insufficientContextCount,
      positiveRate: metrics.positiveRate,
      neutralRate: metrics.neutralRate,
      negativeRate: metrics.negativeRate,
      insufficientContextRate: metrics.insufficientContextRate,
      averageSentimentScore: summary.averageCompoundScore,
    });
    expect(report.sentimentAnalysis.distribution).toEqual(summary.sentimentDistribution);
  });
});
