import { describe, expect, it } from 'vitest';

import {
  analyzeSentiment,
  averageSentimentScores,
  getSentimentLabel,
} from '../lib/sentiment';

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

  it('labels compound scores using the configured thresholds', () => {
    expect(getSentimentLabel(0.05)).toBe('positive');
    expect(getSentimentLabel(-0.05)).toBe('negative');
    expect(getSentimentLabel(0.01)).toBe('neutral');
  });

  it('averages stored compound scores for room recommendation inputs', () => {
    expect(averageSentimentScores([0.7, 0.1, -0.2])).toBeCloseTo(0.2, 5);
    expect(averageSentimentScores([2, -2])).toBe(0);
    expect(averageSentimentScores([])).toBe(0);
  });
});
