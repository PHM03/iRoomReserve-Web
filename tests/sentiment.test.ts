import { describe, expect, it } from 'vitest';

import {
  analyzeFeedbackSentiment,
  analyzeSentiment,
  averageSentimentScores,
  getSentimentLabel,
  getStarRatingSentimentScore,
} from '../lib/ai/sentiment';

describe('sentiment', () => {
  it('returns a safe neutral result for empty input', () => {
    expect(analyzeSentiment('')).toEqual({
      compound: 0,
      positive: 0,
      neutral: 1,
      negative: 0,
    });
  });

  it('detects positive and negative room feedback', () => {
    const positive = analyzeSentiment('The room was bright, clean, and excellent.');
    const negative = analyzeSentiment('The room was dirty, noisy, and awful.');

    expect(positive.compound).toBeGreaterThan(0.05);
    expect(negative.compound).toBeLessThan(-0.05);
  });

  it('uses the room-specific VADER lexicon overrides', () => {
    expect(analyzeSentiment('The room was hot and dark.').compound).toBeLessThan(-0.05);
    expect(analyzeSentiment('The room was spacious and quiet.').compound).toBeGreaterThan(0.05);
  });

  it('maps star ratings to sentiment scores', () => {
    expect(getStarRatingSentimentScore(1)).toBe(-1);
    expect(getStarRatingSentimentScore(2)).toBe(-0.5);
    expect(getStarRatingSentimentScore(3)).toBe(0);
    expect(getStarRatingSentimentScore(4)).toBe(0.5);
    expect(getStarRatingSentimentScore(5)).toBe(1);
  });

  it('combines star and VADER scores into a hybrid compound score', () => {
    const vader = analyzeSentiment('The room was dark.');
    const hybrid = analyzeFeedbackSentiment('The room was dark.', 5);

    expect(hybrid.starScore).toBe(1);
    expect(hybrid.isConflicted).toBe(false);
    expect(hybrid.vaderCompound).toBe(vader.compound);
    expect(hybrid.compound).toBeCloseTo(0.4 * 1 + 0.6 * vader.compound, 5);
  });

  it('flags conflicts and trusts VADER more when stars and text strongly disagree', () => {
    const positiveStarsNegativeText = analyzeFeedbackSentiment(
      'The room was trash, dirty, noisy, smelly, and uncomfortable.',
      5
    );
    const negativeStarsPositiveText = analyzeFeedbackSentiment(
      'The room was clean, comfortable, excellent, and perfect.',
      1
    );

    expect(positiveStarsNegativeText.vaderCompound).toBeLessThan(-0.5);
    expect(positiveStarsNegativeText.isConflicted).toBe(true);
    expect(positiveStarsNegativeText.sentimentLabel).toBe('conflicted');
    expect(positiveStarsNegativeText.compound).toBeCloseTo(
      0.2 * 1 + 0.8 * positiveStarsNegativeText.vaderCompound,
      5
    );

    expect(negativeStarsPositiveText.vaderCompound).toBeGreaterThan(0.5);
    expect(negativeStarsPositiveText.isConflicted).toBe(true);
    expect(negativeStarsPositiveText.sentimentLabel).toBe('conflicted');
    expect(negativeStarsPositiveText.compound).toBeCloseTo(
      0.2 * -1 + 0.8 * negativeStarsPositiveText.vaderCompound,
      5
    );
  });

  it('labels compound scores using the configured thresholds', () => {
    expect(getSentimentLabel(0.65)).toBe('very_positive');
    expect(getSentimentLabel(0.05)).toBe('positive');
    expect(getSentimentLabel(-0.05)).toBe('negative');
    expect(getSentimentLabel(-0.65)).toBe('very_negative');
    expect(getSentimentLabel(0.01)).toBe('neutral');
  });

  it('averages stored compound scores for room recommendation inputs', () => {
    expect(averageSentimentScores([0.7, 0.1, -0.2])).toBeCloseTo(0.2, 5);
    expect(averageSentimentScores([2, -2])).toBe(0);
    expect(averageSentimentScores([])).toBe(0);
  });
});
