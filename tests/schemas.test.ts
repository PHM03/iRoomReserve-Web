import { describe, expect, it } from 'vitest';

import {
  adminRequestCreateSchema,
  createReservationSchema,
  feedbackCreateSchema,
  roomInputSchema,
  scheduleInputSchema,
} from '../lib/server/schemas';
import { validateScheduleTimes } from '../lib/schedules/scheduleTimeRules';

const approvalDocument = {
  approvalDocumentMimeType: 'application/pdf',
  approvalDocumentName: 'concept-paper.pdf',
  approvalDocumentPath: 'concept_papers/user-1/concept-paper.pdf',
  approvalDocumentSize: 1024,
  approvalDocumentUrl:
    'https://demo.supabase.co/storage/v1/object/sign/reservation-documents/reservations/pending/user-1/concept-paper.pdf?token=token',
};

describe('server schemas', () => {
  const validFacultyReservation = {
    userId: 'user-1',
    userName: 'Alex Faculty',
    userRole: 'Faculty Professor',
    roomId: 'room-1',
    roomName: 'Room 101',
    buildingId: 'building-1',
    buildingName: 'Main Building',
    campus: 'main',
    date: '2026-03-25',
    startTime: '08:00',
    endTime: '09:00',
    programDepartmentOrganization: 'BSIT',
    purpose: 'Study session',
    isEvent: 'No',
    advisorEmail: 'advisor@sdca.edu.ph',
    dsasEmail: 'dsas@sdca.edu.ph',
    registrarEmail: 'registrar@sdca.edu.ph',
    buildingAdminEmail: 'building-admin@sdca.edu.ph',
  };

  function parseOtherEquipmentReservation(
    otherEquipment?: unknown,
    equipment: Record<string, number> = {}
  ) {
    return createReservationSchema.safeParse({
      type: 'single',
      reservation: {
        ...validFacultyReservation,
        equipment,
        ...(otherEquipment !== undefined ? { otherEquipment } : {}),
      },
    });
  }

  it('preserves valid equipment quantities and accepts omitted other equipment', () => {
    const result = parseOtherEquipmentReservation(undefined, {
      fans: 0,
      speakers: 1,
      televisions: 0,
      hdmiCables: 0,
      monoblockChairs: 0,
      tables: 0,
    });

    expect(result.success).toBe(true);
  });

  it('rejects negative and fractional equipment quantities', () => {
    expect(parseOtherEquipmentReservation(undefined, { fans: -1 }).success).toBe(false);
    expect(parseOtherEquipmentReservation(undefined, { fans: 1.5 }).success).toBe(false);
  });

  it('trims valid other equipment text', () => {
    const result = parseOtherEquipmentReservation('  HDMI adapter  ');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reservation.otherEquipment).toBe('HDMI adapter');
    }
  });

  it('rejects whitespace-only and overlong other equipment text', () => {
    expect(parseOtherEquipmentReservation('     ').success).toBe(false);
    expect(parseOtherEquipmentReservation('x'.repeat(251)).success).toBe(false);
  });

  it('accepts a valid Main Campus single reservation payload', () => {
    const result = createReservationSchema.safeParse({
      type: 'single',
      reservation: {
        userId: 'user-1',
        userName: 'Alex Student',
        userRole: 'Student',
        roomId: 'room-1',
        roomName: 'Room 101',
        buildingId: 'building-1',
        buildingName: 'Main Building',
        campus: 'main',
        date: '2026-03-25',
        startTime: '08:00',
        endTime: '09:00',
        programDepartmentOrganization: 'BSIT',
        purpose: 'Study session',
        isEvent: 'Yes',
        ...approvalDocument,
        advisorEmail: 'advisor@sdca.edu.ph',
        dsasEmail: 'dsas@sdca.edu.ph',
        registrarEmail: 'registrar@sdca.edu.ph',
        buildingAdminEmail: 'building-admin@sdca.edu.ph',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts a valid Digi Campus single reservation payload', () => {
    const result = createReservationSchema.safeParse({
      type: 'single',
      reservation: {
        userId: 'user-1',
        userName: 'Alex Student',
        userRole: 'Student',
        roomId: 'room-1',
        roomName: 'Room 101',
        buildingId: 'building-2',
        buildingName: 'Digi Building',
        campus: 'digi',
        date: '2026-03-25',
        startTime: '08:00',
        endTime: '09:00',
        programDepartmentOrganization: 'BSIT',
        purpose: 'Study session',
        isEvent: 'No',
        ...approvalDocument,
        buildingAdminEmail: 'building-admin@sdca.edu.ph',
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects reservation event values other than Yes or No', () => {
    const result = createReservationSchema.safeParse({
      type: 'single',
      reservation: {
        userId: 'user-1',
        userName: 'Alex Faculty',
        userRole: 'Faculty Professor',
        roomId: 'room-1',
        roomName: 'Room 101',
        buildingId: 'building-1',
        buildingName: 'Main Building',
        campus: 'main',
        date: '2026-03-25',
        startTime: '08:00',
        endTime: '09:00',
        programDepartmentOrganization: 'BSIT',
        purpose: 'Study session',
        isEvent: 'Maybe',
      },
    });

    expect(result.success).toBe(false);
  });

  it('normalizes campus and user role aliases in reservation payloads', () => {
    const result = createReservationSchema.safeParse({
      type: 'single',
      reservation: {
        userId: 'user-1',
        userName: 'Alex Student',
        userRole: 'student',
        roomId: 'room-1',
        roomName: 'Room 101',
        buildingId: 'building-2',
        buildingName: 'Digi Building',
        campus: 'Digi Campus',
        date: '2026-03-25',
        startTime: '08:00',
        endTime: '09:00',
        programDepartmentOrganization: 'BSIT',
        purpose: 'Study session',
        ...approvalDocument,
        buildingAdminEmail: 'building-admin@sdca.edu.ph',
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects a reservation with an invalid role', () => {
    const result = createReservationSchema.safeParse({
      type: 'single',
      reservation: {
        userId: 'user-1',
        userName: 'Alex Student',
        userRole: 'Guest',
        roomId: 'room-1',
        roomName: 'Room 101',
        buildingId: 'building-1',
        buildingName: 'Main Building',
        campus: 'main',
        date: '2026-03-25',
        startTime: '08:00',
        endTime: '09:00',
        purpose: 'Study session',
        advisorEmail: 'advisor@sdca.edu.ph',
        dsasEmail: 'dsas@sdca.edu.ph',
        registrarEmail: 'registrar@sdca.edu.ph',
        buildingAdminEmail: 'building-admin@sdca.edu.ph',
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a Main Campus reservation when an approval email is missing', () => {
    const result = createReservationSchema.safeParse({
      type: 'single',
      reservation: {
        userId: 'user-1',
        userName: 'Alex Student',
        userRole: 'Student',
        roomId: 'room-1',
        roomName: 'Room 101',
        buildingId: 'building-1',
        buildingName: 'Main Building',
        campus: 'main',
        date: '2026-03-25',
        startTime: '08:00',
        endTime: '09:00',
        purpose: 'Study session',
        advisorEmail: 'advisor@sdca.edu.ph',
        dsasEmail: 'dsas@sdca.edu.ph',
        registrarEmail: 'registrar@sdca.edu.ph',
        buildingAdminEmail: '',
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a Digi Campus reservation when building admin email is missing', () => {
    const result = createReservationSchema.safeParse({
      type: 'single',
      reservation: {
        userId: 'user-1',
        userName: 'Alex Student',
        userRole: 'Student',
        roomId: 'room-1',
        roomName: 'Room 101',
        buildingId: 'building-2',
        buildingName: 'Digi Building',
        campus: 'digi',
        date: '2026-03-25',
        startTime: '08:00',
        endTime: '09:00',
        purpose: 'Study session',
        buildingAdminEmail: '',
      },
    });

    expect(result.success).toBe(false);
  });

  it('accepts valid admin request, feedback, room, and schedule payloads', () => {
    expect(
      adminRequestCreateSchema.safeParse({
        userId: 'user-1',
        userName: 'Alex Student',
        reservationId: null,
        type: 'general',
        subject: 'Need assistance',
        message: 'Please help with projector setup.',
        buildingId: 'building-1',
        buildingName: 'Main Building',
      }).success
    ).toBe(true);

    expect(
      feedbackCreateSchema.safeParse({
        roomId: 'room-1',
        roomName: 'Room 101',
        buildingId: 'building-1',
        buildingName: 'Main Building',
        reservationId: 'reservation-1',
        userId: 'user-1',
        userName: 'Alex Student',
        message: 'Room was clean and ready.',
        rating: 5,
        categoryRatings: {
          cleanliness: 5,
          comfort: 4,
          air_conditioning: 4,
          equipment_projector: 5,
          internet_connectivity: 4,
        },
      }).success
    ).toBe(true);

    expect(
      roomInputSchema.safeParse({
        name: 'Room 101',
        floor: '1st Floor',
        roomType: 'Classroom',
        acStatus: 'Working',
        tvProjectorStatus: 'Working',
        capacity: 30,
        status: 'Available',
        buildingId: 'building-1',
        buildingName: 'Main Building',
      }).success
    ).toBe(true);

    expect(
      roomInputSchema.safeParse({
        name: 'Room 102',
        floor: '2nd Floor',
        roomType: 'Classroom',
        acStatus: 'Working',
        tvProjectorStatus: 'Working',
        capacity: 30,
        status: 'Available',
        buildingId: 'building-1',
        buildingName: 'Main Building',
        bleBeaconId: 'HC-05-ROOM-102',
      }).success
    ).toBe(true);

    expect(
      scheduleInputSchema.safeParse({
        roomId: 'room-1',
        roomName: 'Room 101',
        buildingId: 'building-1',
        subjectName: 'IT 101',
        courseName: 'Introduction to Programming',
        courseCode: 'IT 101',
        section: 'BSIT 1A',
        instructorName: 'Prof. Reyes',
        professorEmail: 'reyes@sdca.edu.ph',
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '10:00',
        semester: '1st Semester',
        academicYear: 'A.Y. 2025-2026',
        createdBy: 'admin-1',
        overrideScheduleIds: ['schedule-previous'],
      }).success
    ).toBe(true);

    expect(
      scheduleInputSchema.safeParse({
        roomId: 'room-1', roomName: 'Room 101', buildingId: 'building-1',
        subjectName: 'IT 101', courseName: 'Introduction to Programming',
        courseCode: 'IT 101', section: 'BSIT 1A', instructorName: 'Prof. Reyes',
        professorEmail: 'reyes@example.com', dayOfWeek: 1, startTime: '08:00',
        endTime: '10:00', semester: '1st Semester', academicYear: 'A.Y. 2025-2026',
        createdBy: 'admin-1',
      }).success
    ).toBe(false);
  });

  it('rejects schedules whose end time is not later than the start time', () => {
    expect(validateScheduleTimes('10:00', '09:00', 'main')).toBe(
      'End time must be later than start time.'
    );
    expect(validateScheduleTimes('10:00', '10:00', 'main')).toBe(
      'End time must be later than start time.'
    );
  });
});
