import { describe, expect, it } from 'vitest';

import {
  createRoomRecommendationEngine,
  examplePreferences,
  exampleRooms,
  exampleTimeslot,
  generateReason,
  runRecommendationExamples,
} from '../lib/roomRecommendations';

const availabilityByRoomId: Record<string, boolean> = {
  'glass-101': false,
  'glass-102': true,
  'lecture-201': true,
  'lab-301': true,
  'lecture-105': true,
};

const recommendationEngine = createRoomRecommendationEngine(
  (roomId: string) => availabilityByRoomId[roomId] ?? true
);

type RecommendationResult = {
  reason: string;
  roomId: string;
  score: number;
};

describe('roomRecommendations', () => {
  it('returns the selected room when it is already available', () => {
    const availableEngine = createRoomRecommendationEngine(
      (roomId: string) => roomId === 'glass-101'
    );

    const result = availableEngine.recommendRooms(
      exampleRooms[0],
      exampleTimeslot,
      exampleRooms
    );

    expect(Array.isArray(result)).toBe(false);
    expect(result).toEqual(exampleRooms[0]);
  });

  it('returns the top three alternatives when the selected room is unavailable', () => {
    const result = recommendationEngine.recommendRooms(
      exampleRooms[0],
      exampleTimeslot,
      exampleRooms
    );

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    expect((result as RecommendationResult[]).map((room) => room.roomId)).toEqual([
      'glass-102',
      'lab-301',
      'lecture-105',
    ]);
    expect((result as RecommendationResult[])[0].reason).toContain('also a glass room');
  });

  it('finds the best rooms for Help Me Choose preferences', () => {
    const result = recommendationEngine.findBestRooms(
      examplePreferences,
      exampleTimeslot,
      exampleRooms
    );

    expect(result).toHaveLength(3);
    expect((result as RecommendationResult[]).map((room) => room.roomId)).toEqual([
      'lecture-201',
      'lecture-105',
      'lab-301',
    ]);
    expect((result as RecommendationResult[])[0].score).toBeGreaterThan(
      (result as RecommendationResult[])[1].score
    );
  });

  it('prevents duplicate room ids in recommendation results', () => {
    const duplicatedRooms = [
      ...exampleRooms,
      {
        ...exampleRooms[1]
      },
      {
        ...exampleRooms[2]
      },
    ];

    const result = recommendationEngine.findBestRooms(
      examplePreferences,
      exampleTimeslot,
      duplicatedRooms
    );

    expect(new Set(result.map((room) => room.roomId)).size).toBe(result.length);
  });

  it('generates human-readable reasons for selected room alternatives', () => {
    const reason = generateReason(exampleRooms[0], exampleRooms[1]);

    expect(reason).toContain('Recommended because');
    expect(reason).toContain('also a glass room');
    expect(reason).toContain('available at your selected time');
  });

  it('generates preference-based reasons for Help Me Choose results', () => {
    const reason = generateReason(examplePreferences, exampleRooms[2]);

    expect(reason).toContain('matches your preferred lecture room type');
    expect(reason).toContain('meets your preferred capacity');
    expect(reason).toContain('includes AC and Projector');
  });

  it('includes runnable example calls for both features', () => {
    const examples = runRecommendationExamples();

    expect(Array.isArray(examples.autoRecommendationExample)).toBe(true);
    expect(examples.autoRecommendationExample[0].roomId).toBe('glass-102');
    expect(examples.helpMeChooseExample[0].roomId).toBe('lecture-201');
  });
});
