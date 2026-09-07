import { describe, expect, it } from 'vitest';

import { createFeedbackAnalyticsReportScope } from '../lib/feedback/feedback-report-dashboard';

describe('feedback dashboard report integration scope', () => {
  it('keeps Whole Campus limited to the dashboard-provided campus buildings', () => {
    const scope = createFeedbackAnalyticsReportScope({
      activeBuildingLabel: 'Main Campus — Whole Campus',
      activeFeedbackBuildingIds: ['gd1', 'gd2', 'gd3'],
      buildingId: 'gd1',
      feedbackScopeId: 'main-whole-campus',
      managedBuildings: [
        { id: 'gd1', name: 'GD1' },
        { id: 'gd2', name: 'GD2' },
        { id: 'gd3', name: 'GD3' },
        { id: 'digital', name: 'Digital Campus' },
      ],
      wholeCampusBuildingIds: ['gd1', 'gd2', 'gd3'],
    });

    expect(scope.type).toBe('whole_campus');
    expect(scope.buildingIds).toEqual(['gd1', 'gd2', 'gd3']);
    expect(scope.buildings).toEqual([
      { id: 'gd1', label: 'GD1' },
      { id: 'gd2', label: 'GD2' },
      { id: 'gd3', label: 'GD3' },
    ]);
    expect(scope.buildingIds).not.toContain('digital');
  });

  it('preserves the selected building scope and label', () => {
    const scope = createFeedbackAnalyticsReportScope({
      activeBuildingLabel: 'GD2',
      activeFeedbackBuildingIds: ['gd2'],
      buildingId: 'gd2',
      feedbackScopeId: 'gd2',
      managedBuildings: [{ id: 'gd2', name: 'GD2' }],
      wholeCampusBuildingIds: ['gd1', 'gd2', 'gd3'],
    });

    expect(scope).toMatchObject({
      type: 'building',
      selectedBuildingId: 'gd2',
      selectedBuildingLabel: 'GD2',
      buildingIds: ['gd2'],
    });
  });
});
