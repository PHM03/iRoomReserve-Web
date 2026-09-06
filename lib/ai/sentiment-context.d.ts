import type { SentimentAnalysis, SentimentLabel } from "./sentiment";

export type SentimentContextOverrideReason =
  | "bare_yes_no"
  | "contextual_response"
  | "contrast_exception"
  | "expectation_language"
  | "mixed_feedback"
  | "negation_context"
  | "not_bad_idiom"
  | null;

export interface SentimentContextInterpretation {
  sentimentLabel: SentimentLabel;
  contextualOverride: boolean;
  contextualOverrideReason: SentimentContextOverrideReason;
}

export function getNegatedCuePolarity(
  text: string,
  positiveCues?: string[],
  negativeCues?: string[],
): "positive" | "negative" | null;

export function interpretSentimentContext(
  text: string | null | undefined,
  rawSentiment: SentimentAnalysis,
): SentimentContextInterpretation;
