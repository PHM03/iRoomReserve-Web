import vader from "vader-sentiment";
import { lexicon as vaderLexicon } from "vader-sentiment/src/vader_lexicon.js";

export const DEFAULT_SENTIMENT_ANALYSIS = Object.freeze({
  compound: 0,
  positive: 0,
  neutral: 1,
  negative: 0,
});

export const ROOM_SENTIMENT_LEXICON = Object.freeze({
  trash: -2.0,
  dirty: -2.0,
  broken: -1.5,
  noisy: -1.5,
  smelly: -1.5,
  uncomfortable: -1.5,
  hot: -1.0,
  cold: -1.0,
  dark: -1.0,
  clean: 2.0,
  comfortable: 2.0,
  spacious: 1.5,
  quiet: 1.5,
  bright: 1.5,
  excellent: 2.0,
  perfect: 2.0,
});

const POSITIVE_THRESHOLD = 0.05;
const NEGATIVE_THRESHOLD = -0.05;
const STAR_RATING_WEIGHT = 0.4;
const VADER_TEXT_WEIGHT = 0.6;
const CONFLICT_STAR_RATING_WEIGHT = 0.2;
const CONFLICT_VADER_TEXT_WEIGHT = 0.8;
const VADER_CONFLICT_THRESHOLD = 0.5;
const B_INCR = 0.293;
const B_DECR = -0.293;
const C_INCR = 0.733;
const REGEX_REMOVE_PUNCTUATION = /[!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]/g;
const PUNC_LIST = Object.freeze([
  ".",
  "!",
  "?",
  ",",
  ";",
  ":",
  "-",
  "'",
  '"',
  "!!",
  "!!!",
  "??",
  "???",
  "?!?",
  "!?!",
  "?!?!",
  "!?!?",
]);
const BOOSTER_DICT = Object.freeze({
  absolutely: B_INCR,
  amazingly: B_INCR,
  awfully: B_INCR,
  completely: B_INCR,
  considerably: B_INCR,
  decidedly: B_INCR,
  deeply: B_INCR,
  effing: B_INCR,
  enormously: B_INCR,
  entirely: B_INCR,
  especially: B_INCR,
  exceptionally: B_INCR,
  extremely: B_INCR,
  fabulously: B_INCR,
  flipping: B_INCR,
  flippin: B_INCR,
  fricking: B_INCR,
  frickin: B_INCR,
  frigging: B_INCR,
  friggin: B_INCR,
  fully: B_INCR,
  fucking: B_INCR,
  greatly: B_INCR,
  hella: B_INCR,
  highly: B_INCR,
  hugely: B_INCR,
  incredibly: B_INCR,
  intensely: B_INCR,
  majorly: B_INCR,
  more: B_INCR,
  most: B_INCR,
  particularly: B_INCR,
  purely: B_INCR,
  quite: B_INCR,
  really: B_INCR,
  remarkably: B_INCR,
  so: B_INCR,
  substantially: B_INCR,
  thoroughly: B_INCR,
  totally: B_INCR,
  tremendously: B_INCR,
  uber: B_INCR,
  unbelievably: B_INCR,
  unusually: B_INCR,
  utterly: B_INCR,
  very: B_INCR,
  almost: B_DECR,
  barely: B_DECR,
  hardly: B_DECR,
  "just enough": B_DECR,
  "kind of": B_DECR,
  kinda: B_DECR,
  kindof: B_DECR,
  "kind-of": B_DECR,
  less: B_DECR,
  little: B_DECR,
  marginally: B_DECR,
  occasionally: B_DECR,
  partly: B_DECR,
  scarcely: B_DECR,
  slightly: B_DECR,
  somewhat: B_DECR,
  "sort of": B_DECR,
  sorta: B_DECR,
  sortof: B_DECR,
  "sort-of": B_DECR,
});
const CUSTOMIZED_VADER_LEXICON = Object.freeze({
  ...vaderLexicon,
  ...ROOM_SENTIMENT_LEXICON,
});
const sentimentAnalyzer = vader.SentimentIntensityAnalyzer;

function normalizeText(text) {
  return typeof text === "string" ? text.trim() : "";
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function clampScore(score, min = 0, max = 1) {
  if (!Number.isFinite(score)) {
    return min;
  }

  return Math.max(min, Math.min(max, score));
}

function isUpperPython(word) {
  return (
    (typeof word === "string" || word instanceof String) &&
    word.length > 0 &&
    /^[^a-z]*[A-Z]+[^a-z]*$/g.test(word)
  );
}

function allcapDifferential(words) {
  const allcapWords = words.filter(isUpperPython).length;
  const capDifferential = words.length - allcapWords;

  return capDifferential > 0 && capDifferential < words.length;
}

function scalarIncDec(word, valence, isCapDiff) {
  let scalar = 0;
  const wordLower = word.toLowerCase();

  if (hasOwn(BOOSTER_DICT, wordLower)) {
    scalar = BOOSTER_DICT[wordLower];

    if (valence < 0) {
      scalar *= -1;
    }

    if (isCapDiff && isUpperPython(word)) {
      scalar += valence > 0 ? C_INCR : -C_INCR;
    }
  }

  return scalar;
}

class SentiText {
  constructor(text) {
    this.text = text;
    this.words_and_emoticons = this.getWordsAndEmoticons();
    this.is_cap_diff = allcapDifferential(this.words_and_emoticons);
  }

  getWordsPlusPunc() {
    const noPuncText = this.text.slice(0).replace(REGEX_REMOVE_PUNCTUATION, "");
    const wordsOnly = noPuncText.split(/\s/).filter((word) => word.length > 1);
    const wordsPuncDict = {};

    PUNC_LIST.forEach((punctuation) => {
      wordsOnly.forEach((word) => {
        wordsPuncDict[`${punctuation}${word}`] = word;
        wordsPuncDict[`${word}${punctuation}`] = word;
      });
    });

    return wordsPuncDict;
  }

  getWordsAndEmoticons() {
    const wordsPuncDict = this.getWordsPlusPunc();

    return this.text
      .split(/\s/)
      .filter((token) => token.length > 1)
      .map((token) => wordsPuncDict[token] ?? token);
  }
}

function sentimentValence(valence, sentiText, item, index, sentiments) {
  const isCapDiff = sentiText.is_cap_diff;
  const wordsAndEmoticons = sentiText.words_and_emoticons;
  const itemLowercase = item.toLowerCase();

  if (hasOwn(CUSTOMIZED_VADER_LEXICON, itemLowercase)) {
    valence = CUSTOMIZED_VADER_LEXICON[itemLowercase];

    if (isUpperPython(item) && isCapDiff) {
      valence += valence > 0 ? C_INCR : -C_INCR;
    }

    for (let startIndex = 0; startIndex < 3; startIndex += 1) {
      const priorWord = wordsAndEmoticons[index - (startIndex + 1)];

      if (
        index > startIndex &&
        !hasOwn(CUSTOMIZED_VADER_LEXICON, priorWord.toLowerCase())
      ) {
        let scalar = scalarIncDec(priorWord, valence, isCapDiff);

        if (startIndex === 1 && scalar !== 0) {
          scalar *= 0.95;
        } else if (startIndex === 2 && scalar !== 0) {
          scalar *= 0.9;
        }

        valence += scalar;
        valence = sentimentAnalyzer.never_check(
          valence,
          wordsAndEmoticons,
          startIndex,
          index
        );

        if (startIndex === 2) {
          valence = sentimentAnalyzer.idioms_check(
            valence,
            wordsAndEmoticons,
            index
          );
        }
      }
    }

    valence = sentimentAnalyzer.least_check(valence, wordsAndEmoticons, index);
  }

  sentiments.push(valence);
  return sentiments;
}

function polarityScoresWithRoomLexicon(text) {
  const sentiText = new SentiText(text);
  const wordsAndEmoticons = sentiText.words_and_emoticons;
  let sentiments = [];

  for (let index = 0; index < wordsAndEmoticons.length; index += 1) {
    let valence = 0;
    const item = wordsAndEmoticons[index];
    const itemLowercase = item.toLowerCase();

    if (
      (index < wordsAndEmoticons.length - 1 &&
        itemLowercase === "kind" &&
        wordsAndEmoticons[index + 1].toLowerCase() === "of") ||
      hasOwn(BOOSTER_DICT, itemLowercase)
    ) {
      sentiments.push(valence);
      continue;
    }

    sentiments = sentimentValence(valence, sentiText, item, index, sentiments);
  }

  sentiments = sentimentAnalyzer.but_check(wordsAndEmoticons, sentiments);
  return sentimentAnalyzer.score_valence(sentiments, text);
}

/**
 * VADER is a pure JavaScript library, so this helper is safe to reuse
 * from Next.js client components, server routes, and Firebase helpers.
 */
export function analyzeSentiment(text) {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return { ...DEFAULT_SENTIMENT_ANALYSIS };
  }

  const scores = polarityScoresWithRoomLexicon(normalizedText);

  return {
    compound: clampScore(scores.compound, -1, 1),
    positive: clampScore(scores.pos),
    neutral: clampScore(scores.neu),
    negative: clampScore(scores.neg),
  };
}

export function getStarRatingSentimentScore(rating) {
  const numericRating = Number(rating);

  if (!Number.isFinite(numericRating)) {
    return 0;
  }

  const roundedRating = Math.round(numericRating);

  if (roundedRating < 1 || roundedRating > 5) {
    return 0;
  }

  return (roundedRating - 3) / 2;
}

function hasSentimentConflict(starScore, vaderCompound) {
  return (
    (starScore >= 0.5 && vaderCompound < -VADER_CONFLICT_THRESHOLD) ||
    (starScore <= -0.5 && vaderCompound > VADER_CONFLICT_THRESHOLD)
  );
}

export function analyzeFeedbackSentiment(text, rating) {
  const vaderSentiment = analyzeSentiment(text);
  const starScore = getStarRatingSentimentScore(rating);
  const isConflicted = hasSentimentConflict(
    starScore,
    vaderSentiment.compound
  );
  const starWeight = isConflicted
    ? CONFLICT_STAR_RATING_WEIGHT
    : STAR_RATING_WEIGHT;
  const vaderWeight = isConflicted
    ? CONFLICT_VADER_TEXT_WEIGHT
    : VADER_TEXT_WEIGHT;
  const compound = clampScore(
    starWeight * starScore + vaderWeight * vaderSentiment.compound,
    -1,
    1
  );

  return {
    ...vaderSentiment,
    compound,
    isConflicted,
    starScore,
    sentimentLabel: isConflicted ? "conflicted" : getSentimentLabel(compound),
    vaderCompound: vaderSentiment.compound,
  };
}

export function averageSentimentScores(scores) {
  const validScores = Array.isArray(scores)
    ? scores.filter((score) => Number.isFinite(score))
    : [];

  if (validScores.length === 0) {
    return 0;
  }

  const total = validScores.reduce(
    (sum, score) => sum + clampScore(score, -1, 1),
    0
  );

  return total / validScores.length;
}

export function getSentimentLabel(score) {
  if (!Number.isFinite(score)) {
    return "neutral";
  }

  if (score >= POSITIVE_THRESHOLD) {
    return "positive";
  }

  if (score <= NEGATIVE_THRESHOLD) {
    return "negative";
  }

  return "neutral";
}
