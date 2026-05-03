import { describe, expect, it } from "vitest";

import {
  resolveFeedbackSentimentLabel,
  summarizeFeedbackSentiment,
} from "../lib/feedback-sentiment";

describe("feedback sentiment helpers", () => {
  it("falls back to the compound score when the stored label is missing", () => {
    expect(
      resolveFeedbackSentimentLabel({
        compoundScore: 0.42,
      })
    ).toBe("positive");

    expect(
      resolveFeedbackSentimentLabel({
        compoundScore: -0.2,
        sentimentLabel: null,
      })
    ).toBe("negative");
  });

  it("builds an aggregate sentiment summary for a building", () => {
    const summary = summarizeFeedbackSentiment([
      {
        compoundScore: 0.8,
        sentimentLabel: "positive"
      },
      {
        compoundScore: -0.5,
        sentimentLabel: "negative"
      },
      {
        compoundScore: 0.0,
        sentimentLabel: "neutral"
      },
    ]);

    expect(summary).toEqual({
      averageCompoundScore: 0.1,
      negativeCount: 1,
      negativePercentage: 33.3,
      neutralCount: 1,
      neutralPercentage: 33.3,
      positiveCount: 1,
      positivePercentage: 33.3,
      total: 3,
    });
  });
});
