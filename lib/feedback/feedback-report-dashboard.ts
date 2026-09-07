import { WHOLE_CAMPUS_SCOPE_ID } from './feedback-campus-scope';
import type {
  FeedbackAnalyticsReportScope,
} from './feedback-report';

export interface FeedbackReportBuildingOption {
  id: string;
  name: string;
}

export interface FeedbackDashboardReportScopeInput {
  activeBuildingLabel: string;
  activeFeedbackBuildingIds: readonly string[];
  buildingId: string;
  feedbackScopeId: string;
  managedBuildings: readonly FeedbackReportBuildingOption[];
  wholeCampusBuildingIds: readonly string[];
}

/**
 * Converts the dashboard's current building selection into the report scope
 * without changing the dashboard's existing campus-selection behavior.
 */
export function createFeedbackAnalyticsReportScope({
  activeBuildingLabel,
  activeFeedbackBuildingIds,
  buildingId,
  feedbackScopeId,
  managedBuildings,
  wholeCampusBuildingIds,
}: FeedbackDashboardReportScopeInput): FeedbackAnalyticsReportScope {
  const isWholeCampus =
    feedbackScopeId === WHOLE_CAMPUS_SCOPE_ID && wholeCampusBuildingIds.length > 0;
  const buildingIds = [
    ...(isWholeCampus ? wholeCampusBuildingIds : activeFeedbackBuildingIds),
  ];
  const buildings = buildingIds.map((id) => ({
    id,
    label: managedBuildings.find((building) => building.id === id)?.name ?? id,
  }));

  return {
    type: isWholeCampus ? 'whole_campus' : 'building',
    selectedBuildingId: isWholeCampus ? null : buildingId || null,
    selectedBuildingLabel: activeBuildingLabel,
    buildingIds,
    buildings,
  };
}
