import { describe, expect, it } from 'vitest';
import {
  getWholeCampusBuildingIds,
  isWholeCampusFeedbackScope,
  WHOLE_CAMPUS_SCOPE_ID,
} from '../lib/feedback/feedback-campus-scope';
import { buildFeedbackLocationAnalytics } from '../lib/feedback/feedback-analytics';
import { scopeFeedbackToBuildings } from '../lib/feedback/feedback-period';
import { scopeFeedback } from '../lib/feedback/feedback-scope';

function feedback(input: Record<string, unknown> = {}) {
  return {
    id: String(input.id ?? 'review'),
    buildingId: 'gd1',
    buildingName: 'GD1',
    roomId: 'gd1-room-301',
    roomName: 'Room 301',
    rating: 4,
    compoundScore: 0.8,
    categoryRatings: {},
    detectedAspects: {},
    ...input,
  };
}

describe('Main Campus whole-campus feedback scope', () => {
  it('uses the authoritative GD1, GD2, and GD3 building assignments', () => {
    expect(getWholeCampusBuildingIds('main')).toEqual(['gd1', 'gd2', 'gd3']);
    expect(getWholeCampusBuildingIds('digi')).toEqual([]);
    expect(getWholeCampusBuildingIds(null)).toEqual([]);
  });

  it('only enables the whole-campus scope for Main Campus', () => {
    expect(isWholeCampusFeedbackScope(WHOLE_CAMPUS_SCOPE_ID, 'main')).toBe(true);
    expect(isWholeCampusFeedbackScope(WHOLE_CAMPUS_SCOPE_ID, 'digi')).toBe(false);
    expect(isWholeCampusFeedbackScope('gd1', 'main')).toBe(false);
  });

  it('aggregates feedback and floor/room filters across all Main Campus buildings', () => {
    const buildingIds = getWholeCampusBuildingIds('main');
    const rooms = buildingIds.map((buildingId) => ({
      id: `${buildingId}-room-301`,
      name: 'Room 301',
      buildingId,
      floor: '3rd Floor',
    }));
    const items = [
      feedback({ id: 'gd1-review', buildingId: 'gd1', roomId: 'gd1-room-301' }),
      feedback({ id: 'gd2-review', buildingId: 'gd2', roomId: 'gd2-room-301' }),
      feedback({ id: 'gd3-review', buildingId: 'gd3', roomId: 'gd3-room-301' }),
      feedback({ id: 'digi-review', buildingId: 'sdca-digital-campus' }),
    ];

    expect(scopeFeedbackToBuildings(items, buildingIds).map((item) => item.buildingId)).toEqual([
      'gd1',
      'gd2',
      'gd3',
    ]);
    expect(scopeFeedback(items, {
      buildingId: 'gd1',
      buildingIds,
      floor: '3rd Floor',
      rooms,
      scope: 'floor',
    })).toHaveLength(3);

    const analytics = buildFeedbackLocationAnalytics(items.slice(0, 3), [], rooms);
    expect(analytics.buildings.map((building) => building.id)).toEqual(['gd1', 'gd2', 'gd3']);
    expect(analytics.rooms).toHaveLength(3);
    expect(new Set(analytics.rooms.map((room) => room.id)).size).toBe(3);
    expect(new Set(analytics.rooms.map((room) => room.buildingId)).size).toBe(3);
  });
});
