export interface SentimentAnalysis {
  compound: number;
  positive: number;
  neutral: number;
  negative: number;
}

export type SentimentLabel = "positive" | "neutral" | "negative";

export const DEFAULT_SENTIMENT_ANALYSIS: Readonly<SentimentAnalysis>;

export function analyzeSentiment(
  text: string | null | undefined
): SentimentAnalysis;

export function averageSentimentScores(
  scores: Array<number | null | undefined>
): number;

export function getSentimentLabel(score: number): SentimentLabel;
