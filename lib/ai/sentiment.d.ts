export interface SentimentAnalysis {
  compound: number;
  positive: number;
  neutral: number;
  negative: number;
}

export interface HybridSentimentAnalysis extends SentimentAnalysis {
  isConflicted: boolean;
  sentimentLabel: HybridSentimentLabel;
  starScore: number;
  vaderCompound: number;
}

export type SentimentLabel = "positive" | "neutral" | "negative";
export type HybridSentimentLabel = SentimentLabel | "conflicted";

export const DEFAULT_SENTIMENT_ANALYSIS: Readonly<SentimentAnalysis>;
export const ROOM_SENTIMENT_LEXICON: Readonly<Record<string, number>>;

export function analyzeSentiment(
  text: string | null | undefined
): SentimentAnalysis;

export function analyzeFeedbackSentiment(
  text: string | null | undefined,
  rating: number | null | undefined
): HybridSentimentAnalysis;

export function getStarRatingSentimentScore(
  rating: number | null | undefined
): number;

export function averageSentimentScores(
  scores: Array<number | null | undefined>
): number;

export function getSentimentLabel(score: number): SentimentLabel;
