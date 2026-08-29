import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { getAssignedRoomDisplayLabel } from '../lib/schedules/assignedRoomSchedule';

function room(input: Partial<Parameters<typeof getAssignedRoomDisplayLabel>[0]>) {
  return {
    id: input.id ?? 'room-id',
    name: input.name ?? 'Room',
    floor: input.floor ?? '5',
    roomType: 'Classroom',
    acStatus: 'Working',
    tvProjectorStatus: 'Working',
    capacity: 30,
    status: 'Available' as const,
    buildingId: input.buildingId ?? 'gd3',
    buildingName: input.buildingName ?? 'Main Campus',
    reservedBy: null,
  };
}

describe('assigned-room schedule UI data', () => {
  it('removes Faculty integration while retaining the Utility schedule surface', () => {
    const facultyDashboard = readFileSync(
      resolve(process.cwd(), 'components', 'dashboards', 'FacultyDashboard.tsx'),
      'utf8'
    );
    const memberDashboard = readFileSync(
      resolve(process.cwd(), 'components', 'dashboards', 'MemberDashboard.tsx'),
      'utf8'
    );
    const scheduleSection = readFileSync(
      resolve(process.cwd(), 'components', 'schedules', 'AssignedRoomScheduleSection.tsx'),
      'utf8'
    );

    expect(facultyDashboard).toContain('showScheduleManagement');
    expect(memberDashboard).toContain('AssignedRoomScheduleSection');
    expect(memberDashboard).toContain('showScheduleManagement');
    expect(scheduleSection).toContain('Faculty Professor');
    expect(scheduleSection).toContain('Utility Staff');
    expect(scheduleSection).toContain('readOnly={isUtilityStaff}');
  });

  it('shows room and campus context in the selector label', () => {
    expect(
      getAssignedRoomDisplayLabel(
        room({
          name: '201',
          floor: '2',
          buildingName: 'Digi Campus',
        })
      )
    ).toBe('201 · 2 — Digi Campus');
  });
});
