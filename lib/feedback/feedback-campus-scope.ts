import {
  getManagedBuildingIdsForCampus,
} from '../buildings/campusAssignments';
import type { ReservationCampus } from '../buildings/campuses';

export const WHOLE_CAMPUS_SCOPE_ID = 'main-whole-campus';

export function getWholeCampusBuildingIds(campus?: ReservationCampus | null) {
  return campus === 'main' ? getManagedBuildingIdsForCampus(campus) : [];
}

export function isWholeCampusFeedbackScope(
  scopeId: string,
  campus?: ReservationCampus | null,
) {
  return campus === 'main' && scopeId === WHOLE_CAMPUS_SCOPE_ID;
}
