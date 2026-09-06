import { describe, expect, it } from 'vitest';

import {
  analyzeFeedbackSentiment,
  analyzeSentiment,
  averageSentimentScores,
  getSentimentLabel,
  getStarRatingSentimentScore,
} from '../lib/ai/sentiment';
import { analyzeFeedbackText } from '../lib/feedback/feedback-analytics';

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

  it('marks only bare yes/no responses as insufficient context', () => {
    for (const text of ['Yes', 'yes', 'YES', 'Yes.', ' yes ! ', 'No', 'no', 'NO', 'No.', ' no ! ']) {
      const result = analyzeFeedbackText(text);
      expect(result.sentimentClassification).toBe('insufficient_context');
      expect(result.sentiment.compound).not.toBe(0);
    }

    for (const text of [
      'Yes, the room was clean.',
      'Yes, the room was comfortable.',
      'No, the room was dirty.',
      'No, the projector was broken.',
      'Yes, but the aircon was broken.',
    ]) {
      expect(analyzeFeedbackText(text).sentimentClassification).not.toBe('insufficient_context');
    }
  });

  it('preserves existing standalone sentiment-word behavior', () => {
    expect(analyzeFeedbackText('Good').sentimentClassification).toBe('positive');
    expect(analyzeFeedbackText('Bad').sentimentClassification).toBe('negative');
    expect(analyzeFeedbackText('Fine').sentimentClassification).toBe('positive');
    expect(analyzeFeedbackText('Okay').sentimentClassification).toBe('positive');
    expect(analyzeFeedbackText('Clean').sentimentClassification).toBe('positive');
    expect(analyzeFeedbackText('Dirty').sentimentClassification).toBe('negative');
  });

  it('applies conservative contextual overrides without changing raw VADER scores', () => {
    const cases = [
      ['The room is no longer dirty.', 'positive', true, 'negation_context'],
      ["That wasn't bad.", 'positive', false, null],
      ['Not bad.', 'neutral', true, 'not_bad_idiom'],
      ['Not too bad.', 'neutral', true, 'not_bad_idiom'],
      ["It wasn't bad at all.", 'positive', false, null],
      ['The room was not dirty.', 'positive', false, null],
      ["The room wasn't uncomfortable.", 'positive', false, null],
      ['The room was not clean.', 'negative', false, null],
      ['I expected better.', 'negative', true, 'expectation_language'],
      ['I expected much better.', 'negative', true, 'expectation_language'],
      ['I expected more.', 'negative', true, 'expectation_language'],
      ['I thought it would be better.', 'negative', true, 'expectation_language'],
      ['Could have been better.', 'negative', true, 'expectation_language'],
      ['The room was clean. The projector was broken.', 'negative', true, 'mixed_feedback'],
      ['The room was clean. However, the projector was broken.', 'negative', true, 'mixed_feedback'],
      ['Everything was fine. The aircon was not working.', 'negative', true, 'negation_context'],
      ['Everything was excellent except the projector.', 'neutral', true, 'contrast_exception'],
    ] as const;

    for (const [text, expectedLabel, expectedOverride, expectedReason] of cases) {
      const result = analyzeFeedbackText(text);
      const raw = analyzeSentiment(text);

      expect(result.sentimentClassification, text).toBe(expectedLabel);
      expect(result.contextualOverride, text).toBe(expectedOverride);
      expect(result.contextualOverrideReason, text).toBe(expectedReason);
      expect(result.sentiment.compound, text).toBe(raw.compound);
    }
  });

  it('uses contextual response content instead of the leading Yes/No marker', () => {
    expect(analyzeFeedbackText('No, everything was fine.')).toMatchObject({
      sentimentClassification: 'positive',
      contextualOverride: true,
      contextualOverrideReason: 'contextual_response',
      sentiment: { compound: -0.1027 },
    });

    expect(analyzeFeedbackText('No, the room was dirty.')).toMatchObject({
      sentimentClassification: 'negative',
      contextualOverride: false,
    });

    expect(analyzeFeedbackText('Yes, but the aircon was broken.')).toMatchObject({
      sentimentClassification: 'negative',
      contextualOverride: false,
    });
  });

  it('corrects only the obvious negation contradictions in aspect sentiment', () => {
    expect(analyzeFeedbackText('The room was not dirty.').detectedAspects).toMatchObject({
      cleanliness: 'positive',
    });
    expect(analyzeFeedbackText("The room wasn't uncomfortable.").detectedAspects).toMatchObject({
      comfort: 'positive',
    });
    expect(analyzeFeedbackText('The room was not clean.').detectedAspects).toMatchObject({
      cleanliness: 'negative',
    });
  });

  it('covers the Phase 2 semantic matrix without changing ordinary VADER labels', () => {
    const expectedLabels = new Map([
      ['The room was clean.', 'positive'],
      ['The room was very clean.', 'positive'],
      ['Everything was excellent.', 'positive'],
      ['The room was comfortable and clean.', 'very_positive'],
      ['The room was dirty.', 'negative'],
      ['The room was very dirty.', 'negative'],
      ['The projector was broken.', 'negative'],
      ['The room was uncomfortable.', 'negative'],
      ['The room was not dirty.', 'positive'],
      ['The room was not clean.', 'negative'],
      ["The room wasn't bad.", 'positive'],
      ["The room wasn't very good.", 'negative'],
      ["The room wasn't uncomfortable.", 'positive'],
      ['The room is no longer dirty.', 'positive'],
      ["That wasn't bad.", 'positive'],
      ['Not bad.', 'neutral'],
      ['Not too bad.', 'neutral'],
      ['The room was clean but the projector was broken.', 'negative'],
      ['The room was good but the aircon was terrible.', 'negative'],
      ['The room was good, however the aircon was terrible.', 'negative'],
      ['Everything was excellent except the projector.', 'neutral'],
      ['The room was okay, but the chairs were uncomfortable.', 'negative'],
      ['The room was clean. The projector was broken.', 'negative'],
      ['The room was clean. However, the projector was broken.', 'negative'],
      ['Everything was fine. The aircon was not working.', 'negative'],
      ['The room looked great, but the temperature was uncomfortable.', 'negative'],
      ['Yes, the room was clean.', 'very_positive'],
      ['No, the room was dirty.', 'negative'],
      ['Yes, but the aircon was broken.', 'negative'],
      ['No, everything was fine.', 'positive'],
      ['No, the room was actually clean.', 'positive'],
      ['Yes, the room was clean and comfortable.', 'very_positive'],
      ["No, the projector wasn't working.", 'negative'],
      ['I expected better.', 'negative'],
      ['I expected much better.', 'negative'],
      ['I expected more.', 'negative'],
      ['I thought it would be better.', 'negative'],
      ['Could have been better.', 'negative'],
      ['very clean', 'positive'],
      ['extremely good', 'positive'],
      ['really bad', 'negative'],
      ['slightly uncomfortable', 'negative'],
      ['a little dirty', 'negative'],
      ['not very clean', 'negative'],
    ] as const);

    expectedLabels.forEach((expectedLabel, text) => {
      const result = analyzeFeedbackText(text);
      expect(result.sentimentClassification, text).toBe(expectedLabel);
      expect(result.sentiment.compound, text).toEqual(analyzeSentiment(text).compound);
    });

    for (const text of ['Yes', 'yes', 'YES', 'Yes.', 'No', 'no', 'NO', 'No.']) {
      expect(analyzeFeedbackText(text).sentimentClassification, text).toBe('insufficient_context');
    }
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
