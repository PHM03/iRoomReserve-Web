import { describe, expect, it } from "vitest";

import {
  getFeedbackGenderGroup,
  resolveFeedbackSentimentLabel,
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
