import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import type { Room } from '../lib/rooms/rooms';
import { parseScheduleWorkbook } from '../lib/schedules/excelScheduleImport';

const rooms = [
  {
    id: 'room-312',
    name: '312',
    buildingId: 'gd1',
    buildingName: 'GD1',
    floor: '3',
  },
] as Room[];

function createWorkbook(
  rows: unknown[][],
  merges: XLSX.Range[] = [],
  sheetName = 'Room 312'
) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!merges'] = merges;
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return workbook;
}

describe('Excel schedule import parser', () => {
  it('parses a merged multi-hour class block into one schedule row', () => {
    const workbook = createWorkbook(
      [
        ['Room 312'],
        [],
        ['Time', 'Monday', 'Tuesday'],
        ['8:00 AM - 9:00 AM', 'Introduction to Computing\nBSIT1A', ''],
        ['9:00 AM - 10:00 AM', '', ''],
      ],
      [{ s: { r: 3, c: 1 }, e: { r: 4, c: 1 } }]
    );

    const result = parseScheduleWorkbook(workbook, rooms);

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      roomId: 'room-312',
      roomName: '312',
      dayOfWeek: 1,
      dayName: 'Monday',
      startTime: '08:00',
      endTime: '10:00',
      subject: 'Introduction to Computing',
      section: 'BSIT1A',
    });
  });

  it('normalizes abbreviated days and afternoon times without meridiem text', () => {
    const workbook = createWorkbook([
      ['Room 312'],
      ['Time', 'Mon', 'Tue'],
      ['1:00 - 3:00', 'Data Structures\nBSIT2B', ''],
    ]);

    const result = parseScheduleWorkbook(workbook, rooms);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      dayOfWeek: 1,
      startTime: '13:00',
      endTime: '15:00',
      subject: 'Data Structures',
      section: 'BSIT2B',
    });
  });

  it('keeps rows but flags an unknown room from the sheet header', () => {
    const workbook = createWorkbook(
      [
        ['Room 999'],
        ['Time', 'Monday', 'Tuesday'],
        ['8:00 AM - 9:00 AM', 'Networking\nBSIT3A', ''],
      ],
      [],
      'Room 999'
    );

    const result = parseScheduleWorkbook(workbook, rooms);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].errors).toContain(
      'Room "999" was not found in this building.'
    );
  });

  it('parses row-based schedule lists without a Course Code column', () => {
    const workbook = createWorkbook([
      [],
      [
        'Room',
        'Professor',
        'Course Name',
        'Time',
        'Day',
        'Program and Section',
      ],
      [
        'GD3 312',
        'Prof. Reyes',
        'Software Engineering',
        '7:00 A.M. - 12:00 A.M.',
        'Monday',
        'BSIT 3A',
      ],
      [
        'GD3 312',
        'Prof. Cruz',
        'Database Systems',
        '1:00 P.M. - 5:00 P.M.',
        'Friday',
        'BSIT 3B',
      ],
    ]);

    const result = parseScheduleWorkbook(workbook, rooms);

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      roomId: 'room-312',
      courseCode: 'Software Engineering',
      instructorName: 'Prof. Reyes',
      dayOfWeek: 1,
      startTime: '07:00',
      endTime: '12:00',
      subject: 'Software Engineering',
      section: 'BSIT 3A',
    });
    expect(result.rows[1]).toMatchObject({
      dayOfWeek: 5,
      startTime: '13:00',
      endTime: '17:00',
    });
  });

  it('accepts Instructor as an alternative to the Professor column label', () => {
    const workbook = createWorkbook([
      ['Room', 'Instructor', 'Course Name', 'Time', 'Day', 'Program and Section'],
      ['312', 'Prof. Santos', 'Web Development', '8:00 AM - 9:00 AM', 'Monday', 'BSIT 2A'],
    ]);

    const result = parseScheduleWorkbook(workbook, rooms);

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      instructorName: 'Prof. Santos',
      subject: 'Web Development',
    });
  });

  it('parses letter weekday values in a Day column', () => {
    const workbook = createWorkbook([
      ['Room', 'Course Name', 'Time', 'Day', 'Program and Section'],
      ['312', 'Monday Class', '8:00 AM - 9:00 AM', 'M', 'BSIT 1A'],
      ['312', 'Tuesday Class', '9:00 AM - 10:00 AM', 'T', 'BSIT 1A'],
      ['312', 'Wednesday Class', '10:00 AM - 11:00 AM', 'W', 'BSIT 1A'],
      ['312', 'Thursday Class', '11:00 AM - 12:00 PM', 'H', 'BSIT 1A'],
      ['312', 'Friday Class', '1:00 PM - 2:00 PM', 'F', 'BSIT 1A'],
    ]);

    const result = parseScheduleWorkbook(workbook, rooms);

    expect(result.errors).toEqual([]);
    expect(result.rows.map((row) => row.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
    expect(result.rows.map((row) => row.dayName)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
    ]);
    expect(result.rows.every((row) => row.errors.length === 0)).toBe(true);
  });
});
