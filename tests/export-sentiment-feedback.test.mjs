import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildExportArtifactsFromDocuments,
  exportFeedback,
  getFeedbackText,
} from "../scripts/export-sentiment-feedback.mjs";

describe("sentiment feedback exporter", () => {
  it("extracts only normalized feedback text and skips empty or duplicate text", () => {
    const artifacts = buildExportArtifactsFromDocuments(
      [
        {
          id: "doc-1",
          userId: "user-1",
          roomId: "room-1",
          rating: 1,
          feedback_text: "  Great   study room.  ",
        },
        {
          id: "doc-2",
          userName: "Sensitive Name",
          reservationId: "reservation-1",
          createdAt: "2026-01-01",
          feedbackText: "Great study room.",
        },
        {
          text: "Email test@example.edu about the broken projector.",
          sentimentLabel: "negative",
          compoundScore: -0.5,
        },
        {
          message: "   ",
        },
        {
          rating: 5,
        },
      ],
      {
        outputPath: "data/sentiment-evaluation.csv",
        piiReviewPath: "reports/sentiment-evaluation-pii-review.json",
        fixturePath: "local-fixture.json",
        dryRun: true,
      }
    );

    expect(artifacts.csv).toBe(
      [
        "text,humanLabel",
        '"Great study room.",',
        '"Email test@example.edu about the broken projector.",',
        "",
      ].join("\n")
    );
    expect(artifacts.summary).toMatchObject({
      firestoreDocumentsInspected: 5,
      nonEmptyFeedbackTextsExported: 2,
      skippedEmptyOrNonStringFeedback: 2,
      duplicateFeedbackTextsSkipped: 1,
      humanLabelsGenerated: false,
      firestoreDocumentsModified: false,
    });
    expect(artifacts.piiReview.flaggedRows).toEqual([
      {
        rowNumber: 3,
        flags: ["email"],
      },
    ]);
    expect(JSON.stringify(artifacts.piiReview)).not.toContain(
      "test@example.edu"
    );
    expect(JSON.stringify(artifacts.piiReview)).not.toContain(
      "Email test@example.edu about the broken projector."
    );
  });

  it("does not fall back to metadata fields when feedback text is absent", () => {
    expect(
      getFeedbackText({
        userName: "Someone",
        roomName: "Lab 1",
        reservationId: "reservation-1",
        documentId: "doc-1",
      })
    ).toBe("");
  });

  it("writes local fixture output without contacting Firestore", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "sentiment-export-test-")
    );
    const fixturePath = path.join(tempDirectory, "fixture.json");
    const outputPath = path.join(tempDirectory, "nested", "evaluation.csv");
    const piiReviewPath = path.join(tempDirectory, "reports", "pii.json");

    await writeFile(
      fixturePath,
      JSON.stringify([{ message: "Clean, quiet room." }])
    );

    const summary = await exportFeedback({
      outputPath,
      piiReviewPath,
      fixturePath,
      dryRun: false,
    });

    expect(summary).toMatchObject({
      fixturePath,
      nonEmptyFeedbackTextsExported: 1,
      firestoreDocumentsModified: false,
    });
    expect(await readFile(outputPath, "utf8")).toBe(
      'text,humanLabel\n"Clean, quiet room.",\n'
    );
    expect(JSON.parse(await readFile(piiReviewPath, "utf8"))).toMatchObject({
      flaggedRows: [],
      humanLabelsGenerated: false,
      firestoreDocumentsModified: false,
    });
  });

  it("keeps Firestore access read-only and limited to the feedback collection", async () => {
    const source = await readFile(
      path.join(process.cwd(), "scripts", "export-sentiment-feedback.mjs"),
      "utf8"
    );

    expect(source).toContain('.collection("feedback")');
    expect(source).not.toMatch(/\.collection\("(?!feedback")[^"]+"\)/);
    expect(source).not.toMatch(
      /collection\([^)]*\)[\s\S]{0,120}\.(add|set|update|delete|create)\s*\(/
    );
    expect(source).not.toContain("writeBatch");
  });
});
