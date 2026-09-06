import { describe, expect, it } from "vitest";

import {
  getFeedbackGenderGroup,
  resolveFeedbackSentimentLabel,
  summarizeFeedbackSentimentByRoom,
  summarizeFeedbackSentimentByGender,
  summarizeFeedbackSentiment,
} from "../lib/feedback/feedback-sentiment";
import { analyzeFeedbackText } from "../lib/feedback/feedback-analytics";

describe("feedback sentiment helpers", () => {
  it("falls back to the compound score when the stored label is missing", () => {
    expect(
      resolveFeedbackSentimentLabel({ compoundScore: 0.42 })
    ).toBe("positive");

    expect(
      resolveFeedbackSentimentLabel({
        compoundScore: -0.2,
        sentimentLabel: null,
      })
    ).toBe("negative");

    expect(
      resolveFeedbackSentimentLabel({
        compoundScore: 0.82,
        sentimentLabel: "positive",
      })
    ).toBe("very_positive");
  });

  it("preserves an explicit insufficient-context label over a stored VADER score", () => {
    expect(
      resolveFeedbackSentimentLabel({
        compoundScore: 0.4019,
        sentimentClassification: "insufficient_context",
      })
    ).toBe("insufficient_context");

    expect(
      resolveFeedbackSentimentLabel({
        compoundScore: -0.296,
        sentimentLabel: "insufficient_context",
      })
    ).toBe("insufficient_context");
  });

  it("honors a contextual final label while keeping the raw score available", () => {
    expect(
      resolveFeedbackSentimentLabel({
        compoundScore: -0.1027,
        contextualOverride: true,
        contextualOverrideReason: "contextual_response",
        sentimentClassification: "positive",
      })
    ).toBe("positive");

    expect(
      resolveFeedbackSentimentLabel({
        compoundScore: 0.4588,
        contextualOverride: true,
        contextualOverrideReason: "contrast_exception",
        sentimentClassification: "neutral",
      })
    ).toBe("neutral");

    expect(
      resolveFeedbackSentimentLabel({
        compoundScore: 0.4588,
        contextualOverride: false,
        sentimentClassification: "negative",
      })
    ).toBe("positive");
  });

  it("builds an aggregate sentiment summary for a building", () => {
    const summary = summarizeFeedbackSentiment([
      {
        compoundScore: 0.8,
        detectedAspects: {
          cleanliness: "positive",
          comfort: "positive",
        },
        sentimentLabel: "positive",
      },
      {
        compoundScore: -0.75,
        detected_aspects: {
          air_conditioning: "negative",
          internet: "negative",
        },
        sentimentLabel: "negative",
      },
      {
        compoundScore: 0.0,
        detectedAspects: {
          equipment: "positive",
        },
        sentimentLabel: "neutral",
      },
    ]);

    expect(summary).toMatchObject({
      averageCompoundScore: 0.017,
      negativeCount: 0,
      negativePercentage: 0,
      neutralCount: 1,
      neutralPercentage: 33.3,
      positiveCount: 0,
      positivePercentage: 0,
      total: 3,
      veryNegativeCount: 1,
      veryNegativePercentage: 33.3,
      veryPositiveCount: 1,
      veryPositivePercentage: 33.3,
    });

    expect(summary.sentimentDistribution).toEqual([
      { count: 1, label: "very_positive", percentage: 33.3 },
      { count: 0, label: "positive", percentage: 0 },
      { count: 1, label: "neutral", percentage: 33.3 },
      { count: 0, label: "negative", percentage: 0 },
      { count: 1, label: "very_negative", percentage: 33.3 },
      { count: 0, label: "insufficient_context", percentage: 0 },
    ]);
    expect(summary.mostMentionedIssues).toEqual([
      { aspect: "air_conditioning", count: 1, label: "Air Conditioning" },
      { aspect: "internet", count: 1, label: "Internet" },
    ]);
    expect(summary.mostPraisedAspects).toEqual([
      { aspect: "cleanliness", count: 1, label: "Cleanliness" },
      { aspect: "comfort", count: 1, label: "Comfort" },
      { aspect: "equipment", count: 1, label: "Equipment" },
    ]);
  });

  it("groups stored sentiment by room and keeps rooms without feedback visible", () => {
    const summaries = summarizeFeedbackSentimentByRoom(
      [
        { id: "room-101", name: "101" },
        { id: "room-102", name: "102" },
      ],
      [
        { roomId: "room-101", compoundScore: -0.8 },
        { roomId: "room-101", compoundScore: 0.4 },
      ]
    );

    expect(summaries[0]).toMatchObject({
      roomId: "room-101",
      roomName: "101",
      total: 2,
      summary: expect.objectContaining({
        averageCompoundScore: -0.2,
        total: 2,
      }),
    });
    expect(summaries[1]).toEqual({
      roomId: "room-102",
      roomName: "102",
      total: 0,
      summary: null,
    });
  });

  it("aggregates room aspects across feedback and supports the top-three display limit", () => {
    const summaries = summarizeFeedbackSentimentByRoom(
      [{ id: "room-101", name: "101" }],
      [
        {
          roomId: "room-101",
          compoundScore: 0.4,
          detectedAspects: {
            cleanliness: "positive",
            equipment: "positive",
            seating: "positive",
            lighting: "positive",
            comfort: "negative",
            air_conditioning: "negative",
            internet: "negative",
          },
        },
        {
          roomId: "room-101",
          compoundScore: -0.2,
          detected_aspects: {
            cleanliness: "positive",
            comfort: "negative",
            lighting: "negative",
          },
        },
      ]
    );

    const summary = summaries[0].summary;
    expect(summary).toBeTruthy();
    expect(summary?.total).toBe(2);
    expect(summary?.averageCompoundScore).toBe(0.1);
    expect(summary?.mostPraisedAspects.slice(0, 3)).toEqual([
      { aspect: "cleanliness", count: 2, label: "Cleanliness" },
      { aspect: "equipment", count: 1, label: "Equipment" },
      { aspect: "lighting", count: 1, label: "Lighting" },
    ]);
    expect(summary?.mostPraisedAspects.slice(0, 3)).toHaveLength(3);
    expect(summary?.mostMentionedIssues.slice(0, 3)).toEqual([
      { aspect: "comfort", count: 2, label: "Comfort" },
      { aspect: "air_conditioning", count: 1, label: "Air Conditioning" },
      { aspect: "internet", count: 1, label: "Internet" },
    ]);
    expect(summary?.mostMentionedIssues.slice(0, 3)).toHaveLength(3);
    expect([
      ...(summary?.mostPraisedAspects.slice(0, 3) ?? []),
      ...(summary?.mostMentionedIssues.slice(0, 3) ?? []),
    ]).toHaveLength(6);
  });

  it("returns no detected aspects for feedback without stored aspects", () => {
    const summaries = summarizeFeedbackSentimentByRoom(
      [{ id: "room-102", name: "102" }],
      [{ roomId: "room-102", compoundScore: 0.2 }]
    );

    expect(summaries[0]).toMatchObject({
      total: 1,
      summary: expect.objectContaining({
        mostPraisedAspects: [],
        mostMentionedIssues: [],
      }),
    });
  });

  it("detects room aspects and extracts reporting keywords", () => {
    const analytics = analyzeFeedbackText(
      "The room was clean and comfortable but the aircon was not cold."
    );

    expect(analytics.detectedAspects).toMatchObject({
      air_conditioning: "negative",
      cleanliness: "positive",
      comfort: "positive",
    });
    expect(analytics.extractedKeywords).toEqual(
      expect.arrayContaining(["aircon", "cleanliness", "comfort"])
    );
  });

  it("keeps overall sentiment analytics independent from gender grouping", () => {
    const summary = summarizeFeedbackSentiment([
      { compoundScore: 0.8, sentimentLabel: "very_positive" },
      { compoundScore: -0.8, sentimentLabel: "very_negative" },
    ]);

    expect(summary.genderBreakdown).toBeUndefined();
    expect(summary.total).toBe(2);
    expect(summary.averageCompoundScore).toBe(0);
    expect(summary.sentimentDistribution).toEqual([
      { count: 1, label: "very_positive", percentage: 50 },
      { count: 0, label: "positive", percentage: 0 },
      { count: 0, label: "neutral", percentage: 0 },
      { count: 0, label: "negative", percentage: 0 },
      { count: 1, label: "very_negative", percentage: 50 },
      { count: 0, label: "insufficient_context", percentage: 0 },
    ]);
  });

  it("groups supported genders and missing profiles as not specified", () => {
    expect(getFeedbackGenderGroup("male")).toBe("male");
    expect(getFeedbackGenderGroup("female")).toBe("female");
    expect(getFeedbackGenderGroup("non_binary")).toBe("non_binary");
    expect(getFeedbackGenderGroup("prefer_not_to_say")).toBe("prefer_not_to_say");
    expect(getFeedbackGenderGroup(undefined)).toBe("not_specified");
    expect(getFeedbackGenderGroup("invalid")).toBe("not_specified");

    const groups = summarizeFeedbackSentimentByGender([
      { compoundScore: 0.2, gender: "male" },
      { compoundScore: -0.2 },
    ]);

    expect(groups.map((group) => [group.group, group.total])).toEqual([
      ["male", 1],
      ["not_specified", 1],
    ]);
  });

  it("suppresses gender metrics for groups with fewer than five samples", () => {
    const groups = summarizeFeedbackSentimentByGender([
      ...Array.from({ length: 4 }, () => ({ compoundScore: 0.2, gender: "male" })),
      ...Array.from({ length: 5 }, () => ({ compoundScore: 0.2, gender: "female" })),
    ]);

    expect(groups).toEqual([
      expect.objectContaining({
        group: "male",
        total: 4,
        suppressed: true,
        summary: null,
      }),
      expect.objectContaining({
        group: "female",
        total: 5,
        suppressed: false,
        summary: expect.objectContaining({ total: 5 }),
      }),
    ]);
  });
});
