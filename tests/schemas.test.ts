import { describe, expect, it } from 'vitest';

import {
  adminRequestCreateSchema,
  createReservationSchema,
  feedbackCreateSchema,
  roomInputSchema,
  scheduleInputSchema,
} from '../lib/server/schemas';

describe('server schemas', () => {
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
        buildingAdminEmail: 'building-admin@sdca.edu.ph',
      },
    });

    expect(result.success).toBe(true);
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
        instructorName: 'Prof. Reyes',
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '10:00',
        createdBy: 'admin-1',
      }).success
    ).toBe(true);
  });
});
