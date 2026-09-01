import { describe, expect, it } from "vitest";

import {
  buildRoomFeedbackSummaries,
  buildRoomFeedbackSummary,
  type RoomFeedbackSummaryInput,
} from "../lib/feedback/feedback-summaries";

function feedback(
  overrides: Partial<RoomFeedbackSummaryInput> = {},
): RoomFeedbackSummaryInput {
  return {
    roomId: "room-101",
    overallRating: 4,
    compoundScore: 0.2,
    detectedAspects: {},
    ...overrides,
  };
}

describe("room feedback summaries", () => {
  it("maps room-level averages, sentiment rates, and top aspects", () => {
    const summary = buildRoomFeedbackSummary("room-101", [
      feedback({
        overallRating: 5,
        compoundScore: 0.8,
        detectedAspects: {
          cleanliness: "positive",
          comfort: "positive",
        },
      }),
      feedback({
        overallRating: 4,
        compoundScore: -0.4,
        detectedAspects: {
          air_conditioning: "negative",
          comfort: "negative",
        },
      }),
    ]);

    expect(summary).toEqual({
      roomId: "room-101",
      reviewCount: 2,
      averageRating: 4.5,
      averageVaderScore: 0.2,
      positiveRate: 50,
      negativeRate: 50,
      topPositiveAspects: ["Cleanliness", "Comfort"],
      topNegativeAspects: ["Air Conditioning", "Comfort"],
    });
  });

  it("keeps no-feedback summaries empty and does not invent metrics", () => {
    const summary = buildRoomFeedbackSummary("room-101", []);

    expect(summary).toEqual({
      roomId: "room-101",
      reviewCount: 0,
      averageRating: null,
      averageVaderScore: null,
      positiveRate: 0,
      negativeRate: 0,
      topPositiveAspects: [],
      topNegativeAspects: [],
    });
  });

  it("does not turn missing sentiment into positive or negative sentiment", () => {
    const summary = buildRoomFeedbackSummary("room-101", [
      feedback({
        compoundScore: undefined,
        sentimentLabel: undefined,
        sentimentClassification: undefined,
      }),
    ]);

    expect(summary.averageVaderScore).toBeNull();
    expect(summary.positiveRate).toBe(0);
    expect(summary.negativeRate).toBe(0);
  });

  it("preserves review counts below and above the existing five-review threshold", () => {
    const limited = buildRoomFeedbackSummary(
      "room-101",
      Array.from({ length: 4 }, () => feedback()),
    );
    const normal = buildRoomFeedbackSummary(
      "room-101",
      Array.from({ length: 5 }, () => feedback()),
    );

    expect(limited.reviewCount).toBe(4);
    expect(normal.reviewCount).toBe(5);
    expect(limited).not.toHaveProperty("reliable");
    expect(normal).not.toHaveProperty("reliable");
  });

  it("returns summaries only for requested room ids", () => {
    const summaries = buildRoomFeedbackSummaries(
      ["room-101", "room-101", "room-102"],
      [
        feedback({ roomId: "room-101" }),
        feedback({ roomId: "room-999" }),
      ],
    );

    expect(summaries.map((summary) => summary.roomId)).toEqual([
      "room-101",
      "room-102",
    ]);
    expect(summaries[1].reviewCount).toBe(0);
    expect(Object.keys(summaries[0])).toEqual([
      "roomId",
      "reviewCount",
      "averageRating",
      "averageVaderScore",
      "positiveRate",
      "negativeRate",
      "topPositiveAspects",
      "topNegativeAspects",
    ]);
  });
});
